import { compose, rng, MOODS, encode, decode } from './gen.mjs';
import { Engine } from './audio.mjs';

const $ = (id) => document.getElementById(id);
const engine = new Engine();
const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

// Vorlieben im Browser merken; ohne Speicher (privates Fenster) gelten die Standardwerte
const store = {
  get(k, d) { try { return localStorage.getItem('nachtradio.' + k) ?? d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem('nachtradio.' + k, String(v)); } catch { /* egal */ } },
};
const BGS = { stadt: 'Stadt', meer: 'Meer', wald: 'Wald', sterne: 'Sterne' };
let bg = BGS[store.get('bg')] ? store.get('bg') : 'stadt';

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

$('bgs').innerHTML = Object.entries(BGS).map(([k, l]) => `<button type="button" role="radio" data-k="${k}">${l}</button>`).join('');
function markBg() { for (const b of $('bgs').children) b.setAttribute('aria-checked', String(b.dataset.k === bg)); }
for (const b of $('bgs').children) b.addEventListener('click', () => { bg = b.dataset.k; store.set('bg', bg); markBg(); buildScene(); });
markBg();

const LAYERS = [['drums', 'Drums'], ['keys', 'Akkorde'], ['bass', 'Bass'], ['melody', 'Melodie'], ['crackle', 'Knistern'], ['rain', 'Regen']];
$('layers').innerHTML = LAYERS.map(([k, l]) => `<button type="button" data-k="${k}" aria-pressed="${engine.layers[k]}">${l}</button>`).join('');
for (const b of $('layers').children) b.addEventListener('click', () => {
  const on = b.getAttribute('aria-pressed') !== 'true';
  b.setAttribute('aria-pressed', String(on));
  engine.setLayer(b.dataset.k, on);
  if (reduce && scene) draw(0); // Regen ein/aus auch ohne Animation sichtbar machen
});

function newSong(s = (Math.random() * 2 ** 31) >>> 0) {
  seed = s;
  song = compose(seed, mood);
  engine.swap(song);
  $('title').textContent = title(seed);
  $('meta').textContent = `${song.key} · ${song.bpm} BPM · ${MOODS[mood].name}`;
  $('npTitle').textContent = title(seed);
  document.title = `${title(seed)} · Nachtradio`;
  for (const b of $('moods').children) b.setAttribute('aria-checked', String(b.dataset.k === mood));
  history.replaceState(null, '', '#' + encode(seed, mood));
  buildScene();
  scheduleAuto();
}

function setPlaying(p) {
  $('playIcon').setAttribute('d', p ? 'M7 5h4v14H7zM13 5h4v14h-4z' : 'M8 5v14l11-7z');
  $('play').setAttribute('aria-label', p ? 'Pause' : 'Abspielen');
  wake(); // auch Schlaftimer und System-Pause holen das Menü zurück
}
async function toggle() {
  if (engine.playing) { engine.pause(); engine.cancelFade(); setPlaying(false); }
  else {
    try { await engine.play(); setPlaying(true); engine.setWarmth(+$('warm').value); engine.setVolume(+$('vol').value); }
    catch { say('Audio konnte nicht gestartet werden.'); }
  }
  scheduleAuto();
  wake();
}
$('play').addEventListener('click', toggle);

// ---------- Vollbild ----------
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
const fsOk = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);
function toggleFullscreen() {
  if (fsEl()) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else {
    const el = document.documentElement;
    Promise.resolve((el.requestFullscreen || el.webkitRequestFullscreen).call(el)).catch(() => say('Vollbild wurde vom Browser abgelehnt.'));
  }
}
function markFullscreen() { $('fs').textContent = fsEl() ? 'Vollbild beenden' : 'Vollbild'; }
$('fs').hidden = !fsOk; // z. B. iPhone-Safari kann kein Vollbild für Seiten
$('fs').addEventListener('click', toggleFullscreen);
document.addEventListener('fullscreenchange', markFullscreen);
document.addEventListener('webkitfullscreenchange', markFullscreen);

