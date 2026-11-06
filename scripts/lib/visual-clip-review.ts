import { permittedSceneNotes, type ReviewedSceneNote } from '../../supabase/functions/_shared/reviewed-scenes.ts';
import type { Cue, SubtitleRecord } from '../../supabase/functions/_shared/companion.ts';

// Offline review aid, not an automatic fact extractor. A reviewer must watch
// the released scene and approve the prose. Caption matches identify its cut;
// they cannot establish a silent action or a character's hidden identity.
export interface VisualClipReview {
  sourceUrl: string;
  visualThroughClipSeconds: number;
  inspectedClipSeconds: number[];
  alignments: { clipSeconds: number; boundary: 'start' | 'end'; cue: Cue }[];
}

export function validateVisualClipReview(note: ReviewedSceneNote, records: SubtitleRecord[], review: VisualClipReview,
  relatedNotes: ReviewedSceneNote[] = []) {
  const fail = (reason: string): never => { throw new Error(`Visual clip review: ${reason}`); };
  if (note.review.basis !== 'scene_prefix' || note.scene_review?.kind !== 'released_video' ||
      note.scene_review.availability !== 'timed_scene' ||
      !note.scene_review.references.some(ref => ref.url === review.sourceUrl)) fail('missing released-scene provenance');
  const position = { tmdbId: note.tmdb_id, mediaType: note.media_type, seconds: note.reveal_seconds,
    ...(note.media_type === 'tv' ? { seasonNumber: note.season_number!, episodeNumber: note.episode_number! } : {}) };
  if (!permittedSceneNotes([note, ...relatedNotes.filter(n => n.id !== note.id)], records, position).some(n => n.id === note.id)) fail('wrong episode, edition or caption span');
  const through = review.visualThroughClipSeconds;
  if (!Number.isFinite(through) || through <= 0 || !review.inspectedClipSeconds.length ||
      review.inspectedClipSeconds.some(t => !Number.isFinite(t) || t < 0 || t > through)) fail('invalid observed clip interval');
  const matches = review.alignments;
  if (matches.length < 3 || new Set(matches.map(m => JSON.stringify(m.cue))).size < 3) fail('three distinct dialogue anchors required');
  const key = (cue: Cue) => JSON.stringify([cue.start, cue.end, cue.text]);
  const anchors = new Set(note.anchors.map(key));
  const offsets: number[] = [];
  let previousClip = -1, previousTitle = -1;
  for (const match of matches) {
    if (!['start', 'end'].includes(match.boundary) || !anchors.has(key(match.cue)) ||
        !Number.isFinite(match.clipSeconds) || match.clipSeconds < 0) fail('anchor absent from reviewed edition');
    const titleTime = match.cue[match.boundary];
    if (match.clipSeconds <= previousClip || titleTime <= previousTitle) fail('non-monotonic scene alignment');
    offsets.push(titleTime - match.clipSeconds);
    previousClip = match.clipSeconds; previousTitle = titleTime;
  }
  // Short clips must agree within two seconds. Never stretch a mistimed file
  // or extrapolate across an edit/episode to make the timestamps fit.
  const low = Math.min(...offsets), high = Math.max(...offsets);
  if (high - low > 2) fail('timing drift; recheck the edition');
  if (through > previousClip + 5 || through < matches[0].clipSeconds ||
      review.inspectedClipSeconds.some(t => t < matches[0].clipSeconds - 5)) fail('visual review outside aligned clip');
  // Add two seconds for subtitle/on-screen timing uncertainty. This is a
  // conservative release gate, not a claim of frame-accurate synchronization.
  const earliestSafeReveal = Math.ceil(through + high + 2);
  if (note.reveal_seconds < earliestSafeReveal) fail('visual context would unlock too early');
  return { offsetRange: [low, high], earliestSafeReveal, revealSeconds: note.reveal_seconds,
    sourceFileId: note.source_file_id, alignmentCount: matches.length };
}
