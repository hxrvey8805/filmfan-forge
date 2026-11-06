import { describe, expect, it } from 'vitest';
import { validateVisualClipReview, type VisualClipReview } from '../scripts/lib/visual-clip-review';
import type { ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes';

const cues = [{ start: 100, end: 102, text: 'Hello.' }, { start: 110, end: 112, text: 'Come inside.' },
  { start: 120, end: 122, text: 'Sit here.' }];
const rows = [{ tmdb_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  source_file_id: 9, ingestion_version: 3, cues }];
const note: ReviewedSceneNote = { id: 'chair', tmdb_id: 1, media_type: 'tv', season_number: 1, episode_number: 2,
  source_file_id: 9, start_seconds: 100, reveal_seconds: 125, summary: 'The chair is empty.',
  anchors: cues, uses: ['scene', 'explanation'], topics: ['chair'],
  review: { status: 'reviewed', basis: 'scene_prefix', reference: 'Fictional review', reviewed_at: '2026-11-05T00:00:00Z' },
  scene_review: { kind: 'released_video', availability: 'timed_scene', knowledge: 'established',
    reviewed_through_seconds: 125, references: [{ url: 'https://example.org/clip', locator: 'Empty chair at 20 seconds' }] } };
const review: VisualClipReview = { sourceUrl: 'https://example.org/clip', inspectedClipSeconds: [20],
  visualThroughClipSeconds: 22, alignments: cues.map((cue, i) => ({ cue, boundary: 'start', clipSeconds: i * 10 })) };

describe('offline visual clip timing review', () => {
  it('uses the latest possible alignment plus a safety margin', () => {
    expect(validateVisualClipReview(note, rows, review).earliestSafeReveal).toBe(124);
    expect(() => validateVisualClipReview({ ...note, reveal_seconds: 123 }, rows, review)).toThrow('too early');
  });
  it('refuses a different episode or replacement edition', () => {
    for (const change of [{ episode_number: 1 }, { source_file_id: 10 }]) {
      expect(() => validateVisualClipReview(note, [{ ...rows[0], ...change }], review)).toThrow('edition');
    }
  });
  it('refuses timing drift, edits, sparse anchors and extrapolation', () => {
    expect(() => validateVisualClipReview(note, rows, { ...review,
      alignments: review.alignments.map((m, i) => ({ ...m, clipSeconds: m.clipSeconds + i * 2 })) })).toThrow('drift');
    expect(() => validateVisualClipReview(note, rows, { ...review, alignments: [...review.alignments].reverse() })).toThrow('non-monotonic');
    expect(() => validateVisualClipReview(note, rows, { ...review, alignments: review.alignments.slice(0, 2) })).toThrow('three distinct');
    expect(() => validateVisualClipReview(note, rows, { ...review, visualThroughClipSeconds: 60 })).toThrow('outside aligned');
  });
  it('does not allow unseen observations or unrelated video provenance', () => {
    expect(() => validateVisualClipReview(note, rows, { ...review, inspectedClipSeconds: [30] })).toThrow('interval');
    expect(() => validateVisualClipReview(note, rows, { ...review, sourceUrl: 'https://example.org/other' })).toThrow('provenance');
  });
});
