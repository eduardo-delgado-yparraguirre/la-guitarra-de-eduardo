// Builds songs/index.json from the {title}/{artist}/... headers of every
// songs/*.cho file. Run after adding or editing songs: npm run index

import { readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SONGS = join(ROOT, "songs");

const files = (await readdir(SONGS)).filter((f) => f.endsWith(".cho")).sort();
const index = [];
for (const file of files) {
  const text = await readFile(join(SONGS, file), "utf8");
  const meta = {};
  for (const m of text.matchAll(/^\{(\w+):\s*(.*?)\s*\}$/gm)) meta[m[1].toLowerCase()] ??= m[2];
  index.push({
    slug: file.replace(/\.cho$/, ""),
    title: meta.title ?? file,
    artist: meta.artist ?? "",
    lang: meta.language ?? "",
    tags: meta.tags ? meta.tags.split(/\s*,\s*/) : [],
  });
}
await writeFile(join(SONGS, "index.json"), JSON.stringify(index, null, 1) + "\n");
console.log(`songs/index.json: ${index.length} songs`);
