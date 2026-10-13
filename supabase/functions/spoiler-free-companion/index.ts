import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  COMPANION_VERSION, conversationMemory, formatTimestamp,
  parseTimestamp, questionIntent, safeEvidence,
  type Conversation, type SubtitleRecord, type ViewingPosition,
} from "../_shared/companion.ts";

import { checkedAnswer } from "../_shared/answer.ts";

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const columns = 'id, tmdb_id, media_type, season_number, episode_number, ingestion_version, cues, start_seconds, end_seconds';

function currentChunks(db: SupabaseClient, position: ViewingPosition) {
  let query = db.from('subtitle_chunks').select(columns).eq('tmdb_id', position.tmdbId)
    .eq('media_type', position.mediaType).eq('ingestion_version', COMPANION_VERSION);
  if (position.mediaType === 'tv') query = query.eq('season_number', position.seasonNumber!).eq('episode_number', position.episodeNumber!);
  return query;
}

async function ensureCurrentSubtitles(db: SupabaseClient, position: ViewingPosition): Promise<void> {
  const existing = await currentChunks(db, position).limit(1);
  if (existing.error) throw existing.error;
  if (existing.data?.length) return;
  // Prepare only this episode, not every preceding episode during a question.
  try {
    await fetch(`${Deno.env.get('SUPABASE_URL')}/functions/v1/process-subtitles`, {
      method: 'POST', headers: { Authorization: `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tmdbId: position.tmdbId, mediaType: position.mediaType,
        seasonNumber: position.seasonNumber, episodeNumber: position.episodeNumber }),
      signal: AbortSignal.timeout(45000),
    });
  } catch { /* Fail closed below if the cache is still unavailable. */ }
}

async function embedQuestion(text: string): Promise<number[] | null> {
  const key = Deno.env.get('OPENAI_API_KEY');
  if (!key) return null;
  try {
    const response = await fetch('https://api.openai.com/v1/embeddings', {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'text-embedding-3-small', input: text.slice(0, 8000) }),
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) return null;
    const vector = (await response.json()).data?.[0]?.embedding;
    return Array.isArray(vector) && vector.length === 1536 ? vector : null;
  } catch { return null; }
}

async function retrieve(db: SupabaseClient, position: ViewingPosition, question: string, memory: Conversation[]) {
  const searchText = [...memory.slice(-2).map(row => `${row.question}\n${row.answer}`), question].join('\n');
  const embedding = await embedQuestion(searchText);
  const intent = questionIntent(question);
  const [recent, relevant, beginning] = await Promise.all([
    // This may overlap the boundary, so ONLY safeEvidence's completed raw cues
    // enter the prompt. Never send the chunk's unfiltered content.
    currentChunks(db, position).lte('start_seconds', position.seconds)
      .order('start_seconds', { ascending: false }).limit(intent === 'scene' ? 4 : 6),
    db.rpc('match_companion_chunks', { p_tmdb_id: position.tmdbId, p_media_type: position.mediaType,
      p_current_season: position.seasonNumber ?? 0, p_current_episode: position.episodeNumber ?? 0,
      p_max_seconds: position.seconds, p_question: searchText, p_embedding: embedding }),
    currentChunks(db, position).lte('start_seconds', position.seconds)
      .order('start_seconds', { ascending: true }).limit(intent === 'recap' ? 200 : 2),
  ]);
  if (recent.error || beginning.error) throw recent.error || beginning.error;
  if (relevant.error) throw relevant.error;
  const chronological = (beginning.data ?? []) as unknown as SubtitleRecord[];
  // Recaps sample across the permitted prefix, preserving its beginning and end.
  const overview = intent === 'recap' && chronological.length > 14
    ? Array.from({ length: 14 }, (_, i) => chronological[Math.round(i * (chronological.length - 1) / 13)])
    : chronological;
  const prioritized = [...(recent.data ?? []), ...(relevant.data ?? []), ...overview] as unknown as SubtitleRecord[];
  const selected: SubtitleRecord[] = [];
  const seen = new Set<string>();
  let budget = 0;
  for (const record of prioritized) {
    const safe = safeEvidence([record], position)[0];
    if (!safe || seen.has(record.id)) continue;
    if (budget + safe.text.length > 36000) continue;
    selected.push(record); seen.add(record.id); budget += safe.text.length;
  }
  return safeEvidence(selected, position);
}

async function generateJson(system: string, user: string, key: string, maxTokens: number): Promise<unknown> {
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0,
      response_format: { type: 'json_object' }, max_tokens: maxTokens,
      messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(response.status === 429 ? 'AI service busy. Please try again shortly.' : 'Unable to generate a checked answer. Please try again.');
  const result = await response.json();
  if (result.choices?.[0]?.finish_reason !== 'stop') throw new Error('The answer was incomplete. Please try again.');
  try { return JSON.parse(result.choices[0].message.content); } catch { return null; }
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
      .eq('media_type', mediaType).eq('companion_version', COMPANION_VERSION).lte('position_seconds', seconds);
    if (mediaType === 'tv') historyQuery = historyQuery.eq('season_number', seasonNumber).eq('episode_number', episodeNumber);
    const historyResult = await historyQuery.order('created_at', { ascending: false }).limit(30);
    if (historyResult.error) throw historyResult.error;
    const memory = conversationMemory((historyResult.data ?? []) as Conversation[], position);
    await ensureCurrentSubtitles(db, position);
    const evidence = await retrieve(db, position, question.trim(), memory);
    let checked = null;
    if (evidence.length) {
      const key = Deno.env.get('GROQ_API_KEY');
      if (!key) throw new Error('The companion is temporarily unavailable. Please try again later.');
      checked = await checkedAnswer(question.trim(), position, evidence, memory,
        (system, user, tokens) => generateJson(system, user, key, tokens));
    }
    const answer = checked?.answer ?? (evidence.length
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
