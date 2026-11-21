# Nachtradio

Endlose Lo-Fi-Beats, live im Browser komponiert und synthetisiert. Keine Samples, keine Audiodateien, keine Abhängigkeiten.

- **Komposition aus einem Seed:** Tonart, Tempo, Akkordfolge (Sept-/Nonenakkorde in enger Lage), Basslinie, Pentatonik-Melodie und Drum-Pattern mit Swing. Gleicher Seed, gleiches Stück, deshalb lässt sich jedes Stück per Link teilen (`#kaffee-kvdlui`).
- **4 Stimmungen:** Regen, Kaffee, Spät, Sonntag (Tempo, Dur/Moll, Swing, Melodiedichte)
- **Klang:** E-Piano-artige Akkorde, Bass, Lead mit Vibrato, Kick/Snare/Hats aus Oszillatoren und Rauschen, Bandleiern (LFO auf die Verstimmung), Sättigung, Tiefpass „Wärme“, Plattenknistern, Regen
- **Form:** Die Melodie pausiert jeden dritten Durchlauf, ab und zu werden die Drums kurz leiser; auf Wunsch alle 3 Minuten ein neues Stück mit nahtlosem Wechsel am Taktanfang
- Spuren einzeln schaltbar, Schlaftimer mit 30 Sekunden Ausblenden, animierte Stadt bei Nacht (ruht bei „Bewegung reduzieren“)
- Tasten: `Leertaste` Play/Pause, `N` neues Stück

## Starten

```bash
python3 -m http.server 8000
```

## Tests

```bash
node --test
```

Prüft Akkordbildung, enge Lage, Determinismus, dass alle Akkord- und Melodietöne in der Tonart liegen (800 Stücke), Tonlagen, Swing-Timing und die Link-Kodierung.
