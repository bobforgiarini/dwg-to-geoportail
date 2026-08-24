# Test- und Abnahmeplan

## Automatisiert

`npm test` prüft:

- LUREF-Roundtrip und Lage eines bekannten LUREF-Referenzpunkts
- WMTS-Layer, Matrix-Set, Dienst-URL und WMS-Fallback
- absolute LUREF-Ausdehnungen und Layer-Metadaten
- Blocktranslation, Layervererbung und Zyklenerkennung
- Kurvenapproximation sowie Warnungen für 3D und Papierbereich
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
