# Changelog

Alle relevanten Änderungen an DWG to Geoportail werden hier dokumentiert.

## [0.2.0] – 2026-08-25

### Hinzugefügt

- parallelen MLightCAD-/Three.js-Viewer unter `/mlightcad` ergänzt; der bestehende OpenLayers-Viewer bleibt unter `/`
- gemeinsamen, ausschließlich im React-Arbeitsspeicher gehaltenen `File`-Sitzungszustand für den Wechsel zwischen beiden Viewern eingeführt
- MLightCAD-Abhängigkeiten über eine lazy geladene Routenseite vom initialen OpenLayers-Bundle getrennt
- transparente MLightCAD-Darstellung mit `EPSG:2169`-Kamerabrücke zur passiven Geoportail-Karte umgesetzt
- Deckkraftregler mit Karte-, Mix- und CAD-Vorgabe sowie Layer-, Auswahl-, Ausblend- und Wiederherstellungsaktionen ergänzt
- mobile Objektauswahl mit 12-Pixel-Trefferradius und verzögertem Pointer-Tap-Fallback ergänzt; Ziehen, Mehrfingerbedienung sowie Shift-, Ctrl- oder Meta-Taste lösen keine Fallback-Auswahl aus
- MLightCAD für Touchbewegung ausdrücklich auf `AcEdViewMode.PAN` gesetzt; kurze Taps bleiben über den Auswahl-Fallback möglich
- getrennte modale Layer- und „DWG & Darstellung“-Drawer sowie einen kompakten Objekt-Drawer auf Basis des gemeinsamen `BottomSheet` für beide Viewer ergänzt
- nordfixierte `N`-Kartenkontrolle für die MLightCAD-Überlagerung ergänzt
- getrennte Worker-/WASM-Ausgabe unter `/mlightcad-workers/` und passende Netlify-Header ergänzt
- Tests für Routing, gemeinsame Dateisitzung, Kamerabrücke, Deckkraft, Adapteraktionen, mobile Navigation, gemeinsame Legacy-/MLight-Bedienung, Drawer-Backdrop und Renderer-Entsorgung ergänzt

### Geändert

- Viewerwechsel als kompakte `ML`-/`OL`-Taste neben die Sprachauswahl gesetzt und die Version in den Kopfbereich verschoben
- OpenLayers- und MLightCAD-Viewer auf dieselben `CadControlSheet`-, Objekt- und Layer-Drawer mit identischem Outside-Close abgeglichen
- die vier schwebenden Aktionen beider Viewer einheitlich als Standort, Zeichnung einpassen, Layer und CAD-Drawer angeordnet
- OpenLayers ebenfalls um „Zeichnung einpassen“ und CAD-Deckkraft mit Karte-/Mix-/CAD-Vorgaben ergänzt
- Deckkraft, Textsichtbarkeit, Verborgen-Zähler und Wiederherstellung in beiden Viewern im CAD-Drawer zusammengeführt
- gemeinsamen DWG-Ladespinner auf kompakte 20 × 20 Pixel mit 2-Pixel-Rand vereinheitlicht
- eingebettete MLightCAD-Kommandozeile ausgeblendet, damit sie keine Touchgesten abfängt
- modale Drawer schließen auch beim Tipp auf ihren gemeinsamen Hintergrund
- Site-Banner nach rechts verschoben und auf „Powered by bf.lu“ sowie „© Map: geoportail.lu“ festgelegt
- MLightCAD-Hinweise speichern Übersetzungsschlüssel, sodass offene Meldungen beim Wechsel zwischen DE, FR und EN sofort aktualisiert werden
- nicht lesbare lokale beziehungsweise nur online verfügbare Dateien erhalten einen eigenen lokalisierten Hinweis
- `/mlightcad-workers/*` wird mit `max-age=0, must-revalidate` ausgeliefert; die bestehende `/wasm/*`-Pipeline bleibt langfristig immutable gecacht
- MLightCAD-Import kann seinen Worker unmittelbar abbrechen und gibt beim Viewer- oder Dateiwechsel Listener, Animation, Renderer, WebGL-Kontext und Singleton-Ressourcen frei

### Bekannte Grenzen

- die MLightCAD-Route ist auf 2D-Modellbereichsdaten mit absoluten LUREF-Koordinaten ausgelegt; XRefs, proprietäre benutzerdefinierte Objekte und 3D-Darstellung sind nicht abgenommen
- abweichende HATCH-Füllungen entsprechen dem offenen Upstream-Thema [mlightcad/cad-viewer #230](https://github.com/mlightcad/cad-viewer/issues/230)
- der MLightCAD-Textschalter erfasst derzeit nur Textobjekte auf oberster Modellbereichsebene

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
