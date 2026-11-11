import { readPaged } from '../_shared/paged-data.ts';
import { answerWatchRequest, WATCH_RECAP_REVISION } from '../_shared/watch-service.ts';
import { referenceRequest } from '../_shared/watch-answer.ts';
import { episodeRevision, priorEpisodes, seriesRecap } from '../_shared/series-recap.ts';
import type { CheckedResponse } from '../_shared/companion-response.ts';
import { cutGroup, wholeShowRecap, storyRecallRequest } from '../_shared/cut-scope.ts';
import { earlierEpisode, earlierStoryDialogue, recallRelevance, recallSearchQuestion, storyRecallAnswer, type StoryNote } from '../_shared/story-recall.ts';
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  companionVersionFor, SUBTITLE_VERSION, conversationMemory, formatTimestamp,
  parseTimestamp, safeHistory,
  type Conversation, type Evidence, type EvidenceCoverage, type SubtitleRecord, type ViewingPosition,
} from "../_shared/companion.ts";

import { companionAnswer } from "../_shared/answer.ts";
import { companionResponse, exactRepeatRequest, immediateMemoryResponse } from "../_shared/companion-response.ts";
import { companionReleaseFor, companionEvidenceBudget, companionGenerator } from "../_shared/companion-provider.ts";
import { databaseSolBudget } from "../_shared/sol-budget.ts";
import { selectSceneContext, subtitleSearchText } from "../_shared/scene-evidence.ts";
import { permittedSceneNotes, type ReviewedSceneNote, type PreparedSceneNote } from "../_shared/reviewed-scenes.ts";

import { assertSubtitlePreparation, SubtitleProviderError } from "../_shared/subtitle-provider.ts";

class RecapPreparing extends Error {}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const columns = 'id, tmdb_id, media_type, season_number, episode_number, ingestion_version, cues, start_seconds, end_seconds, source_file_id';

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

async function retrieve(db: SupabaseClient, position: ViewingPosition, question: string, memory: Conversation[], noteTables: string[]) {
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
  const records = [...(prefix.data ?? []), ...(relevant.data ?? [])] as unknown as SubtitleRecord[];
  const batches = await Promise.all(noteTables.map(async table => {
    let query = db.from(table).select('note').eq('tmdb_id', position.tmdbId)
      .eq('media_type', position.mediaType).lte('reveal_seconds', position.seconds);
    if (position.mediaType === 'tv') query = query.eq('season_number', position.seasonNumber!).eq('episode_number', position.episodeNumber!);
    else query = query.is('season_number', null).is('episode_number', null);
    const { data, error } = await query.order('reveal_seconds', { ascending: true }).limit(1000);
    if (error) throw error;
    return (data ?? []).map(row => row.note as ReviewedSceneNote);
  }));
  const notes = permittedSceneNotes(batches.flat(), records, position);
  return { ...selectSceneContext(records, position, question, memory, companionEvidenceBudget(name => Deno.env.get(name))), notes };
}

