import { compose, rng, MOODS, encode, decode } from './gen.mjs';
import { Engine } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const engine = new Engine();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

let mood = 'regen', seed = (Math.random() * 2 ** 31) >>> 0, song = null, autoTimer = null, sleepTimer = null;
const fromHash = decode(location.hash);
if (fromHash) ({ mood, seed } = fromHash);

// ---------- Titel ----------
const STEMS = ['Still', 'Spät', 'Leis', 'Blau', 'Warm', 'Müd', 'Fern', 'Weich', 'Nass', 'Sanft', 'Lau', 'Grau', 'Kühl'];
const NOUNS = {
  er: ['Bahnhof', 'Regen', 'Mond', 'Tee', 'Balkon', 'Nachtbus', 'Hinterhof', 'Plattenspieler', 'Umweg'],
  e: ['Straße', 'Laterne', 'Küche', 'Stadt', 'Brücke', 'Tasse', 'Ecke', 'Haltestelle', 'Wolke'],
  es: ['Fenster', 'Dach', 'Café', 'Zimmer', 'Licht', 'Viertel', 'Kissen', 'Treppenhaus', 'Radio'],
};
function title(s) {
  const r = rng(s ^ 0x7a11);
  const stem = STEMS[Math.floor(r() * STEMS.length)];
  const end = ['er', 'e', 'es'][Math.floor(r() * 3)];
  const noun = NOUNS[end][Math.floor(r() * NOUNS[end].length)];
  return `${stem}${end} ${noun}`;
}

// ---------- Oberfläche ----------
$('moods').innerHTML = Object.entries(MOODS).map(([k, m]) => `<button type="button" role="radio" data-k="${k}">${m.name}</button>`).join('');
for (const b of $('moods').children) b.addEventListener('click', () => { if (mood === b.dataset.k) return; mood = b.dataset.k; newSong(seed); });

const LAYERS = [['drums', 'Drums'], ['keys', 'Akkorde'], ['bass', 'Bass'], ['melody', 'Melodie'], ['crackle', 'Knistern'], ['rain', 'Regen']];
$('layers').innerHTML = LAYERS.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${engine.layers[k]}">${l}</button>`).join('');
for (const b of $('layers').children) b.addEventListener('click', () => {
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  engine.setLayer(b.dataset.k, on);
  if (reduce && scene) draw(); // Regen ein/aus auch ohne Animation sichtbar machen
});

function newSong(s = (Math.random() * 2 ** 31) >>> 0) {
  seed = s;
  song = compose(seed, mood);
  engine.swap(song);
  $('title').textContent = title(seed);
  $('meta').textContent = `${song.key} · ${song.bpm} BPM · ${MOODS[mood].name}`;
  document.title = `${title(seed)} · Nachtradio`;
  for (const b of $('moods').children) b.setAttribute('aria-checked', String(b.dataset.k === mood));
  history.replaceState(null, '', '#' + encode(seed, mood));
  buildScene();
  scheduleAuto();
}

function setPlaying(p) {
  $('playIcon').setAttribute('d', p ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  $('play').setAttribute('aria-label', p ? 'Pause' : 'Abspielen');
}
async function toggle() {
  if (engine.playing) { engine.pause(); engine.cancelFade(); setPlaying(false); }
  else {
    try { await engine.play(); setPlaying(true); engine.setWarmth(+$('warm').value); engine.setVolume(+$('vol').value); }
    catch { say('Audio konnte nicht gestartet werden.'); }
  }
  scheduleAuto();
}
$('play').addEventListener('click', toggle);
$('next').addEventListener('click', () => newSong());
$('share').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(location.href); say('Link kopiert. Wer ihn öffnet, hört dasselbe Stück.'); }
  catch { say(location.href); }
});
$('vol').addEventListener('input', (e) => engine.setVolume(+e.target.value));
$('warm').addEventListener('input', (e) => engine.setWarmth(+e.target.value));
$('auto').addEventListener('change', scheduleAuto);
$('sleep').addEventListener('change', (e) => {
  clearTimeout(sleepTimer);
  const min = +e.target.value;
  if (!min) return say('Schlaftimer aus.');
  say(`Blendet in ${min} Minuten aus.`);
  sleepTimer = setTimeout(async () => {
    $('sleep').value = '0';
    if (!engine.playing) return say('Schlaftimer abgelaufen.');
    const finished = await engine.fadeOut(30);
    if (!finished) return; // zwischendurch von Hand bedient
    setPlaying(false); scheduleAuto(); say('Gute Nacht.');
  }, min * 60_000 - 30_000);
});

function scheduleAuto() {
  clearTimeout(autoTimer);
  if ($('auto').checked && engine.playing) autoTimer = setTimeout(() => newSong(), 180_000);
}

addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, select') || e.metaKey || e.ctrlKey || e.altKey || e.repeat || !e.key) return;
  if (e.key === ' ' && !e.target.closest?.('button')) { e.preventDefault(); toggle(); }
  else if (e.key.toLowerCase() === 'n') newSong();
});

let msgTimer;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => ($('msg').textContent = ''), 4000); }

