// Offline only: validates private reviewed data and writes a guarded SQL import.
// deno run --allow-read --allow-write scripts/prepare-scene-note-import.ts notes.json records.json /private/import.sql
import { sceneNoteImport } from './lib/scene-note-import.ts';

const [notesPath, recordsPath, outputPath, extra] = Deno.args;
if (!notesPath || !recordsPath || !outputPath || extra || [notesPath, recordsPath].includes(outputPath)) {
  throw new Error('Usage: prepare-scene-note-import.ts notes.json records.json NEW-private-import.sql');
}
const notes = JSON.parse(await Deno.readTextFile(notesPath));
const input = JSON.parse(await Deno.readTextFile(recordsPath));
const sql = sceneNoteImport(notes, Array.isArray(input) ? input : input.records);
const file = await Deno.open(outputPath, { write: true, createNew: true, mode: 0o600 });
try {
  const bytes = new TextEncoder().encode(sql);
  let offset = 0;
  while (offset < bytes.length) offset += await file.write(bytes.subarray(offset));
} finally { file.close(); }
console.log(JSON.stringify({ notes: notes.length, outputPath, applied: false,
  message: 'Prepared only. Applying this SQL rechecks the live source and rolls back every note on a mismatch.' }));
