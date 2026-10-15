# Elterngeld-Rechner

Statischer Rechner, der Basiselterngeld, ElterngeldPlus und Partnerschaftsbonus für zwei Elternteile vergleicht – abhängig vom Netto-Einkommen und dem Arbeitsumfang in der Elternzeit. Die Berechnung läuft vollständig im Browser; es werden keine Daten gespeichert oder gesendet.

Live: https://kingjashugan.github.io/elterngeld-rechner/

## Annahmen (siehe `calc.js`)
- Bemessung: Netto vor Geburt, gedeckelt bei 2.770 €
- Ersatzrate 65 % (ab 1.240 €), bis 67 % (1.000–1.200 €), unter 1.000 € steigend bis 100 %
- Basis: 300–1.800 €, Plus: 150–900 € (max. ½ Basis ohne Einkommen), 1 Basismonat = 2 Plusmonate
- 12 Monate je Elternteil, 14 zusammen; Partnerschaftsbonus 4 Monate bei 24–32 Std./Woche beider
- Geschwisterbonus +10 % (mind. 75 €/37,50 €), Mehrlinge +300 €/150 € je weiteres Kind
- Teilzeit-Netto = bisheriges Netto × Arbeitsumfang (Näherung)

## Nicht berücksichtigt
Einkommensgrenze (175.000 € zvE), Begrenzung gleichzeitigen Bezugs, Steuern/Progressionsvorbehalt, Mutterschaftsgeld, zeitliche Lage der Monate.

**Unverbindliche Schätzung** – maßgeblich ist der Bescheid der Elterngeldstelle.

## Entwicklung
`node --test` führt die Tests für die Rechenlogik aus. `index.html` direkt im Browser öffnen.
