# Nachtradio

**Endless lo-fi beats, composed and synthesized live in your browser.**
No samples, no audio files, no dependencies, no build step.

<!-- TODO before going public: add docs/screenshot.png and a live demo link (e.g. GitHub Pages). -->

> [!NOTE]
> The user interface is in German for now. Contributions for an English UI are welcome.

## Features

- **Composed from a seed:** key, tempo, chord progression (7th/9th chords in close voicing), bass line,
  pentatonic melody and a swung drum pattern. Same seed, same track, so every track can be shared
  as a link (`#kaffee-kvdlui`).
- **4 moods:** Rain, Coffee, Late, Sunday (tempo, major/minor, swing, melody density).
- **Sound:** e-piano-style chords, bass, lead with vibrato, kick/snare/hats from oscillators and
  noise, tape wobble, saturation, a "warmth" low-pass, vinyl crackle and rain.
- **Form:** the melody rests every third pass and the drums dip now and then. Optionally a new
  track every 3 minutes, switched seamlessly on the downbeat.
- Every track can be muted on its own, sleep timer with a 30-second fade-out, an animated city at
  night (it stops when the system asks for reduced motion).
- Keys: `Space` play/pause, `N` new track.

## Quick start

The app uses ES modules, so it has to be served over HTTP (opening `index.html` via `file://`
does not work):

```bash
git clone https://github.com/Dark-Player-jake/nachtradio.git
cd nachtradio
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Privacy

Everything runs locally in your browser. Nachtradio loads no external scripts, fonts or trackers
and sends no data anywhere.

## Development

```bash
node --test
```

The tests check chord building, close voicing, determinism, that all chord and melody notes stay in
key (800 generated tracks), registers, swing timing and the link encoding.

| File | Purpose |
|---|---|
| `gen.mjs` | Composition, no DOM and no audio, so it runs under `node:test` |
| `audio.mjs` | Synthesis and scheduler (Web Audio API) |
| `main.mjs` | UI and the night scene |

## Contributing

Issues and pull requests are welcome. Please run `node --test` before you open a pull request and
keep the project free of dependencies and external resources.

## License

<!-- TODO: license not chosen yet (MIT proposed). Add a LICENSE file before making the repo public. -->
Not decided yet.
