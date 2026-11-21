import { test } from 'node:test';
import assert from 'node:assert/strict';
import { compose, chordTones, voice, stepTime, encode, decode, MOODS } from './gen.mjs';

const MAJOR = [0, 2, 4, 5, 7, 9, 11];

test('Akkordtöne als Terzschichtung', () => {
  assert.deepEqual(chordTones(MAJOR, 0, 4), [0, 4, 7, 11]); // Cmaj7
  assert.deepEqual(chordTones(MAJOR, 1, 4), [2, 5, 9, 12]); // Dm7
  assert.deepEqual(chordTones(MAJOR, 4, 5), [7, 11, 14, 17, 21]); // G9
});

test('Enge Lage bleibt im Oktavfenster um die Mitte', () => {
  const v = voice([0, 4, 7, 11, 14], 60);
  for (const n of v) assert.ok(n >= 54 && n < 66);
  assert.deepEqual([...v].sort((a, b) => a - b), v);
});

test('Gleicher Seed, gleiches Stück; anderer Seed, anderes Stück', () => {
  assert.deepEqual(compose(42, 'regen'), compose(42, 'regen'));
  assert.notDeepEqual(compose(42, 'regen'), compose(43, 'regen'));
});

test('Alle Töne liegen in der Tonart und in sinnvollen Lagen', () => {
  for (const mood of Object.keys(MOODS)) for (let seed = 1; seed <= 200; seed++) {
    const s = compose(seed, mood);
    const scale = (s.mode === 'major' ? [0, 2, 4, 5, 7, 9, 11] : [0, 2, 3, 5, 7, 8, 10]).map((x) => (x + s.root) % 12);
    assert.ok(s.bpm >= MOODS[mood].bpm[0] && s.bpm <= MOODS[mood].bpm[1]);
    assert.equal(s.chords.length, 4);
    for (const c of s.chords) {
      for (const n of c.notes) { assert.ok(scale.includes(n % 12), `Akkordton in Tonart (${mood}/${seed})`); assert.ok(n >= 48 && n <= 72); }
      assert.ok(c.root >= 36 && c.root < 48);
    }
    for (const bar of s.melody) for (const n of bar) if (n !== null) {
      assert.ok(scale.includes(((n % 12) + 12) % 12), `Melodie in Tonart (${mood}/${seed}: ${n})`);
      assert.ok(n >= 55 && n <= 100, `Melodielage (${n})`);
    }
    for (const bar of s.bass) { assert.equal(bar.length, 16); assert.notEqual(bar[0], null); for (const n of bar) if (n !== null) assert.ok(n >= 30 && n <= 64); }
    for (const d of s.drums) { assert.equal(d.snare[4], 1); assert.equal(d.kick[0], 1); }
  }
});

test('Swing verschiebt nur die ungeraden 16tel', () => {
  assert.equal(stepTime(0, 60, 0.5), 0);
  assert.equal(stepTime(1, 60, 0.5), 0.25);
  assert.equal(stepTime(2, 60, 0.6), 0.5);
  assert.ok(Math.abs(stepTime(3, 60, 0.6) - 0.8) < 1e-9);
});

test('Link-Kodierung ist umkehrbar und weist Unsinn ab', () => {
  assert.deepEqual(decode('#' + encode(123456, 'kaffee')), { mood: 'kaffee', seed: 123456 });
  assert.equal(decode('#quatsch-12'), null);
  assert.equal(decode('#<script>'), null);
  assert.equal(decode(''), null);
});
