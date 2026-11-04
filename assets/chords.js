// Chord names, transposition and fingering diagrams.

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const INDEX = {
  C: 0, "B#": 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, Fb: 4, F: 5, "E#": 5,
  "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11, Cb: 11,
};

// "F#m7/C#" -> { root: "F#", quality: "m7", bass: "C#" }
export function parseChord(name) {
  const m = /^([A-G](?:#|b)?)([^/]*)(?:\/([A-G](?:#|b)?))?$/.exec(name);
  return m ? { root: m[1], quality: m[2], bass: m[3] ?? null } : null;
}

function shift(note, steps) {
  return NOTES[(((INDEX[note] + steps) % 12) + 12) % 12];
}

export function transpose(name, steps) {
  const c = parseChord(name);
  if (!c || !steps) return name;
  return shift(c.root, steps) + c.quality + (c.bass ? "/" + shift(c.bass, steps) : "");
}

// ---------------------------------------------------------------------------
// Fingerings: frets low E -> high E, -1 = muted string.

const X = -1;
const OPEN = {
  C: [X, 3, 2, 0, 1, 0], C7: [X, 3, 2, 3, 1, 0], Cmaj7: [X, 3, 2, 0, 0, 0], Cadd9: [X, 3, 2, 0, 3, 0],
  Csus4: [X, 3, 3, 0, 1, 1], Csus2: [X, 3, 0, 0, 1, 3],
  D: [X, X, 0, 2, 3, 2], Dm: [X, X, 0, 2, 3, 1], D7: [X, X, 0, 2, 1, 2], Dm7: [X, X, 0, 2, 1, 1],
  Dmaj7: [X, X, 0, 2, 2, 2], Dsus4: [X, X, 0, 2, 3, 3], Dsus2: [X, X, 0, 2, 3, 0], Dadd9: [X, X, 0, 2, 3, 0],
  E: [0, 2, 2, 1, 0, 0], Em: [0, 2, 2, 0, 0, 0], E7: [0, 2, 0, 1, 0, 0], Em7: [0, 2, 0, 0, 0, 0],
  Emaj7: [0, 2, 1, 1, 0, 0], Esus4: [0, 2, 2, 2, 0, 0],
  F: [1, 3, 3, 2, 1, 1], Fmaj7: [X, X, 3, 2, 1, 0],
  G: [3, 2, 0, 0, 0, 3], G7: [3, 2, 0, 0, 0, 1], Gmaj7: [3, 2, 0, 0, 0, 2], Gsus4: [3, 3, 0, 0, 1, 3],
  A: [X, 0, 2, 2, 2, 0], Am: [X, 0, 2, 2, 1, 0], A7: [X, 0, 2, 0, 2, 0], Am7: [X, 0, 2, 0, 1, 0],
  Amaj7: [X, 0, 2, 1, 2, 0], Asus4: [X, 0, 2, 2, 3, 0], Asus2: [X, 0, 2, 2, 0, 0], A7sus4: [X, 0, 2, 0, 3, 0],
  B7: [X, 2, 1, 2, 0, 2],
};

// Movable barre shapes, relative to the barre fret.
const E_SHAPES = {
  "": [0, 2, 2, 1, 0, 0], m: [0, 2, 2, 0, 0, 0], 7: [0, 2, 0, 1, 0, 0], m7: [0, 2, 0, 0, 0, 0],
  maj7: [0, X, 1, 1, 0, X], sus4: [0, 2, 2, 2, 0, 0], "7sus4": [0, 2, 0, 2, 0, 0],
};
const A_SHAPES = {
  "": [X, 0, 2, 2, 2, 0], m: [X, 0, 2, 2, 1, 0], 7: [X, 0, 2, 0, 2, 0], m7: [X, 0, 2, 0, 1, 0],
  maj7: [X, 0, 2, 1, 2, 0], sus4: [X, 0, 2, 2, 3, 0], sus2: [X, 0, 2, 2, 0, 0], "7sus4": [X, 0, 2, 0, 3, 0],
  dim: [X, 0, 1, 2, 1, X], m7b5: [X, 0, 1, 0, 1, X],
};

// Reduce exotic qualities to the nearest shape we know.
function simplify(q) {
  if (q in A_SHAPES || q in E_SHAPES) return q;
  if (/^(min|mi|-)$/.test(q)) return "m";
  if (/^(M7|maj9|ma7)$/.test(q)) return "maj7";
  if (/^m(9|11)$/.test(q)) return "m7";
  if (/^(9|11|13)$/.test(q)) return "7";
  if (/^(add9|add2|2|6|5)$/.test(q)) return "";
  if (/^m(add9|6)$/.test(q)) return "m";
  if (/^(sus)$/.test(q)) return "sus4";
  if (/^(°|dim7|o)$/.test(q)) return "dim";
  if (q.startsWith("m")) return "m";
  return "";
}

export function fingering(name) {
  const c = parseChord(name);
  if (!c) return null;
  const key = c.root + c.quality;
  const enh = NOTES[INDEX[c.root]] + c.quality;
  if (OPEN[key]) return OPEN[key];
  if (OPEN[enh]) return OPEN[enh];
  const q = simplify(c.quality);
  if (OPEN[NOTES[INDEX[c.root]] + q]) return OPEN[NOTES[INDEX[c.root]] + q];
  const eFret = (INDEX[c.root] - INDEX.E + 12) % 12 || 12;
  const aFret = (INDEX[c.root] - INDEX.A + 12) % 12 || 12;
  const useA = A_SHAPES[q] && (!E_SHAPES[q] || aFret <= eFret);
  const [shape, fret] = useA ? [A_SHAPES[q], aFret] : [E_SHAPES[q] ?? E_SHAPES[""], eFret];
  return shape.map((f) => (f < 0 ? X : f + fret));
}

// ---------------------------------------------------------------------------
// SVG diagram.

export function diagramSVG(name) {
  const frets = fingering(name);
  if (!frets) return "";
  const played = frets.filter((f) => f > 0);
  const max = Math.max(...played, 0);
  const min = Math.min(...played, 99);
  const base = max <= 4 ? 1 : min;
  const W = 74, H = 88, left = 12, top = 18, gap = 10, fretH = 14;
  let s = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="${name}">`;
  // Nut or starting fret label.
  if (base === 1) s += `<rect x="${left}" y="${top - 2}" width="${gap * 5}" height="3" fill="currentColor"/>`;
  else s += `<text x="${left - 3}" y="${top + 10}" font-size="9" text-anchor="end" fill="currentColor">${base}</text>`;
  for (let i = 0; i <= 4; i++) {
    s += `<line x1="${left}" x2="${left + gap * 5}" y1="${top + i * fretH}" y2="${top + i * fretH}" stroke="currentColor" stroke-opacity=".35"/>`;
  }
  for (let i = 0; i < 6; i++) {
    s += `<line x1="${left + i * gap}" x2="${left + i * gap}" y1="${top}" y2="${top + 4 * fretH}" stroke="currentColor" stroke-opacity=".55"/>`;
  }
  // Barre: lowest fret shared by several strings from the bass side.
  const barreFret = min;
  const barreStrings = frets.map((f, i) => (f === barreFret ? i : -1)).filter((i) => i >= 0);
  if (barreFret > 0 && barreStrings.length >= 3 && frets.every((f) => f < 0 || f >= barreFret) && frets[barreStrings[0]] === barreFret) {
    const y = top + (barreFret - base + 0.5) * fretH;
    const x1 = left + barreStrings[0] * gap, x2 = left + barreStrings.at(-1) * gap;
    s += `<rect x="${x1 - 4}" y="${y - 4}" width="${x2 - x1 + 8}" height="8" rx="4" fill="var(--chord)"/>`;
  }
  frets.forEach((f, i) => {
    const x = left + i * gap;
    if (f < 0) s += `<text x="${x}" y="${top - 6}" font-size="9" text-anchor="middle" fill="currentColor" fill-opacity=".6">×</text>`;
    else if (f === 0) s += `<circle cx="${x}" cy="${top - 9}" r="3" fill="none" stroke="currentColor" stroke-opacity=".7"/>`;
    else s += `<circle cx="${x}" cy="${top + (f - base + 0.5) * fretH}" r="4.2" fill="var(--chord)"/>`;
  });
  return s + "</svg>";
}
