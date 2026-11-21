# nachtradio – Projektsteckbrief

- **Zielgruppe:** Alle, die zum Arbeiten oder Einschlafen ruhige Musik wollen.
- **Kernaktion:** Play drücken und endlos ruhige Beats hören.
- **Nicht-Ziele:** Keine Samples, keine Download-/Export-Funktion, keine Konten.

## Architekturentscheidungen

Lookahead-Scheduler (25 ms Takt, 120 ms Vorlauf), Swing über verschobene ungerade 16tel, nahtloser Stückwechsel am Taktanfang, Seed im URL-Hash.

## Risiken

Klang nicht angehört; Verhalten im Hintergrund-Tab (gedrosselte Timer) zu prüfen.

## MVP / Erfolgstest

Entstanden in der Nachtschicht 21./22.11.2026. Erfolgstest: `node --test` grün und die Kernaktion im Browser ohne Konsolenfehler bedienbar (per Playwright geprüft). Was Menschen noch prüfen müssen, steht in der Projekt-Memory `nachtschicht-2026-11-21`.
