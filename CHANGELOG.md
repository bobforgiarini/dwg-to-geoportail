# Changelog

Alle relevanten Änderungen an DWG to Geoportail werden hier dokumentiert.

## [0.1.4] – 2026-08-24

### Hinzugefügt

- gemeinsamen animierten Bottom-Sheet-Baustein für Bedien- und Ebenen-Drawer eingeführt
- kompakten Objekt-Drawer ergänzt, der sich bei einer CAD-Auswahl automatisch öffnet
- CAD-Sichtbarkeitsmenü ergänzt, das sich nach links zu Text- und Wiederherstellungsaktionen öffnet

### Geändert

- exaktes bereitgestelltes BF.lu-Logo im `site-info-banner` verwendet und Geoportail-Information dorthin verschoben
- Wiederöffnungspfeil des unteren Drawers korrigiert und überflüssige Drawer-Icons entfernt
- Zähler und Wiederherstellung berücksichtigen nun einzeln, automatisch und über Ebenen ausgeblendete Objekte
- Geoportail-Attributionsschalter entfernt; Diensthinweis und Link bleiben im Banner sichtbar

## [0.1.3] – 2026-08-24

### Hinzugefügt

- unteren Bedienbereich als ein- und ausblendbaren mobilen Bottom-Drawer umgesetzt
- globalen Schalter zum Aus- und Einblenden aller CAD-Texte ergänzt
- `site-info-banner` 1.1.0 mit Copyright, Projektversion und Quellcode-Link integriert
- kompatiblen DWG-Zweitversuch ergänzt, wenn erweiterte HATCH-Rohdaten nicht aus dem Worker übertragen werden können

### Geändert

- Banner liegt im normalen Kartenmodus frei; geöffnete Bottom-Drawer dürfen ihn bewusst überlagern
- Geoportail-Attribution, Drawer-Schalter, Kartenaktionen und Nordpfeil überlappungsfrei angeordnet

## [0.1.2] – 2026-08-24

### Hinzugefügt

- CAD-Objektauswahl per Tipp mit Anzeige von Elementtyp und Layer
- Aktionen zum Ausblenden eines einzelnen Objekts oder seines gesamten Layers
- Wiederherstellung aller einzeln beziehungsweise automatisch ausgeblendeten Objekte
- Darstellung von Schraffuren aus normalisierten und LibreDWG-rohen Begrenzungspfaden
- automatische Erkennung und Ausblendung räumlicher Ausreißer außerhalb des Luxemburger LUREF-Bereichs

### Geändert

- Kartenausschnitt wird anhand der dichtesten plausiblen LUREF-Modellgruppe bestimmt
- Hinweise für Schraffuren ohne verwertbare Begrenzung präzisiert
- problematische reale DWG `181013-15-002021.dwg` erfolgreich mit 20.302 darstellbaren Objekten und 86 Layern geprüft

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
