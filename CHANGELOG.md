# Changelog

Alle relevanten Änderungen an DWG to Geoportail werden hier dokumentiert.

## [0.1.1] – 2026-08-24

### Behoben

- LibreDWG-WASM-Verzeichnis korrekt an den DWG-Worker übergeben; reale DWG-Dateien können dadurch verarbeitet werden

### Geändert

- vorherige Produktbezeichnungen durch den neutralen Titel „DWG → Geoportail“ ersetzt
- mobilen Nordpfeil ergänzt, der die aktuelle Kartendrehung zeigt und die Karte per Tipp nach Norden ausrichtet

## [0.1.0] – 2026-08-24

### Hinzugefügt

- mobile-first React/Vite-Oberfläche mit den vorhandenen Farb- und Formtokens
- Geoportail-Orthofoto per WMTS und automatischer WMS-Fallback
- LUREF-Transformation über `EPSG:2169`
- lokaler, abbrechbarer DWG-Import mit LibreDWG-WASM im Web Worker
- 2D-CAD-Konvertierung einschließlich rekursiver Blöcke, Layer und CAD-Farben
- Live-Standort, Genauigkeitskreis und pausierbare Kartenfolge
- deutsche, französische und englische Übersetzungen
- Netlify-Buildkonfiguration sowie automatische Worker-/WASM-Ausgabe
- automatisierte CRS-, Karten-, CAD- und i18n-Tests
