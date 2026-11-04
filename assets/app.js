import { transpose, diagramSVG, parseChord } from "./chords.js";

const $ = (sel, root = document) => root.querySelector(sel);
const view = $("#view");
const dock = $("#dock");

// ---------------------------------------------------------------------------
// Storage (wrapped: private mode or blocked storage must not break the app)

const store = {
  get(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
  },
};

const prefs = Object.assign({ size: 18, theme: "", diagrams: true, lyricsOnly: false, sort: "artist" }, store.get("prefs", {}));
const favs = new Set(store.get("favs", []));
const savePrefs = () => store.set("prefs", prefs);
const saveFavs = () => store.set("favs", [...favs]);

function applyPrefs() {
  if (prefs.theme) document.documentElement.dataset.theme = prefs.theme;
  else delete document.documentElement.dataset.theme;
  document.documentElement.style.setProperty("--song-size", prefs.size + "px");
}
applyPrefs();

// ---------------------------------------------------------------------------
// Data

let songs = [];
let listState = { q: "", chip: "all" };
let currentList = []; // the filtered list the user last saw, for prev/next
let listScroll = 0;

const fold = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

async function loadIndex() {
  const res = await fetch("songs/index.json");
  songs = await res.json();
  for (const s of songs) s.key = fold(`${s.title} ${s.artist}`);
}

const CHIPS = [
  { id: "all", label: "Todas", test: () => true },
  { id: "fav", label: "★ Favoritas", test: (s) => favs.has(s.slug) },
  { id: "es", label: "Español", test: (s) => s.lang === "es" && !s.tags.includes("botellazos") },
  { id: "en", label: "English", test: (s) => s.lang === "en" },
  { id: "botellazos", label: "Para agarrarnos a botellazos", test: (s) => s.tags.includes("botellazos") },
];

function filtered() {
  const chip = CHIPS.find((c) => c.id === listState.chip) ?? CHIPS[0];
  const words = fold(listState.q).split(/\s+/).filter(Boolean);
  const by = prefs.sort === "title" ? (s) => fold(s.title) : (s) => fold(s.artist || s.title) + " " + fold(s.title);
  return songs
    .filter((s) => chip.test(s) && words.every((w) => s.key.includes(w)))
    .sort((a, b) => by(a).localeCompare(by(b)));
}

// ---------------------------------------------------------------------------
// List view

function renderList() {
  setMode("list");
  view.innerHTML = `
    <div class="search">
      <svg><use href="#i-search"/></svg>
      <input id="q" type="search" placeholder="Buscar canción o artista…" autocomplete="off" value="${esc(listState.q)}">
      <button class="icon-btn clear" id="clear" aria-label="Borrar" ${listState.q ? "" : "hidden"}><svg><use href="#i-x"/></svg></button>
    </div>
    <div class="chips" role="toolbar">
      ${CHIPS.map((c) => `<button class="chip" data-chip="${c.id}" aria-pressed="${c.id === listState.chip}">${c.label}</button>`).join("")}
    </div>
    <div class="list-meta"><span id="count"></span>
      <button class="link-btn" id="sort">Ordenar por ${prefs.sort === "title" ? "artista" : "título"}</button></div>
    <div id="results"></div>`;

  const q = $("#q");
  q.addEventListener("input", () => {
    listState.q = q.value;
    $("#clear").hidden = !q.value;
    renderResults();
  });
  $("#clear").onclick = () => { q.value = ""; q.dispatchEvent(new Event("input")); q.focus(); };
  view.querySelectorAll(".chip").forEach((b) => (b.onclick = () => {
    listState.chip = b.dataset.chip;
    view.querySelectorAll(".chip").forEach((x) => x.setAttribute("aria-pressed", x === b));
    renderResults();
  }));
  $("#sort").onclick = () => {
    prefs.sort = prefs.sort === "title" ? "artist" : "title";
    savePrefs();
    $("#sort").textContent = `Ordenar por ${prefs.sort === "title" ? "artista" : "título"}`;
    renderResults();
  };
  renderResults();
  requestAnimationFrame(() => window.scrollTo(0, listScroll));
}

