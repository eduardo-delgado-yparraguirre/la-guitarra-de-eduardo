// One-off importer: pulls every song from the old Google Site and writes
// songs/<slug>.cho in ChordPro format, converting "chords above lyrics"
// lines into inline [Chord]lyric notation.
//
// The old site lined chords up by eye with spaces and tabs in a proportional
// font, so character counts don't tell where a chord falls. Instead we open
// each page in Chrome and measure where every character is actually drawn,
// then attach each chord to the lyric character directly beneath it.
//
// Usage: node tools/import-google-site.mjs [--only slug1,slug2]

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright-core";

const SITE = "https://sites.google.com";
const HOME = `${SITE}/view/eduardodelgado/home`;
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "songs");

// Home page section headings -> metadata for the songs listed under them.
const GROUPS = [
  { match: /spanish|espa/i, lang: "es", tags: [] },
  { match: /botellazos/i, lang: "es", tags: ["botellazos"] },
  { match: /english|ingl/i, lang: "en", tags: [] },
];

// Typos in the old site's titles.
const TITLE_FIXES = [
  [/\bstope\b/i, "Stop"],
  [/\bEstreches\b/i, "Estrechez"],
  [/\bLoosing\b/i, "Losing"],
  [/\bRadio head\b/i, "Radiohead"],
  [/\s+Lyrics$/i, ""],
  [/\bWhats\b/i, "What's"],
  [/\bDont\b/g, "Don't"],
];