// ---------- Szene: Blick aus dem Fenster auf eine Stadt bei Nacht ----------
const cv = $('scene'), cx = cv.getContext('2d');
let scene = null, pulse = 0, drops = [];
function resize() {
  const dpr = Math.min(2, devicePixelRatio || 1);
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildScene();
}
function buildScene() {
  const r = rng(seed ^ 0xc17), W = innerWidth, H = innerHeight;
  const hue = { regen: 225, kaffee: 25, spaet: 250, sonntag: 200 }[mood];
  const layers = [];
  for (let L = 0; L < 3; L++) {
    const bs = [];
    let x = -20;
    while (x < W + 20) {
      const w = 30 + r() * (90 - L * 15), h = H * (0.18 + r() * (0.25 + L * 0.12)) * (1 - L * 0.12);
      const wins = [];
      for (let wy = H - h + 10; wy < H - 14; wy += 13) for (let wx = x + 6; wx < x + w - 8; wx += 10) if (r() < 0.22 + L * 0.1) wins.push([wx, wy, r()]);
      bs.push({ x, w, h, wins });
      x += w + r() * 8;
    }
    layers.push(bs);
  }
  const lights = Array.from({ length: 26 }, () => ({ x: r() * W, y: H * (0.45 + r() * 0.5), s: 10 + r() * 40, a: 0.05 + r() * 0.12, v: (r() - 0.5) * 0.08, h: hue + (r() - 0.5) * 60 }));
  // Gebäude einmal vorrendern; pro Frame werden nur die pulsierenden Fenster nachgezeichnet
  const dpr = Math.min(2, devicePixelRatio || 1), city = document.createElement('canvas');
  city.width = W * dpr; city.height = H * dpr;
  const c2 = city.getContext('2d'); c2.setTransform(dpr, 0, 0, dpr, 0, 0);
  const pulsing = [];
  layers.forEach((bs, L) => {
    for (const b of bs) {
      c2.fillStyle = `hsl(${hue} 25% ${5 + L * 3}%)`; c2.fillRect(b.x, H - b.h, b.w, b.h);
      for (const [wx, wy, k] of b.wins) {
        c2.fillStyle = `rgb(242 200 121 / ${(0.25 + k * 0.5) * (0.5 + L * 0.25)})`; c2.fillRect(wx, wy, 4, 6);
        if (k > 0.85) pulsing.push([wx, wy, 0.5 + L * 0.25]);
      }
    }
  });
  scene = { hue, city, pulsing, lights };
  drops = Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * H, l: 8 + r() * 18, v: 4 + r() * 6 }));
  if (reduce) draw();
}
function draw() {
  const W = innerWidth, H = innerHeight, { hue, city, pulsing, lights } = scene;
  const g = cx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `hsl(${hue} 35% 7%)`); g.addColorStop(1, `hsl(${hue} 30% 16%)`);
  cx.fillStyle = g; cx.fillRect(0, 0, W, H);
  // Mond
  cx.fillStyle = 'rgb(242 200 121 / 0.85)'; cx.beginPath(); cx.arc(W * 0.78, H * 0.18, 26, 0, 7); cx.fill();
  cx.fillStyle = `hsl(${hue} 35% 8%)`; cx.beginPath(); cx.arc(W * 0.78 + 11, H * 0.18 - 7, 24, 0, 7); cx.fill();
  cx.drawImage(city, 0, 0, W, H);
  if (pulse > 0.02) for (const [wx, wy, f] of pulsing) { cx.fillStyle = `rgb(242 200 121 / ${pulse * 0.35 * f})`; cx.fillRect(wx, wy, 4, 6); }
  // Unscharfe Lichter wie auf einer nassen Scheibe
  for (const p of lights) {
    const rg = cx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.s);
    rg.addColorStop(0, `hsl(${p.h} 70% 70% / ${p.a + pulse * 0.04})`); rg.addColorStop(1, `hsl(${p.h} 70% 70% / 0)`);
    cx.fillStyle = rg; cx.beginPath(); cx.arc(p.x, p.y, p.s, 0, 7); cx.fill();
  }
  if (engine.layers.rain || mood === 'regen') {
    cx.strokeStyle = 'rgb(200 210 235 / 0.16)'; cx.lineWidth = 1;
    cx.beginPath();
    for (const d of drops) { cx.moveTo(d.x, d.y); cx.lineTo(d.x - d.l * 0.15, d.y + d.l); }
    cx.stroke();
  }
}
let lastT = 0;
function frame(t) {
  const k = lastT ? Math.min(4, (t - lastT) / (1000 / 60)) : 1; // Bewegung in 60-fps-Schritten, unabhängig von der Bildrate
  lastT = t;
  if (!reduce) {
    pulse *= 0.92 ** k;
    for (const p of scene.lights) { p.x += p.v * k; if (p.x < -50) p.x = innerWidth + 50; if (p.x > innerWidth + 50) p.x = -50; }
    for (const d of drops) { d.y += d.v * k; d.x -= d.v * 0.15 * k; if (d.y > innerHeight) { d.y = -20; d.x = Math.random() * innerWidth; } }
    draw();
  }
  requestAnimationFrame(frame);
}
engine.onState = (state) => { if (engine.playing && state !== 'running') say('Audio wurde vom System angehalten. Zum Fortsetzen Play drücken.'); if (state !== 'running' && engine.playing) { engine.pause(); setPlaying(false); } };
engine.onStep = (ev) => { if (ev.kick) setTimeout(() => { pulse = 1; }, Math.max(0, (ev.t - engine.ctx.currentTime) * 1000)); };

addEventListener('resize', resize);
addEventListener('hashchange', () => { const h = decode(location.hash); if (h && (h.seed !== seed || h.mood !== mood)) { mood = h.mood; newSong(h.seed); } });
newSong(seed);
resize();
requestAnimationFrame(frame);