// ---------- Ruhemodus: Menü blendet sich aus, wenn Maus und Tastatur ruhen ----------
const IDLE_MS = 3000;
let idleTimer = null;
$('autohide').checked = store.get('autohide', '1') === '1';
$('clockOn').checked = store.get('clock', '1') === '1';
function setIdle(on) { document.body.classList.toggle('idle', on); }
function wake() {
  setIdle(false);
  clearTimeout(idleTimer);
  if (!$('autohide').checked || !engine.playing) return; // ohne Musik bleibt das Menü stehen
  idleTimer = setTimeout(() => {
    // Nicht ausblenden, solange die Maus auf dem Menü liegt oder eine Auswahlliste offen ist.
    // Nur mit Maus prüfen: auf Touch bleibt :hover nach dem Tippen hängen (#4).
    if ((matchMedia('(hover: hover)').matches && $('player').matches(':hover')) || document.activeElement?.tagName === 'SELECT') return wake();
    setIdle(true);
  }, IDLE_MS);
}
for (const ev of ['pointermove', 'pointerdown', 'wheel', 'touchstart']) addEventListener(ev, wake, { passive: true });
$('autohide').addEventListener('change', (e) => { store.set('autohide', e.target.checked ? '1' : '0'); wake(); });
function showClock() { $('np').classList.toggle('no-clock', !$('clockOn').checked); }
$('clockOn').addEventListener('change', (e) => { store.set('clock', e.target.checked ? '1' : '0'); showClock(); });
showClock();
function tick() { $('clock').textContent = new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); }
tick(); setInterval(tick, 10_000);
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
  const k = e.key.toLowerCase();
  if (k === 'h') { // Menü von Hand aus- und einblenden
    if (document.body.classList.contains('idle')) wake();
    else { clearTimeout(idleTimer); setIdle(true); }
    return;
  }
  wake();
  if (e.key === ' ' && !e.target.closest?.('button')) { e.preventDefault(); toggle(); }
  else if (k === 'n') newSong();
  else if (k === 'f' && fsOk) toggleFullscreen();
});

let msgTimer;
function say(t) { $('msg').textContent = t; clearTimeout(msgTimer); msgTimer = setTimeout(() => ($('msg').textContent = ''), 4000); }

// ---------- Szene: Blick aus dem Fenster, Hintergrund wählbar ----------
// Aufbau je Szene: "back" (Himmel, Mond) und "front" (Silhouetten) werden einmal vorgerendert,
// pro Frame kommen nur Sterne, Lichter, Spiegelung und Regen dazu.
const cv = $('scene'), cx = cv.getContext('2d');
let scene = null, pulse = 0, drops = [];
const dprNow = () => Math.min(2, devicePixelRatio || 1);
function resize() {
  const dpr = dprNow();
  cv.width = innerWidth * dpr; cv.height = innerHeight * dpr;
  cx.setTransform(dpr, 0, 0, dpr, 0, 0);
  buildScene();
}
function layer(W, H) {
  const dpr = dprNow(), c = document.createElement('canvas');
  c.width = W * dpr; c.height = H * dpr;
  const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, 0, 0);
  return [c, g];
}
function ridge(g, r, W, H, base, amp, step, color) {
  g.fillStyle = color; g.beginPath(); g.moveTo(0, H);
  let y = base;
  for (let x = 0; x <= W + step; x += step) { y = Math.max(base - amp * 3, Math.min(base + amp * 2, y + (r() - 0.5) * amp)); g.lineTo(x, y); }
  g.lineTo(W, H); g.closePath(); g.fill();
}
function moonOn(g, m, hue) {
  const halo = g.createRadialGradient(m.x, m.y, 0, m.x, m.y, 110);
  halo.addColorStop(0, 'rgb(242 200 121 / 0.12)'); halo.addColorStop(1, 'rgb(242 200 121 / 0)');
  g.fillStyle = halo; g.beginPath(); g.arc(m.x, m.y, 110, 0, 7); g.fill();
  g.fillStyle = 'rgb(242 200 121 / 0.85)'; g.beginPath(); g.arc(m.x, m.y, 26, 0, 7); g.fill();
  g.fillStyle = `hsl(${hue} 35% 8%)`; g.beginPath(); g.arc(m.x + 11, m.y - 7, 24, 0, 7); g.fill();
}

