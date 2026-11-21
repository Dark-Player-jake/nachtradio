// Klangerzeugung und Taktgeber. Alle Instrumente sind synthetisch (Web Audio API).
import { stepTime } from './gen.mjs';

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);

export class Engine {
  constructor() {
    this.ctx = null;
    this.song = null;
    this.layers = { drums: true, keys: true, bass: true, melody: true, crackle: true, rain: false };
    this.playing = false;
    this.onStep = null; // Rückruf für die Visualisierung
  }

  init() {
    if (this.ctx) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = 0.8;
    this.warm = c.createBiquadFilter(); this.warm.type = 'lowpass'; this.warm.frequency.value = 4200; this.warm.Q.value = 0.5;
    const sat = c.createWaveShaper();
    const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = (i / 1023) * 2 - 1; curve[i] = Math.tanh(1.6 * x) / Math.tanh(1.6); }
    sat.curve = curve;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -18; comp.ratio.value = 3; comp.attack.value = 0.01; comp.release.value = 0.25;
    this.bus = c.createGain(); this.bus.gain.value = 0.7;
    this.bus.connect(this.warm).connect(sat).connect(comp).connect(this.master).connect(c.destination);
    // Analyser für die Visualisierung
    this.analyser = c.createAnalyser(); this.analyser.fftSize = 256;
    this.master.connect(this.analyser);
    // Bandleiern: langsames LFO auf die Verstimmung aller Instrumente
    this.wobble = c.createGain(); this.wobble.gain.value = 9;
    const lfo = c.createOscillator(); lfo.frequency.value = 0.35; lfo.connect(this.wobble); lfo.start();
    // Rauschpuffer für Drums und Atmosphäre
    this.noise = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.chan = {};
    for (const k of Object.keys(this.layers)) { const g = c.createGain(); g.gain.value = this.layers[k] ? 1 : 0; g.connect(this.bus); this.chan[k] = g; }
    this.chan.drums.gain.value *= 0.9;
    this.startAmbience();
  }

  setLayer(k, on) {
    this.layers[k] = on;
    if (this.chan) this.chan[k].gain.setTargetAtTime(on ? 1 : 0, this.ctx.currentTime, 0.15);
  }
  setVolume(v) { if (this.master) this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.05); }
  setWarmth(v) { if (this.warm) this.warm.frequency.setTargetAtTime(900 + (1 - v) * 7000, this.ctx.currentTime, 0.1); }

  // Knistern: Puffer mit seltenen Klicks; Regen: gefiltertes Rauschen mit langsamer Bewegung
  startAmbience() {
    const c = this.ctx, sr = c.sampleRate;
    const buf = c.createBuffer(1, sr * 4, sr), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * 0.012;
    for (let k = 0; k < 90; k++) {
      const at = Math.floor(Math.random() * (d.length - 200)), amp = Math.random() * 0.5 + 0.1;
      for (let j = 0; j < 120; j++) d[at + j] += (Math.random() * 2 - 1) * amp * Math.exp(-j / 18);
    }
    const crackle = c.createBufferSource(); crackle.buffer = buf; crackle.loop = true;
    const cf = c.createBiquadFilter(); cf.type = 'bandpass'; cf.frequency.value = 2500; cf.Q.value = 0.4;
    const cg = c.createGain(); cg.gain.value = 0.5;
    crackle.connect(cf).connect(cg).connect(this.chan.crackle); crackle.start();

    const rain = c.createBufferSource(); rain.buffer = this.noise; rain.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 1400;
    const rh = c.createBiquadFilter(); rh.type = 'highpass'; rh.frequency.value = 300;
    const rg = c.createGain(); rg.gain.value = 0.22;
    const swell = c.createOscillator(), sg = c.createGain(); swell.frequency.value = 0.07; sg.gain.value = 0.07;
    swell.connect(sg).connect(rg.gain); swell.start();
    rain.connect(rh).connect(rf).connect(rg).connect(this.chan.rain); rain.start();
  }

  load(song) {
    this.song = song;
    this.step = 0;
    this.bar = 0;
    this.cycle = 0;
  }

  async play() {
    this.init();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (this.playing) return;
    this.playing = true;
    this.nextTime = this.ctx.currentTime + 0.08;
    this.loopStart = this.nextTime - stepTime(this.step, this.song.bpm, this.song.swing);
    this.timer = setInterval(() => this.schedule(), 25);
  }

  pause() {
    this.playing = false;
    clearInterval(this.timer);
  }

  // Wechsel auf ein neues Stück ohne Lücke: ab dem nächsten Taktanfang
  swap(song) {
    if (!this.playing) { this.load(song); return; }
    this.pending = song;
  }

  schedule() {
    const s = this.song, c = this.ctx;
    const barLen = 60 / s.bpm * 4;
    while (true) {
      const t = this.loopStart + Math.floor(this.step / 16) * barLen + stepTime(this.step % 16, s.bpm, s.swing);
      // Im Hintergrund-Tab laufen Timer gedrosselt (etwa 1×/s): dann weiter vorausplanen
      if (t > c.currentTime + (document.hidden ? 1.5 : 0.12)) break;
      // Nach einem Hänger verpasste Schritte überspringen statt alle auf einmal nachzuspielen
      if (t >= c.currentTime - 0.03) this.playStep(this.step, t);
      this.step++;
      if (this.step % 16 === 0) {
        this.bar++;
        if (this.step === 64) { this.step = 0; this.cycle++; this.loopStart += barLen * 4; }
        if (this.pending && this.step % 16 === 0) {
          const next = this.pending; this.pending = null;
          const nextStart = this.loopStart + Math.floor(this.step / 16) * barLen;
          this.load(next);
          this.loopStart = nextStart;
          return;
        }
      }
    }
  }

  playStep(step, t) {
    const s = this.song, bar = Math.floor(step / 16), i = step % 16, c = this.ctx;
    // Form: jeder dritte Durchlauf ohne Melodie, jeder vierte mit leiseren Drums im ersten Takt
    const melodyOn = this.cycle % 3 !== 2;
    const drumsSoft = this.cycle % 4 === 3 && bar === 0;
    const d = s.drums[bar];
    if (d.kick[i] && !drumsSoft) this.kick(t);
    if (d.snare[i]) this.snare(t, d.snare[i] * (drumsSoft ? 0.4 : 1));
    if (d.hat[i]) this.hat(t, d.hat[i]);
    const barDur = 60 / s.bpm * 4;
    if (i === 0) this.keys(s.chords[bar].notes, t, barDur * 0.98);
    if (i === 8 && this.cycle % 2 === 1) this.keys(s.chords[bar].notes.slice(1), t, barDur * 0.45, 0.6); // Nachschlag
    const b = s.bass[bar][i];
    if (b !== null) this.bassNote(b, t, i === 0 ? barDur * 0.45 : barDur * 0.18);
    const m = s.melody[bar][i];
    if (m !== null && melodyOn) this.lead(m, t, 60 / s.bpm * 0.9);
    this.onStep?.({ step, t, kick: !!d.kick[i] && !drumsSoft, bar, cycle: this.cycle });
  }

  env(g, t, a, peak, dur, rel = 0.2) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.setTargetAtTime(peak * 0.6, t + a, dur * 0.4);
    g.gain.setTargetAtTime(0.0001, t + dur, rel / 3);
  }

  osc(type, freq, t, end, dest, detune = 0) {
    const o = this.ctx.createOscillator();
    o.type = type; o.frequency.value = freq; o.detune.value = detune;
    this.wobble.connect(o.detune);
    o.connect(dest); o.start(t); o.stop(end);
    o.onended = () => { try { this.wobble.disconnect(o.detune); } catch { /* schon getrennt */ } };
    return o;
  }

  keys(notes, t, dur, vol = 1) {
    const c = this.ctx;
    const g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 1800;
    g.connect(f).connect(this.chan.keys);
    this.env(g, t, 0.03, 0.09 * vol, dur, 0.6);
    notes.forEach((n, k) => {
      const st = t + k * 0.012; // leicht gebrochen wie gespielt
      this.osc('sine', mtof(n), st, t + dur + 0.8, g, -4);
      this.osc('triangle', mtof(n), st, t + dur + 0.8, g, 5);
    });
  }

  bassNote(n, t, dur) {
    const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 420;
    g.connect(f).connect(this.chan.bass);
    this.env(g, t, 0.012, 0.32, dur, 0.15);
    this.osc('sine', mtof(n), t, t + dur + 0.3, g);
    this.osc('triangle', mtof(n), t, t + dur + 0.3, g);
  }

  lead(n, t, dur) {
    const c = this.ctx, g = c.createGain(), f = c.createBiquadFilter();
    f.type = 'lowpass'; f.frequency.value = 2200;
    g.connect(f).connect(this.chan.melody);
    this.env(g, t, 0.04, 0.06, dur, 0.4);
    const o = this.osc('triangle', mtof(n), t, t + dur + 0.5, g);
    const vib = c.createOscillator(), vg = c.createGain();
    vib.frequency.value = 5; vg.gain.value = 6; vib.connect(vg).connect(o.detune);
    vib.start(t); vib.stop(t + dur + 0.5);
  }

  kick(t) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
    o.connect(g).connect(this.chan.drums); o.start(t); o.stop(t + 0.4);
  }

  noiseHit(t, { type, freq, q = 1, vol, dur }) {
    const c = this.ctx, src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    src.buffer = this.noise; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.chan.drums);
    src.start(t, Math.random() * 1.5); src.stop(t + dur + 0.05);
  }

  snare(t, v) {
    this.noiseHit(t, { type: 'bandpass', freq: 1700, q: 0.7, vol: 0.38 * v, dur: 0.22 });
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(190, t); o.frequency.exponentialRampToValueAtTime(140, t + 0.08);
    g.gain.setValueAtTime(0.18 * v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(this.chan.drums); o.start(t); o.stop(t + 0.15);
  }

  hat(t, v) { this.noiseHit(t, { type: 'highpass', freq: 7000, vol: 0.09 * v, dur: 0.045 + v * 0.03 }); }

  // Ausblenden über `secs`, danach Pause
  fadeOut(secs) {
    const c = this.ctx, now = c.currentTime, v = this.master.gain.value;
    this.master.gain.cancelScheduledValues(now);
    this.master.gain.setValueAtTime(v, now);
    this.master.gain.linearRampToValueAtTime(0.0001, now + secs);
    return new Promise((res) => setTimeout(() => { this.pause(); this.master.gain.setValueAtTime(v, c.currentTime); res(); }, secs * 1000));
  }
}
