// Uses local complete subtitle files only. No network, credentials or production writes.
import { reviewedSourceImport } from './lib/reviewed-source-import.ts';

const [manifestPath, sourcePath, notesPath, outputDirectory, extra] = Deno.args;
if (!manifestPath || !sourcePath || !notesPath || !outputDirectory || extra) {
  throw new Error('Usage: prepare-reviewed-source.ts manifest.json subtitles.srt notes.json NEW-private-directory');
}
const result = await reviewedSourceImport(JSON.parse(await Deno.readTextFile(manifestPath)),
  await Deno.readFile(sourcePath), JSON.parse(await Deno.readTextFile(notesPath)));
await Deno.mkdir(outputDirectory, { mode: 0o700 }); // Refuse to overwrite an existing review.
for (const [name, content] of [['import.sql', result.sql], ['records.json', JSON.stringify(result.records, null, 2)],
  ['manifest.json', JSON.stringify(result.manifest, null, 2)]]) {
  await Deno.writeTextFile(`${outputDirectory}/${name}`, content, { createNew: true, mode: 0o600 });
}
console.log(JSON.stringify({ ...result.manifest, outputDirectory }));