async function earlierStoryNotes(db: SupabaseClient, position: ViewingPosition, question: string, noteTables: string[]) {
  const resolved = recallSearchQuestion(question, position);
  const batches = await Promise.all(noteTables.map(async table => {
    const result = await db.from(table).select('note').eq('tmdb_id', position.tmdbId).eq('media_type', 'tv')
      .or(`season_number.lt.${position.seasonNumber},and(season_number.eq.${position.seasonNumber},episode_number.lt.${position.episodeNumber})`)
      .order('season_number', {ascending:false}).order('episode_number', {ascending:false}).limit(1000);
    if (result.error) throw result.error;
    return (result.data ?? []).map(row => row.note as ReviewedSceneNote);
  }));
  const all = batches.flat().filter(note => note && note.tmdb_id === position.tmdbId && note.media_type === 'tv' &&
    earlierEpisode(note.season_number!,note.episode_number!,position));
  const relevant = all.filter(note => typeof note.summary === 'string' && recallRelevance(resolved,
    note.summary + ' ' + (Array.isArray(note.anchors) ? note.anchors.map(c => c?.text ?? '').join(' ') : ''))>0);
  const episodes = [...new Set(relevant.map(note => `${note.season_number}:${note.episode_number}`))];
  // No cold model or subtitle downloads across an entire show on one question.
  // Notes without their exact cached caption anchors remain unavailable.
  if (episodes.length > 12) return [];
  const verified = await Promise.all(episodes.map(async key => {
    const [seasonNumber,episodeNumber] = key.split(':').map(Number);
    const pos = {...position,seasonNumber,episodeNumber,seconds:43200};
    const rows = await currentChunks(db,pos).order('start_seconds',{ascending:true}).limit(1000);
    if (rows.error) throw rows.error;
    const episodeNotes = all.filter(note => note.season_number===seasonNumber && note.episode_number===episodeNumber);
    const records = (rows.data ?? []) as unknown as SubtitleRecord[];
    const lasting = permittedSceneNotes(episodeNotes,records,pos).filter(note =>
      note.basis === 'scene_prefix' && !note.limited && note.validUntil === undefined && note.knowledge === 'established');
    return [...lasting, ...earlierStoryDialogue(episodeNotes,records,position)];
  }));
  return verified.flat();
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
    const release = companionReleaseFor(user, name => Deno.env.get(name));
    let body;
    try { body = await req.json(); } catch { return json({ error: 'Invalid request' }, 400); }
    const { tmdbId, mediaType, seasonNumber, episodeNumber, timestamp, question, requestId } = body;
    const seconds = parseTimestamp(timestamp);
    if (!Number.isInteger(tmdbId) || tmdbId <= 0 || !['tv', 'movie'].includes(mediaType) ||
        seconds === null || typeof question !== 'string' || !question.trim() || question.length > 2000 ||
        (mediaType === 'tv' && (!Number.isInteger(seasonNumber) || seasonNumber < 0 || seasonNumber > 200 || !Number.isInteger(episodeNumber) || episodeNumber < 1 || episodeNumber > 5000)) ||
        (requestId !== undefined && (typeof requestId !== 'string' || !/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(requestId)))) {
      return json({ error: 'Choose a title and episode, enter a valid MM:SS or HH:MM:SS timestamp, and ask a question (up to 2,000 characters).' }, 400);
    }
    const position: ViewingPosition = { tmdbId, mediaType, seconds,
      ...(mediaType === 'tv' ? { seasonNumber, episodeNumber } : {}) };
    const fullShow = mediaType === 'tv' && wholeShowRecap(question);
    const recall = mediaType === 'tv' && storyRecallRequest(question) && release.answerOptions.captionDiscussion;
    if (fullShow && (!release.answerOptions.captionDiscussion || body.recapProtocol !== 1)) {
      return json({error:'Whole-show recaps are available in the updated CineGeek private beta.'},409);
    }
    const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const answerVersion = companionVersionFor(position);
    const id = requestId ?? crypto.randomUUID();
    const prior = await userDb.from('ai_conversations').select('*').eq('id', id).maybeSingle();
    if (prior.error) throw prior.error;
    if (prior.data) {
      if (prior.data.companion_version !== answerVersion) {
        return json({ error: 'This saved answer predates the companion update. Please ask again.', code: 'answer_version_changed' }, 409);
      }
      // An ID cannot be reused to retrieve a future or different title's answer.
      if (prior.data.title_id !== tmdbId || prior.data.media_type !== mediaType || prior.data.position_seconds !== seconds ||
          prior.data.season_number !== (position.seasonNumber ?? null) || prior.data.episode_number !== (position.episodeNumber ?? null) || prior.data.question !== question.trim()) {
        return json({ error: 'Request ID already used for a different question.' }, 409);
      }
      if (!safeHistory([prior.data as Conversation], position).length) {
        return json({ error: 'This saved answer uses captions outside your viewing point. Please ask again.', code: 'answer_version_changed' }, 409);
      }
      return json({ answer: prior.data.answer, conversation: prior.data, usedCoins: 0 });
    }
    let memory: Conversation[] = [];
    if (exactRepeatRequest(question) || release.answerOptions.captionDiscussion && referenceRequest(question)) {
      let query = userDb.from('ai_conversations').select('*').eq('user_id', user.id).eq('title_id', tmdbId)
        .eq('media_type', mediaType).eq('companion_version', answerVersion).lte('position_seconds', seconds);
      if (mediaType === 'tv') query = query.eq('season_number', seasonNumber).eq('episode_number', episodeNumber);
      const result = await query.order('created_at', { ascending: false }).limit(30);
      if (result.error) throw result.error;
      memory = safeHistory((result.data ?? []) as Conversation[], position);
    }
    const memoryReply = immediateMemoryResponse(question.trim(), position, memory);
    let evidence: Evidence[] = [];
    let coverage: EvidenceCoverage | undefined;
    let notes: PreparedSceneNote[] = [];
    let earlierNotes: StoryNote[] = [];
    const episodeQuestion = 'Recap this entire episode from its beginning up to this timestamp.';
    let checked: CheckedResponse | null = null;
    if (!memoryReply && release.answerOptions.captionDiscussion) {
      const generate = companionGenerator(name => Deno.env.get(name), fetch,
        databaseSolBudget((name, args) => db.rpc(name, args), user.id, id));
      const readData = async (pos: ViewingPosition, earlier = false) => {
        if (!earlier && !cutGroup(pos) && pos.seconds > 0) await ensureCurrentSubtitles(db, pos);
        let query = earlier
          ? db.from('subtitle_chunks').select(columns).eq('tmdb_id',pos.tmdbId).eq('media_type','tv').eq('ingestion_version',SUBTITLE_VERSION)
            .or(`season_number.lt.${pos.seasonNumber},and(season_number.eq.${pos.seasonNumber},episode_number.lt.${pos.episodeNumber})`)
          : currentChunks(db,pos).lte('start_seconds',pos.seconds);
        const rows = await readPaged(query.order('season_number',{ascending:true}).order('episode_number',{ascending:true}).order('start_seconds',{ascending:true}).order('id',{ascending:true}),5000);
        const batches=await Promise.all(release.noteTables.map(async table=>{
          let query=db.from(table).select('note').eq('tmdb_id',pos.tmdbId).eq('media_type',pos.mediaType);
          if(earlier)query=query.or(`season_number.lt.${pos.seasonNumber},and(season_number.eq.${pos.seasonNumber},episode_number.lt.${pos.episodeNumber})`);
          else {query=query.lte('reveal_seconds',pos.seconds); if(pos.mediaType==='tv')query=query.eq('season_number',pos.seasonNumber!).eq('episode_number',pos.episodeNumber!);else query=query.is('season_number',null).is('episode_number',null);}
          const result=await readPaged(query.order('reveal_seconds',{ascending:true}).order('id',{ascending:true}),1000);
          return {notes:result.rows.map(row=>row.note as ReviewedSceneNote),incomplete:result.incomplete};
        }));
        return {records:rows.rows as unknown as SubtitleRecord[],notes:batches.flatMap(b=>b.notes),incomplete:rows.incomplete||batches.some(b=>b.incomplete)};
      };
      const chapterKeys=(pos:ViewingPosition)=>({tmdb_id:tmdbId,season_number:pos.seasonNumber!,episode_number:pos.episodeNumber!,
        revision:WATCH_RECAP_REVISION+':'+episodeRevision(pos)+(release.noteTables.includes('companion_visual_notes')?'-visual':'-standard')});
      checked=await answerWatchRequest(question.trim(),position,memory,generate,{
        current:pos=>readData(pos),earlier:pos=>readData(pos,true),
        seasons:async pos=>{
          const key=Deno.env.get('TMDB_API_KEY');if(!key)return [];
          try {
            const response=await fetch('https://api.themoviedb.org/3/tv/'+pos.tmdbId+'?api_key='+encodeURIComponent(key),{signal:AbortSignal.timeout(5000)});
            const catalog=response.ok?await response.json():null;
            if(catalog?.id!==pos.tmdbId||!Array.isArray(catalog.seasons))return [];
            return catalog.seasons.filter((s:{season_number:number;episode_count:number})=>Number.isInteger(s.season_number)&&s.season_number>0&&s.season_number<pos.seasonNumber!&&Number.isInteger(s.episode_count)&&s.episode_count>0)
              .map((s:{season_number:number;episode_count:number})=>({season:s.season_number,count:s.episode_count}));
          } catch{return [];}
        },
        chapter:async pos=>{const cached=await db.from('companion_episode_recaps').select('chapter,prepared_at').match(chapterKeys(pos)).maybeSingle();if(cached.error)throw cached.error;
          return cached.data?.chapter && (!cached.data.chapter.limited||Date.now()-Date.parse(cached.data.prepared_at)<3600000)?cached.data.chapter as CheckedResponse:null;},
        saveChapter:async(pos,answer)=>{const keys=chapterKeys(pos);const saved=await db.rpc('store_companion_episode_recap',{p_title:tmdbId,p_season:pos.seasonNumber,p_episode:pos.episodeNumber,p_revision:keys.revision,p_chapter:answer});if(saved.error)throw saved.error;},
        prepareLater:()=>{throw new RecapPreparing();},
      });
    } else {
    if (!memoryReply && !cutGroup(position) && seconds>0) {
      await ensureCurrentSubtitles(db, position);
      ({ evidence, coverage, notes } = await retrieve(db, position, fullShow ? episodeQuestion : question.trim(), memory, release.noteTables));
    }
    if (!memoryReply && recall) earlierNotes = await earlierStoryNotes(db,position,question.trim(),release.noteTables);
    if (!memoryReply) {
      const generate = companionGenerator(name => Deno.env.get(name), fetch,
        databaseSolBudget((name, args) => db.rpc(name, args), user.id, id));
      const readCurrent = async () => {
        if (recall) {
          const remembered = await storyRecallAnswer(question.trim(),position,[...earlierNotes,...notes],generate);
          if (remembered) return remembered;
        }
        if (!cutGroup(position) && !evidence.length && !notes.length) return null;
        return await companionAnswer(fullShow ? episodeQuestion : question.trim(), position, evidence, [], generate,
          diagnostic => console.info('Companion answer check', { requestId: id, ...diagnostic }), coverage, notes, release.answerOptions);
      };
      if (!fullShow) checked = await readCurrent();
      if (fullShow) {
        let seasons: {season:number;count:number}[] = [];
        const seasonOnly = /\b(?:whole|entire|this) season\b/i.test(question) && !/\b(?:show|series)\b/i.test(question);
        let catalogComplete = seasonNumber <= 1 || seasonOnly;
        if (!catalogComplete) {
          // Only season numbers/counts enter the plan. Never use season overviews or future episode summaries.
          const key = Deno.env.get('TMDB_API_KEY');
          if (key) {
            try {
              const response = await fetch('https://api.themoviedb.org/3/tv/'+tmdbId+'?api_key='+encodeURIComponent(key), {signal:AbortSignal.timeout(5000)});
              const catalog = response.ok ? await response.json() : null;
              if (catalog?.id === tmdbId && Array.isArray(catalog.seasons)) {
                seasons = catalog.seasons.filter((x: {season_number:number;episode_count:number}) => Number.isInteger(x.season_number) && Number.isInteger(x.episode_count) && x.episode_count>0)
                  .map((x:{season_number:number;episode_count:number}) => ({season:x.season_number,count:x.episode_count}));
                catalogComplete = Array.from({length:seasonNumber-1},(_,i)=>i+1).every(n=>seasons.some(s=>s.season===n));
              }
            } catch { /* A catalog outage must not turn a partial recap into a complete one. */ }
          }
        }
        const previous = priorEpisodes(position,seasons,seasonOnly);
        // Reuse evidence-built episode chapters across viewers. Bound cold provider work per request.
        let cold = 0;
        checked = await seriesRecap(question, position, previous, readCurrent, async pos => {
          const revision = episodeRevision(pos) + (release.noteTables.includes('companion_visual_notes') ? '-visual' : '-standard');
          const keys = {tmdb_id:tmdbId,season_number:pos.seasonNumber!,episode_number:pos.episodeNumber!,revision};
          const cached = await db.from('companion_episode_recaps').select('chapter,prepared_at').match(keys).maybeSingle();
          if (cached.error) throw cached.error;
          if (cached.data?.chapter) {
            const stored = cached.data.chapter as CheckedResponse;
            if (!stored.limited || Date.now()-Date.parse(cached.data.prepared_at)<3600000) return stored;
          }
          let chapter: CheckedResponse | null;
          if (cutGroup(pos)) chapter = await companionAnswer(episodeQuestion,pos,[],[],generate,undefined,undefined,[],release.answerOptions);
          else {
            if (cold >= 2) throw new RecapPreparing();
            cold++;
            await ensureCurrentSubtitles(db,pos);
            const part = await retrieve(db,pos,episodeQuestion,[],release.noteTables);
            chapter = await companionAnswer(episodeQuestion,pos,part.evidence,[],generate,undefined,part.coverage,part.notes,release.answerOptions);
          }
          // Briefly remember a real coverage gap so one missing episode cannot stall later chapters.
          chapter ??= {answer:'', evidence:[], limited:true};
          const saved = await db.rpc('store_companion_episode_recap', {p_title:tmdbId,p_season:pos.seasonNumber,
            p_episode:pos.episodeNumber,p_revision:revision,p_chapter:chapter});
          if (saved.error) throw saved.error;
          return chapter;
        }, catalogComplete);
      }
    }
    }
    const response = companionResponse(question.trim(), position, evidence, memory, checked);
    const context = `${mediaType === 'tv' ? `S${seasonNumber}E${episodeNumber} ` : ''}@ ${formatTimestamp(seconds)}`;
    const saved = await db.rpc('record_companion_answer', { p_user_id: user.id, p_charge: response.charge,
      p_conversation: { id, title_id: tmdbId, media_type: mediaType, season_number: position.seasonNumber ?? null,
        episode_number: position.episodeNumber ?? null, position_seconds: seconds, timestamp: formatTimestamp(seconds), companion_version: answerVersion,
        question: question.trim(), answer: response.answer, context, evidence: response.evidence,
        answer_status: response.answer_status } });
    if (saved.error) {
      if (saved.error.message.includes('Insufficient coins')) return json({ error: 'You need 150 coins for another question.' }, 402);
      throw saved.error;
    }
    if (!safeHistory([saved.data.conversation as Conversation], position).length) {
      return json({ error: 'This saved answer uses captions outside your viewing point. Please ask again.', code: 'answer_version_changed' }, 409);
    }
    return json({ ...saved.data, answer: saved.data.conversation.answer,
      status: saved.data.conversation.answer_status, evidence: saved.data.conversation.evidence, boundary: position });
  } catch (error) {
    if (error instanceof RecapPreparing) return json({status:'preparing_recap'}, 202);
    console.error('Companion request failed', error instanceof Error ? error.message : 'database error');
    return json({ error: error instanceof Error ? error.message : 'Unable to answer right now. Please try again.' }, 503);
  }
});