function renderResults() {
  currentList = filtered();
  $("#count").textContent = `${currentList.length} ${currentList.length === 1 ? "canción" : "canciones"}`;
  if (!currentList.length) {
    $("#results").innerHTML = `<p class="empty">${listState.chip === "fav" && !favs.size
      ? "Todavía no tienes favoritas. Toca ☆ en una canción para guardarla aquí."
      : "No encontré nada. Prueba con otra palabra."}</p>`;
    return;
  }
  let html = "";
  let letter = "";
  for (const s of currentList) {
    const head = fold((prefs.sort === "title" ? s.title : s.artist || s.title)[0] ?? "#").toUpperCase();
    if (head !== letter) {
      if (letter) html += "</ul>";
      letter = head;
      html += `<div class="letter">${esc(letter)}</div><ul class="songs">`;
    }
    const fav = favs.has(s.slug);
    html += `<li class="song-row">
      <a href="#/s/${s.slug}"><span class="t">${esc(s.title)}</span><span class="a">${esc(s.artist || "—")}</span></a>
      <button class="icon-btn star" data-fav="${s.slug}" aria-pressed="${fav}" aria-label="Favorita"><svg><use href="#i-star${fav ? "" : "-o"}"/></svg></button>
    </li>`;
  }
  $("#results").innerHTML = html + "</ul>";
  $("#results").querySelectorAll("[data-fav]").forEach((b) => (b.onclick = () => {
    toggleFav(b.dataset.fav, b);
    if (listState.chip === "fav") renderResults();
  }));
}

function toggleFav(slug, btn) {
  favs.has(slug) ? favs.delete(slug) : favs.add(slug);
  saveFavs();
  const on = favs.has(slug);
  btn.setAttribute("aria-pressed", on);
  btn.querySelector("use").setAttribute("href", on ? "#i-star" : "#i-star-o");
}

// ---------------------------------------------------------------------------
// ChordPro parsing

const CHORD_TOKEN = /\[([^\]]+)\]/g;
const CHORD_EXTRA = /^(\(?x?\d+x?\)?|\||-+|\.\.\.?|N\.?C\.?|riff:?|intro:?|outro:?|solo:?)$/i;

function parseChordPro(text) {
  const meta = {};
  const items = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trimEnd();
    const dir = line.match(/^\{(\w+)(?::\s*(.*?))?\s*\}$/);
    if (dir) {
      const [, name, value = ""] = dir;
      const key = name.toLowerCase();
      if (key === "comment" || key === "c" || key === "comment_italic" || key === "ci") items.push({ type: "section", text: value });
      else if (/^(start_of_|soc|sov|sob|eoc|eov|eob|end_of_)/.test(key)) { /* ignore block markers */ }
      else meta[key] = value;
      continue;
    }
    if (!line.trim()) { if (items.length && items.at(-1).type !== "gap") items.push({ type: "gap" }); continue; }

    const outside = line.replace(CHORD_TOKEN, " ").trim().split(/\s+/).filter(Boolean);
    const hasChords = /\[[^\]]+\]/.test(line);
    // A line that's only chords (plus things like "x2" or "Intro:") becomes a chord row.
    if (hasChords && outside.every((w) => CHORD_EXTRA.test(w))) {
      const toks = [];
      for (const part of line.split(/(\[[^\]]+\])/)) {
        if (!part.trim()) continue;
        const m = part.match(/^\[([^\]]+)\]$/);
        toks.push(m ? { c: m[1] } : { x: part.trim() });
      }
      items.push({ type: "chords", toks });
      continue;
    }
    const segs = [];
    const parts = line.split(/(\[[^\]]+\])/);
    let pending = null;
    for (const part of parts) {
      const m = part.match(/^\[([^\]]+)\]$/);
      if (m) {
        if (pending !== null) segs.push({ c: pending, l: "" });
        pending = m[1];
      } else if (part) {
        segs.push({ c: pending, l: part });
        pending = null;
      }
    }
    if (pending !== null) segs.push({ c: pending, l: "" });
    items.push({ type: "line", segs, hasChords });
  }
  while (items.at(-1)?.type === "gap") items.pop();
  return { meta, items };
}

