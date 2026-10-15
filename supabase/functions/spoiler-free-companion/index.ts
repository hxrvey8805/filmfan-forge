import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COMPANION_VERSION, SUBTITLE_VERSION, conversationMemory, formatTimestamp,
  parseTimestamp, unavailableMemoryReply,
  type Conversation, type Evidence, type EvidenceCoverage, type SubtitleRecord, type ViewingPosition,
} from "../_shared/companion.ts";

import { checkedAnswer } from "../_shared/answer.ts";
import { companionEvidenceBudget, companionGenerator } from "../_shared/companion-provider.ts";
import { selectSceneContext, subtitleSearchText } from "../_shared/scene-evidence.ts";

import { assertSubtitlePreparation, SubtitleProviderError } from "../_shared/subtitle-provider.ts";

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const columns = 'id, tmdb_id, media_type, season_number, episode_number, ingestion_version, cues, start_seconds, end_seconds';

function currentChunks(db: SupabaseClient, position: ViewingPosition) {
  let query = db.from('subtitle_chunks').select(columns).eq('tmdb_id', position.tmdbId)
    .eq('media_type', position.mediaType).eq('ingestion_version', SUBTITLE_VERSION);
  if (position.mediaType === 'tv') query = query.eq('season_number', position.seasonNumber!).eq('episode_number', position.episodeNumber!);
  return query;
}

