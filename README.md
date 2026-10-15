# Elterngeld-Rechner

Statischer Rechner, der Basiselterngeld, ElterngeldPlus und Partnerschaftsbonus für zwei Elternteile vergleicht – abhängig vom Netto-Einkommen und dem Arbeitsumfang in der Elternzeit. Die Berechnung läuft vollständig im Browser; es werden keine Daten gespeichert oder gesendet.

Live: https://kingjashugan.github.io/elterngeld-rechner/

## Annahmen (siehe `calc.js`)
- Bemessung: Netto vor Geburt, gedeckelt bei 2.770 €
- Ersatzrate 65 % (ab 1.240 €), bis 67 % (1.000–1.200 €), unter 1.000 € steigend bis 100 %
- Basis: 300–1.800 €, Plus: 150–900 € (max. ½ Basis ohne Einkommen), 1 Basismonat = 2 Plusmonate
- 12 Monate je Elternteil, 14 zusammen; Partnerschaftsbonus 4 Monate bei 24–32 Std./Woche beider
- Geschwisterbonus +10 % (mind. 75 €/37,50 €), Mehrlinge +300 €/150 € je weiteres Kind
- Eingabe in Wochenstunden: Teilzeit-Netto = bisheriges Netto × (neue Std. / bisherige Std.) – eine Näherung, die bei Teilzeit etwas zu hohes Elterngeld ergibt, weil das Netto real weniger stark sinkt (Steuerprogression). Optional kann das Teilzeit-Netto direkt eingetragen werden.
- Eigene Szenarien: beliebig viele anlegen, kopieren und löschen (Monate Basis/Plus/Bonus je Elternteil, Wochenstunden je Szenario). Die Gegenüberstellung zeigt Verlust beim Elterngeld (gegenüber dem Elterngeld ohne Arbeit) und Verlust gegenüber dem Vollverdienst. Eingaben werden nur lokal im Browser (localStorage) gespeichert.
- Elternteil 1 = Vater, Elternteil 2 = Mutter. Die 2 Monate Mutterschutz der Mutter zählen immer als Basis-Monate (in ihren Basis-Monaten enthalten, auch ohne eigene Eingabe) und verbrauchen Kontingent. Das Mutterschaftsgeld wird voll auf das Elterngeld angerechnet, daher gibt es für diese Monate kein zusätzliches Elterngeld, und sie werden nicht als Einkommensverlust gerechnet (abschaltbar).
- Zeitplan: Jedes Szenario zeigt die Blöcke (Mutterschutz, Basis, Plus, Bonus) je Elternteil in Lebensmonaten. Standardmäßig werden sie nacheinander angeordnet (Mutter zuerst, Vater-Basis danach, Vater-Plus parallel zur Mutter, Bonus am Ende). Mit Reglern lassen sich Monate und Startmonate anpassen („auto“ setzt zurück). Geprüft werden: Basis nur bis zum 14. Lebensmonat, Plus/Bonus bis zum 32., keine Überschneidungen eigener Blöcke; gleichzeitiges Basis bei beiden in mehr als 1 Monat (1.–12. Lebensmonat) erscheint als Hinweis. Die Gegenüberstellung zeigt die Zeitpläne nebeneinander.
- In Basis-Monaten wird nicht gearbeitet; Plus- und Bonus-Monate haben getrennte Wochenstunden
- Elterngeld nur bis 32 Std./Woche; Partnerschaftsbonus nur bei 24–32 Std./Woche in den Bonus-Monaten

## Regeln, die gegen den offiziellen Planer geprüft wurden (Stand Oktober 2026, Geburten bis Oktober 2027)
- Monatsbeträge werden auf volle Euro aufgerundet (1279,10 € → 1.280 €).
- Jeder Elternteil, der Elterngeld nimmt, braucht mindestens 2 Monate (Basis oder Plus); 2 Plus-Monate genügen auch neben 12 Basis-Monaten des anderen.
- Mutterschutz-Monate der Mutter zählen als Basis ohne Betrag (Mutterschaftsgeld wird angerechnet).
- Gleichzeitiges Basis bei beiden: im 1.–12. Lebensmonat nur 1 Monat (der Mutterschutz-Monat zählt mit), Plus parallel ist erlaubt. Bei Mehrlingen wird nur ein Hinweis gezeigt.
- Nicht berücksichtigt: Referentenentwurf vom Juli 2026 (12 statt 14 Monate, 330–1.900 €), frühestens für Geburten ab November 2027.

## Abgleich mit dem offiziellen Rechner
Formel (Ersatzrate, Mindest-/Höchstbeträge, Plus = min(½ Basis, Basis mit Einkommen)) gegen den [Elterngeldrechner des Familienportals](https://familienportal.de/familienportal/meta/egr) geprüft, siehe `calc.test.js`. Der offizielle Rechner nimmt Brutto-Eingaben und schätzt das Netto selbst (Brutto − 102,50 € Werbungskostenpauschale − pauschale Abgaben); dieser Rechner nimmt das Netto direkt.

## Nicht berücksichtigt
Einkommensgrenze (175.000 € zvE), Begrenzung gleichzeitigen Bezugs, Steuern/Progressionsvorbehalt, Mutterschaftsgeld, zeitliche Lage der Monate.

**Unverbindliche Schätzung** – maßgeblich ist der Bescheid der Elterngeldstelle.

## Entwicklung
`node --test` führt die Tests für die Rechenlogik aus. `index.html` direkt im Browser öffnen.