// ---------------------------------------------------------------------------
// Song view

let song = null; // { slug, meta, items, tr, speed }

async function renderSong(slug) {
  setMode("song");
  const info = songs.find((s) => s.slug === slug);
  if (!info) { view.innerHTML = `<p class="empty">No encontré esa canción. <a href="#/">Volver a la lista</a></p>`; return; }
  if (!currentList.length) currentList = filtered();

  view.innerHTML = `<div class="song-head"><h2>${esc(info.title)}</h2><div class="by">${esc(info.artist)}</div></div><p class="empty">Cargando…</p>`;
  let text;
  try {
    text = await (await fetch(`songs/${slug}.cho`)).text();
  } catch {
    view.querySelector(".empty").textContent = "No se pudo cargar. ¿Sin conexión?";
    return;
  }
  const saved = store.get(`song:${slug}`, {});
  song = { slug, info, ...parseChordPro(text), tr: saved.tr ?? 0, speed: saved.speed ?? 3 };
  updateFavButton();
  drawSong();
  window.scrollTo(0, 0);
}

function songChords() {
  const seen = new Set();
  for (const it of song.items) {
    const list = it.type === "line" ? it.segs.map((s) => s.c) : it.type === "chords" ? it.toks.map((t) => t.c) : [];
    for (const c of list) if (c && parseChord(c)) seen.add(transpose(c, song.tr));
  }
  return [...seen];
}

function drawSong() {
  const { info, meta, items, tr } = song;
  const T = (c) => esc(transpose(c, tr));
  const pills = [];
  if (meta.key) pills.push(`<span class="pill">Tono <b>${T(meta.key)}</b></span>`);
  if (meta.capo) pills.push(`<span class="pill">Capo <b>${esc(meta.capo)}</b></span>`);
  if (meta.tempo) pills.push(`<span class="pill">Tempo <b>${esc(meta.tempo)}</b></span>`);
  if (meta.strum) pills.push(`<span class="pill">Rasgueo <b>${esc(meta.strum)}</b></span>`);
  const yt = meta.youtube || `https://www.youtube.com/results?search_query=${encodeURIComponent(`${info.artist} ${info.title}`)}`;
  pills.push(`<a class="pill" href="${esc(yt)}" target="_blank" rel="noopener">▶ Escuchar en YouTube</a>`);

  const chords = songChords();
  let body = "";
  for (const it of items) {
    if (it.type === "section") body += `<div class="section">${esc(it.text)}</div>`;
    else if (it.type === "gap") body += `<div class="line gap"></div>`;
    else if (it.type === "chords") {
      body += `<div class="chord-row">${it.toks.map((t) => (t.c ? `<span class="c" data-c="${T(t.c)}">${T(t.c)}</span>` : `<span class="x">${esc(t.x)}</span>`)).join("")}</div>`;
    } else {
      const seg = (c, l) => `<span class="seg"><span class="c"${c ? ` data-c="${T(c)}"` : ""}>${c ? T(c) : ""}</span><span class="l">${esc(l) || " "}</span></span>`;
      // Group segments into whole words so a narrow screen only wraps between words.
      let html = "", word = "";
      for (const s of it.segs) {
        const pieces = s.l.split(/(?<=\s)/); // "they're g" -> ["they're ", "g"]
        pieces.forEach((p, i) => {
          word += seg(i === 0 ? s.c : null, p);
          if (/\s$/.test(p)) { html += `<span class="w">${word}</span>`; word = ""; }
        });
        if (!pieces.length) word += seg(s.c, "");
      }
      if (word) html += `<span class="w">${word}</span>`;
      body += `<div class="line${it.hasChords ? "" : " no-chords"}">${html}</div>`;
    }
  }

  const idx = currentList.findIndex((s) => s.slug === song.slug);
  const prev = idx > 0 ? currentList[idx - 1] : null;
  const next = idx >= 0 && idx < currentList.length - 1 ? currentList[idx + 1] : null;

  view.innerHTML = `
    <div class="song-head">
      <h2>${esc(info.title)}</h2>
      <div class="by">${esc(info.artist)}</div>
      <div class="meta-pills">${pills.join("")}</div>
    </div>
    ${prefs.diagrams && !prefs.lyricsOnly && chords.length ? `<div class="diagrams">${chords.map((c) => `<div class="diagram" data-c="${esc(c)}"><div class="name">${esc(c)}</div>${diagramSVG(c)}</div>`).join("")}</div>` : ""}
    <article class="sheet${prefs.lyricsOnly ? " lyrics-only" : ""}">${body}</article>
    <nav class="pager">
      ${prev ? `<a href="#/s/${prev.slug}"><small>← Anterior</small><span>${esc(prev.title)}</span></a>` : "<span></span>"}
      ${next ? `<a class="next" href="#/s/${next.slug}"><small>Siguiente →</small><span>${esc(next.title)}</span></a>` : "<span></span>"}
    </nav>`;

  $("#tr-val").textContent = tr > 0 ? `+${tr}` : String(tr);
  $("#sp-val").textContent = song.speed;
}