async function ensureCurrentSubtitles(db: SupabaseClient, position: ViewingPosition): Promise<void> {
  const existing = await currentChunks(db, position).limit(1);
  if (existing.error) throw existing.error;
  if (existing.data?.length) return;
  // Prepare only this episode, not every preceding episode during a question.
  try {
    const prepared = await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-subtitles`, {
      method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: position.tmdbId, mediaType: position.mediaType,
        seasonNumber: position.seasonNumber, episodeNumber: position.episodeNumber }),
      signal: AbortSignal.timeout(45000),
    });
    await assertSubtitlePreparation(prepared);
  } catch (error) {
    if (error instanceof SubtitleProviderError) throw error;
    throw new SubtitleProviderError('provider_error', 'prepare');
  }
}

async function retrieve(db: SupabaseClient, position: ViewingPosition, question: string, memory: Conversation[]) {
  const searchText = subtitleSearchText(question, memory, position);
  const [prefix, relevant] = await Promise.all([
    // Rank the permitted prefix at cue level, including the boundary chunk.
    // Future cues are removed before excerpts, keyword scoring, or sampling.
    currentChunks(db, position).lte('start_seconds', position.seconds)
      .order('start_seconds', { ascending: true }).limit(1000),
    db.rpc('match_companion_chunks', { p_tmdb_id: position.tmdbId, p_media_type: position.mediaType,
      p_current_season: position.seasonNumber ?? 0, p_current_episode: position.episodeNumber ?? 0,
      p_max_seconds: position.seconds, p_question: searchText, p_embedding: null }),
  ]);
  if (prefix.error) throw prefix.error;
  if (relevant.error) throw relevant.error;
  return selectSceneContext([...(prefix.data ?? []), ...(relevant.data ?? [])] as unknown as SubtitleRecord[],
    position, question, memory, companionEvidenceBudget(name => Deno.env.get(name)));
}

serve(async req => {
  if (req.method === 'OPTIONS') return new Response(null, { headers });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const authorization = req.headers.get('Authorization');
    if (!authorization) return json({ error: 'Please log in.' }, 401);
    const userDb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authorization } } });
    const { data: { user }, error: authError } = await userDb.auth.getUser();
    if (authError || !user) return json({ error: 'Please log in.' }, 401);
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    const { tmdbId, mediaType, seasonNumber, episodeNumber, timestamp, question, requestId } = body;
    const seconds = parseTimestamp(timestamp);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !['tv', 'movie'].includes(mediaType) ||
        seconds === null || typeof question !== 'string' || !question.trim() || question.length > 2000 ||
        (mediaType === 'tv' && (!Number.isInteger(seasonNumber) || seasonNumber < 0 || !Number.isInteger(episodeNumber) || episodeNumber < 1)) ||
        (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId)))) {
      return json({ error: 'Choose a title and episode, enter a valid MM:SS or HH:MM:SS timestamp, and ask a question (up to 2,000 characters).' }, 400);
    }
    const position: ViewingPosition = { tmdbId, mediaType, seconds,
      ...(mediaType === 'tv' ? { seasonNumber, episodeNumber } : {}) };
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const id = requestId ?? crypto.randomUUID();
    const prior = await userDb.from('ai_conversations').select('*').eq('id', id).eq('companion_version', COMPANION_VERSION).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) {
      // An ID cannot be reused to retrieve a future or different title's answer.
      if (prior.data.title_id !== tmdbId || prior.data.media_type !== mediaType || prior.data.position_seconds !== seconds ||
          prior.data.season_number !== (position.seasonNumber ?? null) || prior.data.episode_number !== (position.episodeNumber ?? null) || prior.data.question !== question.trim()) {
        return json({ error: 'Request ID already used for a different question.' }, 409);
      }
      return json({ answer: prior.data.answer, conversation: prior.data, usedCoins: 0 });
    }
    let historyQuery = userDb.from('ai_conversations').select('*').eq('title_id', tmdbId)
      .eq('media_type', mediaType).eq('companion_version', COMPANION_VERSION)
      .eq('answer_status', 'answered').lte('position_seconds', seconds);
    if (mediaType === 'tv') historyQuery = historyQuery.eq('season_number', seasonNumber).eq('episode_number', episodeNumber);
    const historyResult = await historyQuery.order('created_at', { ascending: false }).limit(30);
    if (historyResult.error) throw historyResult.error;
    const memory = conversationMemory((historyResult.data ?? []) as Conversation[], position);
    const memoryReply = unavailableMemoryReply(question.trim(), position, memory);
    let evidence: Evidence[] = [];
    let coverage: EvidenceCoverage | undefined;
    if (!memoryReply) {
      await ensureCurrentSubtitles(db, position);
      ({ evidence, coverage } = await retrieve(db, position, question.trim(), memory));
    }
    let checked = null;
    if (evidence.length) {
      const generate = companionGenerator(name => Deno.env.get(name));
      checked = await checkedAnswer(question.trim(), position, evidence, memory, generate,
        diagnostic => console.info('Companion answer check', { requestId: id, ...diagnostic,
          evidenceChars: JSON.stringify(evidence).length, omittedPassages: coverage?.omittedPassages }), coverage);
    }
    const answer = memoryReply ?? checked?.answer ?? (evidence.length
      ? `I can’t establish that from the dialogue available up to ${formatTimestamp(seconds)}. I’ll leave it uncertain rather than guess at the scene or use later events.`
      : `I don’t have reliable dialogue available up to ${formatTimestamp(seconds)} for this title yet. I can’t give a grounded answer at this point.`);
    const context = `${mediaType === 'tv' ? `S${seasonNumber}E${episodeNumber} ` : ''}@ ${formatTimestamp(seconds)}`;
    const saved = await db.rpc('record_companion_answer', { p_user_id: user.id, p_charge: checked !== null,
      p_conversation: { id, title_id: tmdbId, media_type: mediaType, season_number: position.seasonNumber ?? null,
        episode_number: position.episodeNumber ?? null, position_seconds: seconds, timestamp: formatTimestamp(seconds),
        question: question.trim(), answer, context, evidence: checked?.evidence ?? [],
        answer_status: checked ? 'answered' : 'insufficient_evidence' } });
    if (saved.error) {
      if (saved.error.message.includes('Insufficient coins')) return json({ error: 'You need 150 coins for another question.' }, 402);
      throw saved.error;
    }
    return json({ ...saved.data, answer: saved.data.conversation.answer,
      status: saved.data.conversation.answer_status, evidence: saved.data.conversation.evidence, boundary: position });
  } catch (error) {
    console.error('Companion request failed', error instanceof Error ? error.message : 'database error');
    return json({ error: error instanceof Error ? error.message : 'Unable to answer right now. Please try again.' }, 503);
  }
});