const BUILD = {
  stadt(s, gf, r, W, H) {
    for (let L = 0; L < 3; L++) {
      let x = -20;
      while (x < W + 20) {
        const w = 30 + r() * (90 - L * 15), h = H * (0.18 + r() * (0.25 + L * 0.12)) * (1 - L * 0.12);
        gf.fillStyle = `hsl(${s.hue} 25% ${5 + L * 3}%)`; gf.fillRect(x, H - h, w, h);
        for (let wy = H - h + 10; wy < H - 14; wy += 13) for (let wx = x + 6; wx < x + w - 8; wx += 10) {
          if (r() >= 0.22 + L * 0.1) continue;
          const k = r();
          gf.fillStyle = `rgb(242 200 121 / ${(0.25 + k * 0.5) * (0.5 + L * 0.25)})`; gf.fillRect(wx, wy, 4, 6);
          if (k > 0.85) s.pulsing.push([wx, wy, 0.5 + L * 0.25]);
        }
        x += w + r() * 8;
      }
    }
    // Unscharfe Lichter wie auf einer nassen Scheibe
    s.lights = Array.from({ length: 26 }, () => ({ x: r() * W, y: H * (0.45 + r() * 0.5), s: 10 + r() * 40, a: 0.05 + r() * 0.12, v: (r() - 0.5) * 0.08, h: s.hue + (r() - 0.5) * 60 }));
  },
  meer(s, gf, r, W, H) {
    const hz = H * 0.64;
    const sea = gf.createLinearGradient(0, hz, 0, H);
    sea.addColorStop(0, `hsl(${s.hue} 35% 9%)`); sea.addColorStop(1, `hsl(${s.hue} 35% 3%)`);
    gf.fillStyle = sea; gf.fillRect(0, hz, W, H - hz);
    gf.fillStyle = `hsl(${s.hue} 30% 20% / 0.6)`; gf.fillRect(0, hz, W, 1);
    // ruhige Wellenkämme
    for (let i = 0; i < 90; i++) {
      const y = hz + 6 + r() ** 1.6 * (H - hz), w = 10 + r() * 40 * (1 + (y - hz) / (H - hz));
      gf.fillStyle = `hsl(${s.hue} 40% 60% / ${0.04 + r() * 0.05})`; gf.fillRect(r() * W, y, w, 1);
    }
    s.hz = hz;
  },
  wald(s, gf, r, W, H) {
    ridge(gf, r, W, H, H * 0.6, 14, 18, `hsl(${s.hue} 22% 12%)`);
    ridge(gf, r, W, H, H * 0.7, 10, 14, `hsl(${s.hue} 22% 8%)`);
    gf.fillStyle = `hsl(${s.hue} 25% 4%)`;
    gf.fillRect(0, H * 0.9, W, H * 0.1);
    for (let x = -10; x < W + 20; x += 10 + r() * 22) { // Tannen aus drei Dreiecken
      const h = H * (0.1 + r() * 0.16), base = H * (0.9 + r() * 0.03), w = h * 0.42;
      for (let t = 0; t < 3; t++) {
        const top = base - h + t * h * 0.22, bot = base - h * 0.45 + t * h * 0.22;
        gf.beginPath(); gf.moveTo(x, top); gf.lineTo(x - w * (0.55 + t * 0.2), bot); gf.lineTo(x + w * (0.55 + t * 0.2), bot); gf.closePath(); gf.fill();
      }
      gf.fillRect(x - 2, base - h * 0.2, 4, h * 0.2);
    }
    // Glühwürmchen
    s.lights = Array.from({ length: 30 }, () => ({ x: r() * W, y: H * (0.68 + r() * 0.26), ph: r() * 7, s: 1.5 + r() * 1.5 }));
  },
  sterne(s, gf, r, W, H) {
    ridge(gf, r, W, H, H * 0.86, 6, 24, `hsl(${s.hue} 25% 4%)`);
    s.meteor = null; s.nextMeteor = performance.now() + 3000 + Math.random() * 6000;
  },
};

function buildScene() {
  const r = rng(seed ^ 0xc17), W = innerWidth, H = innerHeight;
  const hue = { regen: 225, kaffee: 25, spaet: 250, sonntag: 200 }[mood];
  const [back, gb] = layer(W, H), [front, gf] = layer(W, H);
  const sky = gb.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, `hsl(${hue} 35% 7%)`); sky.addColorStop(1, `hsl(${hue} 30% 16%)`);
  gb.fillStyle = sky; gb.fillRect(0, 0, W, H);
  const s = { hue, kind: bg, back, front, moon: { x: W * 0.78, y: H * 0.18 }, stars: [], pulsing: [], lights: [] };
  if (bg !== 'stadt') {
    const n = bg === 'sterne' ? 420 : 140, top = H * (bg === 'sterne' ? 0.86 : 0.6);
    s.stars = Array.from({ length: n }, () => ({ x: r() * W, y: r() ** 1.3 * top, s: 0.6 + r() * 1.3, a: 0.25 + r() * 0.6, ph: r() * 7 }));
  }
  if (bg === 'sterne') { // Milchstraße als schräges, schwach leuchtendes Band
    for (let i = 0; i < 2600; i++) {
      const u = r(), off = (r() + r() + r() - 1.5) * H * 0.12;
      gb.fillStyle = `rgb(220 225 255 / ${0.03 + r() * 0.12})`;
      gb.fillRect(u * W, H * 0.75 - u * H * 0.6 + off, 1, 1);
    }
  } else moonOn(gb, s.moon, hue);
  BUILD[bg](s, gf, r, W, H);
  scene = s;
  drops = Array.from({ length: 140 }, () => ({ x: r() * W, y: r() * H, l: 8 + r() * 18, v: 4 + r() * 6 }));
  if (reduce) draw(0);
}