function saveSong() {
  store.set(`song:${song.slug}`, { tr: song.tr, speed: song.speed });
}

function updateFavButton() {
  const btn = $("#fav");
  const on = favs.has(song.slug);
  btn.setAttribute("aria-pressed", on);
  btn.querySelector("use").setAttribute("href", on ? "#i-star" : "#i-star-o");
}

// Chord popover on tap.
document.addEventListener("click", (e) => {
  $(".pop")?.remove();
  const el = e.target.closest("[data-c]");
  if (!el || !view.contains(el) || el.classList.contains("diagram")) return;
  const name = el.dataset.c;
  const svg = diagramSVG(name);
  if (!svg) return;
  const pop = document.createElement("div");
  pop.className = "pop";
  pop.innerHTML = `<div class="name">${esc(name)}</div>${svg}`;
  document.body.append(pop);
  const r = el.getBoundingClientRect();
  const w = pop.offsetWidth, h = pop.offsetHeight;
  pop.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.left + r.width / 2 - w / 2)) + "px";
  pop.style.top = (r.top - h - 8 > 60 ? r.top - h - 8 : r.bottom + 8) + "px";
});
addEventListener("scroll", () => !scrolling && $(".pop")?.remove(), { passive: true });

// ---------------------------------------------------------------------------
// Auto-scroll

const SPEEDS = [6, 9, 13, 18, 24, 31, 40, 50, 62, 76]; // px per second
let scrolling = false;
let lastT = 0;
let carry = 0;

function setScrolling(on) {
  scrolling = on;
  $("#play use").setAttribute("href", on ? "#i-pause" : "#i-play");
  $("#play").setAttribute("aria-pressed", on);
  if (on) { lastT = performance.now(); carry = 0; requestAnimationFrame(tick); }
}

function tick(t) {
  if (!scrolling) return;
  carry += (SPEEDS[song.speed - 1] * (t - lastT)) / 1000;
  lastT = t;
  const step = Math.floor(carry);
  if (step >= 1) {
    carry -= step;
    window.scrollBy(0, step);
    if (innerHeight + scrollY >= document.documentElement.scrollHeight - 2) return setScrolling(false);
  }
  requestAnimationFrame(tick);
}

$("#play").onclick = () => setScrolling(!scrolling);

dock.addEventListener("click", (e) => {
  const act = e.target.closest("[data-act]")?.dataset.act;
  if (!act || !song) return;
  if (act === "tr+" || act === "tr-") {
    song.tr += act === "tr+" ? 1 : -1;
    if (song.tr > 11 || song.tr < -11) song.tr = 0;
    saveSong();
    const y = scrollY;
    drawSong();
    window.scrollTo(0, y);
  } else {
    song.speed = Math.max(1, Math.min(SPEEDS.length, song.speed + (act === "sp+" ? 1 : -1)));
    $("#sp-val").textContent = song.speed;
    saveSong();
  }
});