// Artists that the old site wrote after the song title.
const TITLE_FIRST = /^(Hermanos Zanartu|Zambo Cavero|Los Iracundos|Los Doltons|NSQNSC|What's up)$/i;
const ARTIST_FIXES = { "mar de copas": "Mar de Copas", rem: "R.E.M.", "four non blondes": "4 Non Blondes" };

// ---------------------------------------------------------------------------
// Song list from the home page: walk h2 headings and song links in order.

function decode(s) {
  return s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

const stripTags = (html) => decode(html.replace(/<[^>]+>/g, "")).trim();

async function readSongList() {
  const res = await fetch(HOME);
  if (!res.ok) throw new Error(`${res.status} ${HOME}`);
  const html = await res.text();
  const token = /<h2[\s\S]*?<\/h2>|<a class="XqQF9c" href="\/view\/eduardodelgado\/([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  const songs = [];
  const seen = new Set();
  let group = GROUPS[0];
  for (const m of html.matchAll(token)) {
    if (m[0].startsWith("<h2")) {
      group = GROUPS.find((g) => g.match.test(stripTags(m[0]))) ?? group;
      continue;
    }
    const slug = m[1];
    if (slug === "home" || seen.has(slug)) continue;
    seen.add(slug);
    songs.push({ slug, label: stripTags(m[2]), ...group });
  }
  return songs;
}

// ---------------------------------------------------------------------------
// Song page, measured in the browser.
//
// Returns { title, lines: [{ text, xs }] } where xs[i] is the left edge in px
// of character i, and xs[text.length] is the right edge of the line.

async function readSongPage(page, slug) {
  await page.goto(`${SITE}/view/eduardodelgado/${slug}`, { waitUntil: "load" });
  return page.evaluate(() => {
    const title = document.querySelector('meta[property="og:title"]')?.content ?? "";
    // Older pages use <p>, pasted ones use <small>; both carry these classes.
    const paras = [...document.querySelectorAll("p.CDt4Ke.zfr3Q, small.CDt4Ke.zfr3Q")].filter(
      (p) => p.offsetParent && !p.closest("nav, header, [role=navigation]"),
    );
    const lines = [];
    for (const p of paras) {
      let cur = null;
      const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
      for (let node; (node = walker.nextNode()); ) {
        for (let i = 0; i < node.length; i++) {
          const range = document.createRange();
          range.setStart(node, i);
          range.setEnd(node, i + 1);
          const r = range.getBoundingClientRect();
          // A new visual line (<br> inside the paragraph) starts lower down.
          if (!cur || r.top > cur.top + r.height / 2) {
            cur = { text: "", xs: [], top: r.top, right: r.left };
            lines.push(cur);
          }
          cur.text += node.data[i];
          cur.xs.push(r.left);
          cur.right = r.right;
        }
      }
      if (!cur) lines.push({ text: "", xs: [0] });
    }
    for (const l of lines) {
      if (l.right !== undefined) l.xs.push(l.right);
      delete l.top;
      delete l.right;
      l.text = l.text.replace(/ /g, " ");
    }
    return { title, lines };
  });
}

// ---------------------------------------------------------------------------
// Chord detection and merging.

const CHORD = /^\(?[A-G](#|b)?(m|maj|min|dim|aug|sus|add)?\d*(sus\d*|add\d+|maj\d*|M\d*|\+|°)?(\/[A-G](#|b)?)?\)?$/;
const CHORD_EXTRA = /^(\(?x?\d+x?\)?|\||-+|\.\.\.?|N\.?C\.?|riff:?|intro:?|outro:?|solo:?)$/i;
const SECTION = /^\s*\[([^\]]+)\]\s*$/;
const SECTION_WORD =
  /^\s*((?:intro|verse|verso|chorus|coro|estribillo|bridge|puente|pre-?chorus|pre-?coro|solo|outro|final|interlude|instrumental)(?:\s*\d+)?)\s*:?\s*$/i;

function isChordLine(text) {
  const toks = text.trim().split(/\s+/).filter(Boolean);
  return toks.some((t) => CHORD.test(t)) && toks.every((t) => CHORD.test(t) || CHORD_EXTRA.test(t));
}

const asChord = (tok) => (CHORD.test(tok) ? `[${tok.replace(/[()]/g, "")}]` : tok);

function chordsOnly(text) {
  return text.trim().split(/\s+/).map(asChord).join(" ");
}

function merge(chordLine, lyric) {
  const chars = lyric.text.split("");
  const inserts = new Map(); // lyric char index -> chord text
  for (const m of chordLine.text.matchAll(/\S+/g)) {
    // Centre of the chord's first letter decides which syllable it sits on.
    const x = (chordLine.xs[m.index] + chordLine.xs[m.index + 1]) / 2;
    let idx = chars.length;
    for (let i = 0; i < chars.length; i++) {
      if (lyric.xs[i + 1] > x) { idx = i; break; }
    }
    // A chord over a space belongs to the next word.
    while (idx < chars.length && /\s/.test(chars[idx])) idx++;
    // Hand-aligned chords are rarely exact: one letter into a word means the
    // word's start, and the last letter of a word means the next word.
    if (idx < chars.length) {
      let start = idx, end = idx;
      while (start > 0 && !/\s/.test(chars[start - 1])) start--;
      while (end < chars.length && !/\s/.test(chars[end])) end++;
      if (idx - start <= 1) idx = start;
      else if (end - idx === 1 && end - start >= 3) {
        let next = end;
        while (next < chars.length && /\s/.test(chars[next])) next++;
        if (next < chars.length) idx = next;
      }
    }
    const text = CHORD.test(m[0]) ? asChord(m[0]) : `${m[0]} `;
    inserts.set(idx, (inserts.get(idx) ?? "") + text);
  }
  let out = "";
  for (let i = 0; i <= chars.length; i++) {
    if (inserts.has(i)) {
      if (i === chars.length && out && !out.endsWith(" ")) out += " ";
      out += inserts.get(i);
    }
    if (i < chars.length) out += chars[i];
  }
  return out.replace(/\s+/g, " ").trim();
}

function toChordPro(lines) {
  const body = [];
  const blank = () => body.length && body.at(-1) !== "" && body.push("");
  for (let i = 0; i < lines.length; i++) {
    const { text } = lines[i];
    if (!text.trim()) { blank(); continue; }
    // Underlines under headings ("Verse 2" / "-------").
    if (/^\s*[-_=~]{3,}\s*$/.test(text)) continue;
    const sec = text.match(SECTION) ?? text.match(SECTION_WORD);
    if (sec && !CHORD.test(sec[1].trim())) {
      blank();
      body.push(`{comment: ${sec[1].trim()}}`);
      continue;
    }
    if (isChordLine(text)) {
      const next = lines[i + 1];
      if (next && next.text.trim() && !isChordLine(next.text) && !SECTION.test(next.text)) {
        body.push(merge(lines[i], next));
        i++;
      } else {
        body.push(chordsOnly(text));
      }
      continue;
    }
    body.push(text.replace(/\s+/g, " ").trim());
  }
  while (body.at(-1) === "") body.pop();
  return body;
}

// ---------------------------------------------------------------------------

function splitArtistTitle(full, label) {
  const fix = (s) => TITLE_FIXES.reduce((acc, [re, rep]) => acc.replace(re, rep), s).trim();
  const name = full.replace(/^La Guitarra de Eduardo\s*-\s*/, "").trim() || label;
  const parts = name.split(/\s+[-–—]\s+/).map(fix);
  if (parts.length < 2) return { artist: "", title: parts[0] };
  // Most pages are "Artist - Title", but some botellazos are "Title - Artist".
  let [artist, title] = [parts[0], parts.slice(1).join(" - ")];
  if (TITLE_FIRST.test(parts.at(-1)) || TITLE_FIRST.test(parts[0]) && parts.length === 2) {
    [artist, title] = TITLE_FIRST.test(parts[0]) ? [parts[1], parts[0]] : [parts.at(-1), parts.slice(0, -1).join(" - ")];
  }
  return { artist: ARTIST_FIXES[artist.toLowerCase()] ?? artist, title };
}

async function main() {
  const onlyArg = process.argv.indexOf("--only");
  const only = onlyArg > 0 ? new Set(process.argv[onlyArg + 1].split(",")) : null;
  await mkdir(OUT, { recursive: true });

  const songs = (await readSongList()).filter((s) => !only || only.has(s.slug));
  console.log(`Found ${songs.length} songs`);

  const browser = await chromium.launch({ channel: "chrome" });
  const page = await browser.newPage({ viewport: { width: 2400, height: 1200 } });
  const problems = [];

  for (const song of songs) {
    try {
      const { title: fullTitle, lines } = await readSongPage(page, song.slug);
      const { artist, title } = splitArtistTitle(fullTitle, song.label);
      const body = toChordPro(lines);
      if (body.length < 3) problems.push(`${song.slug}: only ${body.length} lines`);
      const head = [`{title: ${title}}`];
      if (artist) head.push(`{artist: ${artist}}`);
      head.push(`{language: ${song.lang}}`);
      if (song.tags.length) head.push(`{tags: ${song.tags.join(", ")}}`);
      head.push(`{source: ${SITE}/view/eduardodelgado/${song.slug}}`, "");
      await writeFile(join(OUT, `${song.slug}.cho`), [...head, ...body, ""].join("\n"), "utf8");
      console.log(`  ✓ ${song.slug} (${body.length} lines)`);
    } catch (err) {
      problems.push(`${song.slug}: ${err.message}`);
      console.log(`  ✗ ${song.slug}: ${err.message}`);
    }
  }
  await browser.close();
  if (problems.length) console.log("\nCheck these:\n  " + problems.join("\n  "));
}

main();
