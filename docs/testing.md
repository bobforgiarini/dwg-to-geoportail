# Test- und Abnahmeplan

## Automatisiert

`npm test` prüft:

- LUREF-Roundtrip und Lage eines bekannten LUREF-Referenzpunkts
- WMTS-Layer, Matrix-Set, Dienst-URL und WMS-Fallback
- absolute LUREF-Ausdehnungen und Layer-Metadaten
- Blocktranslation, Layervererbung und Zyklenerkennung
- Kurvenapproximation sowie Warnungen für 3D und Papierbereich
- Schraffuren aus normalisierten und LibreDWG-rohen Begrenzungspfaden
- stabile CAD-Objekt-IDs und automatische LUREF-Ausreißerfilterung
- Kennzeichnung von CAD-Texten für den globalen Sichtbarkeitsschalter
- Zählung der Vereinigungsmenge aus einzeln und über Ebenen ausgeblendeten CAD-Objekten
- zentrale UI-Texte in Deutsch, Französisch und Englisch

`npm run build` führt zuerst TypeScript aus, erzeugt den Produktionsbuild und kopiert Worker/WASM nach `dist/wasm`.

## Manuell vor einem Produktiveinsatz

- gültige, ungültige und über 10 MB große DWG testen
- Ersetzen, Entfernen und Abbrechen während der Verarbeitung prüfen
- reale DWG mit bekannten LUREF-Kontrollpunkten und Layernamen abgleichen
- 2D-Elemente, Textpositionen, verschachtelte Blöcke und Farben kontrollieren
- verweigerte und erlaubte Standortberechtigung testen
- Folgen durch Kartenbewegung pausieren und anschließend fortsetzen
- WMTS absichtlich blockieren und sichtbaren WMS-Fallback verifizieren
- DE/FR/EN und Umlaute auf schmalem iPhone- und Android-Viewport kontrollieren
- Netlify-Produktionsbuild über HTTPS in mobilem Safari und Chrome abnehmen

Eine reale DWG-Fixture ist bewusst nicht im Repository enthalten und wird nach Bereitstellung separat abgenommen.

## Reale DWG-Abnahme 0.1.1

Die folgenden lokal bereitgestellten Dateien wurden browserlokal mit dem Produktionsbuild erfolgreich verarbeitet:

- `büro.dwg`: 179 Objekte, 13 Layer
- `doheem.dwg`: 181 Objekte, 13 Layer
- `251068-11-002021a.dwg`: 1.016 Objekte, 39 Layer

Keine der DWG-Dateien wurde an einen externen Dienst übertragen oder in das Repository aufgenommen. Nicht unterstützte Inhalte wie Viewports, Multileader, externe Bilder und einzelne 3D-Z-Werte werden weiterhin als Hinweise gemeldet.

## Reale DWG-Abnahme 0.1.2

- `181013-15-002021.dwg`: 20.302 darstellbare Objekte, 86 Layer und 742 automatisch ausgeblendete räumliche Ausreißer
- gegenüber dem Import ohne LibreDWG-HATCH-Rohpfade werden 1.186 zusätzliche Schraffurobjekte dargestellt
- Startausschnitt liegt beim LUREF-Modell; Auswahl und Ausblenden eines Objekts beziehungsweise Layers wurden browserlokal geprüft

Die Datei blieb ausschließlich im lokalen Browser-Arbeitsspeicher und wurde weder veröffentlicht noch in Git aufgenommen.

## Mobile UI-Abnahme 0.1.3

- Bottom-Drawer bei 390 × 844 Pixel geöffnet, geschlossen und wieder geöffnet
- geschlossener Zustand ohne Seitenüberlauf; `site-info-banner`, Attribution und Wiederöffnungstaste überdecken sich nicht
- geöffneter Drawer liegt wie vorgesehen über dem Banner
- CAD-Textschalter mit `181013-15-002021.dwg` in beiden Zuständen geprüft
- DWG-Import mit und ohne erweiterte HATCH-Rohdaten geprüft; inkompatible Rohdaten lösen automatisch den kompatiblen Zweitversuch aus

## Mobile UI-Abnahme 0.1.4

- `doheem.dwg` mit 237 Objekten und 13 Ebenen im Produktionsbuild verarbeitet
- BF.lu-Logo, Geoportail-Link und fehlenden OpenLayers-Attributionsschalter geprüft
- gemeinsamen animierten Bedien- und Ebenen-Drawer bei 390 × 844 Pixel geprüft
- links ausklappendes CAD-Menü mit Text- und Wiederherstellungsaktion geprüft
- Wiederherstellung von 230 automatisch ausgeblendeten Objekten und anschließende Zählung von 17 über eine Ebene ausgeblendeten Objekten geprüft
