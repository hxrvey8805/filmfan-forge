// Offline only: validates private reviewed data and writes a guarded SQL import.
// deno run --allow-read --allow-write scripts/prepare-scene-note-import.ts notes.json records.json /private/import.sql
import { sceneNoteImport } from './lib/scene-note-import.ts';
import { validateVisualClipReview, type VisualClipReview } from './lib/visual-clip-review.ts';
import type { ReviewedSceneNote } from '../supabase/functions/_shared/reviewed-scenes.ts';

const [notesPath, recordsPath, outputPath, clipReviewPath, extra] = Deno.args;
if (!notesPath || !recordsPath || !outputPath || extra || [notesPath, recordsPath, clipReviewPath].includes(outputPath)) {
  throw new Error('Usage: prepare-scene-note-import.ts notes.json records.json NEW-private-import.sql [clip-reviews.json]');
}
const notes = JSON.parse(await Deno.readTextFile(notesPath));
const input = JSON.parse(await Deno.readTextFile(recordsPath));
const records = Array.isArray(input) ? input : input.records;
const clips = (notes as ReviewedSceneNote[]).filter(note => note.scene_review?.kind === 'released_video' && note.scene_review.availability === 'timed_scene');
if (clips.length) {
  if (!clipReviewPath) throw new Error('Timed released-video notes require a private clip review with matching dialogue anchors.');
  const reviews = JSON.parse(await Deno.readTextFile(clipReviewPath)) as (VisualClipReview & { noteId: string })[];
  if (!Array.isArray(reviews)) throw new Error('Expected a list of clip reviews.');
  for (const note of clips) {
    const matches = reviews.filter(r => r.noteId === note.id);
    if (matches.length !== 1) throw new Error(`Missing or duplicate clip review for ${note.id}.`);
    validateVisualClipReview(note, records, matches[0], notes);
  }
}
const sql = sceneNoteImport(notes, records);
const file = await Deno.open(outputPath, { write: true, createNew: true, mode: 0o600 });
try {
  const bytes = new TextEncoder().encode(sql);
  let offset = 0;
  while (offset < bytes.length) offset += await file.write(bytes.subarray(offset));
} finally { file.close(); }
console.log(JSON.stringify({ notes: notes.length, outputPath, applied: false,
  message: 'Prepared only. Applying this SQL rechecks the live source and rolls back every note on a mismatch.' }));
