# nachtradio – Projektsteckbrief

- **Zielgruppe:** Alle, die zum Arbeiten oder Einschlafen ruhige Musik wollen.
- **Kernaktion:** Play drücken und endlos ruhige Beats hören.
- **Nicht-Ziele:** Keine Samples, keine Download-/Export-Funktion, keine Konten.

## Architekturentscheidungen

Lookahead-Scheduler (25 ms Takt, 120 ms Vorlauf), Swing über verschobene ungerade 16tel, nahtloser Stückwechsel am Taktanfang, Seed im URL-Hash.

## Risiken

Verhalten im Hintergrund-Tab (Browser drosseln dort Timer) ist noch nicht systematisch geprüft.

## MVP / Erfolgstest

Erfolgstest: `node --test` grün und die Kernaktion im Browser ohne Konsolenfehler bedienbar.
