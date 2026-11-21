// Komposition ohne Audio: aus einem Seed entstehen Tonart, Akkordfolge, Bass, Melodie und Drums.
// Alles deterministisch, damit ein Stück per Link teilbar ist.

export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (r, a) => a[Math.floor(r() * a.length)];

export const NOTE_NAMES = ['C', 'Des', 'D', 'Es', 'E', 'F', 'Ges', 'G', 'As', 'A', 'B', 'H'];
const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10]; // natürliches Moll

// Stufenfolgen, die nach Lo-Fi klingen (0-basiert: 0 = I, 1 = ii ...)
const PROGRESSIONS = {
  major: [[1, 4, 0, 0], [0, 5, 1, 4], [3, 2, 1, 0], [0, 3, 1, 4], [3, 4, 2, 5], [1, 4, 0, 5]],
  minor: [[0, 5, 2, 6], [0, 3, 6, 2], [5, 6, 0, 0], [0, 6, 5, 4], [3, 4, 0, 0], [0, 3, 4, 0]],
};

// Akkord auf Stufe `deg` als Terzschichtung: Grundton, Terz, Quinte, Septime, None
export function chordTones(scale, deg, size) {
  const out = [];
  for (let k = 0; k < size; k++) {
    const idx = deg + k * 2;
    out.push(scale[idx % 7] + 12 * Math.floor(idx / 7));
  }
  return out;
}

// Enge Lage um eine Zielhöhe, damit die Akkorde weich ineinander übergehen
export function voice(pcs, center) {
  return pcs.map((p) => {
    let n = p;
    while (n < center - 6) n += 12;
    while (n >= center + 6) n -= 12;
    return n;
  }).sort((a, b) => a - b);
}

export const MOODS = {
  regen: { name: 'Regen', bpm: [68, 76], mode: 'minor', swing: 0.58, density: 0.45 },
  kaffee: { name: 'Kaffee', bpm: [82, 92], mode: 'major', swing: 0.62, density: 0.6 },
  spaet: { name: 'Spät', bpm: [60, 68], mode: 'minor', swing: 0.55, density: 0.3 },
  sonntag: { name: 'Sonntag', bpm: [74, 84], mode: 'major', swing: 0.6, density: 0.5 },
};

export function compose(seed, moodId = 'regen') {
  const mood = MOODS[moodId] ?? MOODS.regen;
  const r = rng(seed);
  const root = Math.floor(r() * 12);
  const scale = (mood.mode === 'major' ? MAJOR : MINOR).map((s) => s);
  const bpm = Math.round(mood.bpm[0] + r() * (mood.bpm[1] - mood.bpm[0]));
  const prog = pick(r, PROGRESSIONS[mood.mode]);
  const size = r() < 0.5 ? 4 : 5; // Sept- oder Nonenakkorde

  // 4 Takte Akkorde, je ein Akkord pro Takt
  const chords = prog.map((deg) => {
    const pcs = chordTones(scale, deg, size).map((p) => p + root);
    return { deg, root: 36 + ((scale[deg] + root) % 12), notes: voice(pcs, 60) };
  });

  // Bass: Grundton auf 1, gelegentlich Quinte oder Durchgang auf 3/4
  const bass = chords.map((c) => {
    const steps = new Array(16).fill(null);
    steps[0] = c.root;
    if (r() < 0.6) steps[10] = c.root + (r() < 0.5 ? 7 : 12);
    if (r() < 0.4) { // Durchgangston aus der Tonleiter: Nachbarstufe oder Quarte über dem Grundton
      const pcs = scale.map((x) => (x + root) % 12);
      const cands = [-2, -1, 1, 2, 5].map((d) => c.root + d).filter((n) => pcs.includes(n % 12));
      steps[14] = pick(r, cands);
    }
    return steps;
  });

  // Melodie: Pentatonik der Tonart, eher Akkordtöne auf schweren Zählzeiten, viele Pausen
  const penta = mood.mode === 'major' ? [0, 2, 4, 7, 9] : [0, 3, 5, 7, 10];
  const melodyNotes = [];
  for (let o = 0; o < 2; o++) for (const p of penta) melodyNotes.push(60 + root % 12 + p + o * 12 - (root % 12 > 5 ? 12 : 0));
  let last = Math.floor(melodyNotes.length / 2);
  const melody = chords.map((c) => {
    const steps = new Array(16).fill(null);
    for (let s = 0; s < 16; s += 2) {
      const strong = s % 8 === 0;
      if (r() > mood.density * (strong ? 1.2 : 0.8)) continue;
      // kleine Schritte bevorzugen
      last = Math.max(0, Math.min(melodyNotes.length - 1, last + pick(r, [-2, -1, -1, 0, 1, 1, 2])));
      let n = melodyNotes[last];
      if (strong) { // auf Akkordton ziehen
        const near = c.notes.map((x) => x + 12 * Math.round((n - x) / 12));
        n = near.reduce((b, x) => (Math.abs(x - n) < Math.abs(b - n) ? x : b), near[0]);
      }
      steps[s] = n;
    }
    return steps;
  });

  // Drums: Kick, Snare auf 2 und 4, Hi-Hats mit Variation
  const kickBase = pick(r, [[0, 10], [0, 7, 10], [0, 3, 10], [0, 8, 11]]);
  const drums = Array.from({ length: 4 }, (_, bar) => {
    const kick = new Array(16).fill(0), snare = new Array(16).fill(0), hat = new Array(16).fill(0);
    for (const s of kickBase) kick[s] = 1;
    snare[4] = snare[12] = 1;
    if (bar === 3 && r() < 0.5) snare[15] = 0.5; // kleiner Auftakt
    for (let s = 0; s < 16; s += 2) hat[s] = s % 4 === 0 ? 0.9 : 0.6;
    if (r() < 0.5) for (let s = 1; s < 16; s += 4) if (r() < 0.4) hat[s + 2] = 0.35;
    return { kick, snare, hat };
  });

  return {
    seed, mood: moodId, bpm, swing: mood.swing, root, mode: mood.mode,
    key: `${NOTE_NAMES[root]}-${mood.mode === 'major' ? 'Dur' : 'Moll'}`,
    chords, bass, melody, drums,
  };
}

// Startzeit eines 16tel-Schritts mit Swing (jede zweite 16tel verschoben)
export function stepTime(step, bpm, swing) {
  const pair = 60 / bpm / 2; // Dauer zweier 16tel = eine Achtel
  const base = Math.floor(step / 2) * pair;
  return step % 2 === 0 ? base : base + pair * swing;
}

// Seed in Link speichern und zurücklesen
export function encode(seed, mood) { return `${mood}-${seed.toString(36)}`; }
export function decode(hash) {
  const m = /^#?([a-z]+)-([0-9a-z]{1,8})$/.exec(hash ?? '');
  if (!m || !MOODS[m[1]]) return null;
  const seed = parseInt(m[2], 36);
  return Number.isFinite(seed) ? { mood: m[1], seed } : null;
}