// Keep the screen on while a song is open.
let wakeLock = null;
async function keepAwake(on) {
  try {
    if (on && !wakeLock && "wakeLock" in navigator) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => (wakeLock = null));
    } else if (!on && wakeLock) {
      await wakeLock.release();
      wakeLock = null;
    }
  } catch {}
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && song && location.hash.startsWith("#/s/")) keepAwake(true);
});

// ---------------------------------------------------------------------------
// Menu

const THEMES = [["", "Automático"], ["light", "Claro"], ["dark", "Oscuro"], ["stage", "Escenario (alto contraste)"]];

function renderMenu() {
  const inSong = location.hash.startsWith("#/s/");
  const check = (on) => (on ? `<span class="check">✓</span>` : "");
  let html = "";
  if (inSong) {
    html += `
      <button data-m="size-">Letra más pequeña <span>A−</span></button>
      <button data-m="size+">Letra más grande <span>A+</span></button>
      <button data-m="diagrams">Diagramas de acordes ${check(prefs.diagrams)}</button>
      <button data-m="lyrics">Solo letra (sin acordes) ${check(prefs.lyricsOnly)}</button>
      <hr>`;
  }
  html += THEMES.map(([id, label]) => `<button data-m="theme:${id}">${label} ${check(prefs.theme === id)}</button>`).join("");
  if (inSong && song?.meta.source) html += `<hr><a href="${esc(song.meta.source)}" target="_blank" rel="noopener">Ver en el sitio antiguo ↗</a>`;
  $("#menu").innerHTML = html;
}

$("#menu-btn").onclick = (e) => {
  e.stopPropagation();
  const m = $("#menu");
  if (m.hidden) renderMenu();
  m.hidden = !m.hidden;
};
document.addEventListener("click", (e) => {
  const m = $("#menu");
  if (m.hidden || e.target.closest("#menu-btn")) return;
  const btn = e.target.closest("[data-m]");
  if (!btn) { if (!e.target.closest("#menu")) m.hidden = true; return; }
  const act = btn.dataset.m;
  if (act === "size+" || act === "size-") prefs.size = Math.max(13, Math.min(34, prefs.size + (act === "size+" ? 2 : -2)));
  else if (act === "diagrams") prefs.diagrams = !prefs.diagrams;
  else if (act === "lyrics") prefs.lyricsOnly = !prefs.lyricsOnly;
  else if (act.startsWith("theme:")) prefs.theme = act.slice(6);
  savePrefs();
  applyPrefs();
  if (song && location.hash.startsWith("#/s/") && (act === "diagrams" || act === "lyrics")) drawSong();
  renderMenu();
});

// ---------------------------------------------------------------------------
// Routing

function setMode(mode) {
  const inSong = mode === "song";
  $("#back").hidden = !inSong;
  $("#fav").hidden = !inSong;
  $("#brand h1").hidden = inSong && innerWidth < 560;
  dock.hidden = !inSong;
  $("#menu").hidden = true;
  $(".pop")?.remove();
  if (!inSong) { setScrolling(false); song = null; }
  keepAwake(inSong);
}

let lastRoute = "";
function route() {
  const hash = location.hash || "#/";
  if (lastRoute === "#/" || lastRoute === "") listScroll = scrollY;
  setScrolling(false);
  const m = hash.match(/^#\/s\/([^/?#]+)/);
  if (m) renderSong(decodeURIComponent(m[1]));
  else renderList();
  lastRoute = hash.startsWith("#/s/") ? hash : "#/";
}

$("#back").onclick = () => (location.hash = "#/");
$("#fav").onclick = () => song && toggleFav(song.slug, $("#fav"));
$("#random").onclick = () => {
  const pool = currentList.length ? currentList : songs;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  if (pick) location.hash = `#/s/${pick.slug}`;
};

addEventListener("hashchange", route);
addEventListener("keydown", (e) => {
  if (!song || e.target.matches("input")) return;
  if (e.key === " ") { e.preventDefault(); setScrolling(!scrolling); }
});

await loadIndex();
route();

if ("serviceWorker" in navigator && location.protocol === "https:") {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}
