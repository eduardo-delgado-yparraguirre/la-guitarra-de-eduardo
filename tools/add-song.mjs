// Adds a song from a plain-text chord sheet (chords on their own line above
// the lyrics, as copied from most chord websites) and rebuilds the index.
//
// Usage:
//   node tools/add-song.mjs <sheet.txt> --title "Title" --artist "Artist" --lang es --genre "Rock en español"
//
// Text copied from chord sites is usually monospaced, so a chord sits over the
// lyric character in the same column.

import { readFile, writeFile, access } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

const CHORD = /^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add)?\d*(sus\d*|add\d+|maj\d*|M\d*|\+|°)?(\/[A-G](#|b)?)?\)?$/;
const CHORD_EXTRA = /^(\(?x?\d+x?\)?|\||-+|\.\.\.?|N\.?C\.?|riff:?|intro:?|outro:?|solo:?)$/i;
const SECTION = /^\s*\[([^\]]+)\]\s*$|^\s*((?:intro|verse|verso|chorus|coro|estribillo|bridge|puente|pre-?chorus|pre-?coro|solo|outro|final|interlude|instrumental)(?:\s*\d+)?)\s*:?\s*$/i;

const isChordLine = (t) => {
  const toks = t.trim().split(/\s+/).filter(Boolean);
  return toks.some((x) => CHORD.test(x)) && toks.every((x) => CHORD.test(x) || CHORD_EXTRA.test(x));
};
const asChord = (t) => (CHORD.test(t) ? `[${t.replace(/[()]/g, "")}]` : t);

function merge(chordLine, lyric) {
  const inserts = new Map();
  for (const m of chordLine.matchAll(/\S+/g)) {
    let idx = Math.min(m.index, lyric.length);
    while (idx < lyric.length && lyric[idx] === " ") idx++;
    inserts.set(idx, (inserts.get(idx) ?? "") + (CHORD.test(m[0]) ? asChord(m[0]) : `${m[0]} `));
  }
  let out = "";
  for (let i = 0; i <= lyric.length; i++) {
    if (inserts.has(i)) out += (i === lyric.length && out && !out.endsWith(" ") ? " " : "") + inserts.get(i);
    if (i < lyric.length) out += lyric[i];
  }
  return out.replace(/\s+/g, " ").trim();
}

export function sheetToChordPro(text) {
  const lines = text.replace(/\t/g, "    ").split(/\r?\n/).map((l) => l.trimEnd());
  const body = [];
  const blank = () => body.length && body.at(-1) !== "" && body.push("");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) { blank(); continue; }
    if (/^\s*[-_=~]{3,}\s*$/.test(line)) continue;
    const sec = line.match(SECTION);
    if (sec) { blank(); body.push(`{comment: ${(sec[1] ?? sec[2]).trim()}}`); continue; }
    if (isChordLine(line)) {
      const next = lines[i + 1];
      if (next?.trim() && !isChordLine(next) && !SECTION.test(next)) { body.push(merge(line, next)); i++; }
      else body.push(line.trim().split(/\s+/).map(asChord).join(" "));
      continue;
    }
    body.push(line.trim());
  }
  while (body.at(-1) === "") body.pop();
  return body.join("\n");
}

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : "";
};

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  const title = arg("title");
  const artist = arg("artist");
  if (!file || !title) {
    console.log('Usage: node tools/add-song.mjs <sheet.txt> --title "Title" --artist "Artist" --lang es --genre "Genre"');
    process.exit(1);
  }
  const slug = `${artist} ${title}`.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const out = join(ROOT, "songs", `${slug}.cho`);
  if (await access(out).then(() => true, () => false)) {
    console.log(`songs/${slug}.cho already exists; not overwriting.`);
    process.exit(1);
  }
  const head = [`{title: ${title}}`, artist && `{artist: ${artist}}`, arg("genre") && `{genre: ${arg("genre")}}`,
    `{language: ${arg("lang") || "es"}}`].filter(Boolean);
  await writeFile(out, `${head.join("\n")}\n\n${sheetToChordPro(await readFile(file, "utf8"))}\n`, "utf8");
  console.log(`Added songs/${slug}.cho`);
  execFileSync(process.execPath, [join(ROOT, "tools", "build-index.mjs")], { stdio: "inherit" });
}