function glow(x, y, rad, color, a) {
  const rg = cx.createRadialGradient(x, y, 0, x, y, rad);
  rg.addColorStop(0, `hsl(${color} / ${a})`); rg.addColorStop(1, `hsl(${color} / 0)`);
  cx.fillStyle = rg; cx.beginPath(); cx.arc(x, y, rad, 0, 7); cx.fill();
}
function meteor(s, t, W, H) {
  if (!s.meteor && t > s.nextMeteor && !reduce) {
    const dir = Math.random() < 0.5 ? -1 : 1;
    s.meteor = { x: W * (0.2 + Math.random() * 0.6), y: H * (0.05 + Math.random() * 0.25), vx: dir * (260 + Math.random() * 200), vy: 120 + Math.random() * 80, t0: t };
  }
  const m = s.meteor;
  if (!m) return;
  const p = (t - m.t0) / 900;
  if (p > 1) { s.meteor = null; s.nextMeteor = t + 7000 + Math.random() * 12000; return; }
  const x = m.x + m.vx * p, y = m.y + m.vy * p;
  const gr = cx.createLinearGradient(x, y, x - m.vx * 0.25, y - m.vy * 0.25);
  gr.addColorStop(0, `rgb(255 250 235 / ${0.9 * (1 - p)})`); gr.addColorStop(1, 'rgb(255 250 235 / 0)');
  cx.strokeStyle = gr; cx.lineWidth = 1.5;
  cx.beginPath(); cx.moveTo(x, y); cx.lineTo(x - m.vx * 0.25, y - m.vy * 0.25); cx.stroke();
}
function draw(t) {
  const W = innerWidth, H = innerHeight, s = scene;
  cx.drawImage(s.back, 0, 0, W, H);
  for (const p of s.stars) {
    cx.fillStyle = `rgb(235 235 255 / ${Math.min(1, p.a * (0.65 + 0.35 * Math.sin(t * 0.0015 + p.ph)) + pulse * 0.12)})`;
    cx.fillRect(p.x, p.y, p.s, p.s);
  }
  if (s.kind === 'sterne') meteor(s, t, W, H);
  cx.drawImage(s.front, 0, 0, W, H);
  if (s.kind === 'stadt') {
    if (pulse > 0.02) for (const [wx, wy, f] of s.pulsing) { cx.fillStyle = `rgb(242 200 121 / ${pulse * 0.35 * f})`; cx.fillRect(wx, wy, 4, 6); }
    for (const p of s.lights) glow(p.x, p.y, p.s, `${p.h} 70% 70%`, p.a + pulse * 0.04);
  } else if (s.kind === 'meer') { // Mondspiegelung, flimmert mit der Zeit
    for (let i = 0, y = s.hz + 3; y < H; i++, y += 4 + i * 0.5) {
      const d = (y - s.hz) / (H - s.hz), w = (14 + (y - s.hz) * 0.35) * (0.55 + 0.45 * Math.sin(t * 0.002 + i * 1.3));
      cx.fillStyle = `rgb(242 200 121 / ${0.45 * (1 - d) + pulse * 0.06})`;
      cx.fillRect(s.moon.x - w / 2 + Math.sin(t * 0.001 + i) * 4, y, w, 1.5);
    }
  } else if (s.kind === 'wald') {
    for (const f of s.lights) {
      const a = Math.max(0, Math.sin(t * 0.0018 + f.ph)) * 0.75 + pulse * 0.15;
      if (a > 0.02) glow(f.x + Math.sin(t * 0.0004 + f.ph) * 18, f.y + Math.cos(t * 0.0005 + f.ph * 1.3) * 10, f.s * 4, '60 90% 70%', a);
    }
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
    if (scene.kind === 'stadt') for (const p of scene.lights) { p.x += p.v * k; if (p.x < -50) p.x = innerWidth + 50; if (p.x > innerWidth + 50) p.x = -50; }
    for (const d of drops) { d.y += d.v * k; d.x -= d.v * 0.15 * k; if (d.y > innerHeight) { d.y = -20; d.x = Math.random() * innerWidth; } }
    draw(t);
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
