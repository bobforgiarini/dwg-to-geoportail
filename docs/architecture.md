# Architektur 0.2.4

## Überblick

Die Anwendung ist eine statisch auslieferbare React-Single-Page-App ohne Backend, Upload-Endpunkt oder Anwendungsdatenbank. Version 0.2.4 bindet zwei CAD-Pipelines unter einer gemeinsamen Oberfläche ein, korrigiert einen eng begrenzten alten `MULTILEADER`-Kodierungsfall im MLightCAD-Pfad und vereinheitlicht Kartensteuerung, Statusanzeigen und Drawer:

| Route | CAD-Pipeline | Ausgabe |
| --- | --- | --- |
| `/` | `@flyfish-dev/cad-viewer` und die anwendungseigene Normalisierung | OpenLayers-Vektorfeatures |
| `/mlightcad` | MLightCAD, LibreDWG-Konverter und Three.js | transparenter WebGL-Canvas |

`RootApp` hält beide Viewer im `CadSessionProvider`. Die MLightCAD-Seite wird mit `React.lazy` erst bei Bedarf importiert; damit gehören ihre großen Laufzeitabhängigkeiten nicht zum initialen OpenLayers-Einstieg.

## Routing und gemeinsame Dateisitzung

`viewerRouting` ordnet `/` dem bestehenden Viewer und `/mlightcad` dem MLightCAD-Viewer zu. Der Kopfbereich wechselt mit der History API; `popstate` unterstützt Vor- und Zurücknavigation. Ein unbekannter Pfad zeigt bewusst den bestehenden Viewer.

Der Provider hält nur die originale lokale `File`-Referenz, eine Revisionsnummer und den aktiven Viewer im React-Arbeitsspeicher. Beim Viewerwechsel bleibt die `File` erhalten, der neu aktive Viewer verarbeitet sie jedoch mit seiner eigenen Pipeline. Ein Neuladen, Schließen der Seite oder explizites Entfernen verwirft die Sitzung. Es gibt keine Speicherung der DWG in `localStorage`, IndexedDB, einer Datenbank oder auf einem Server.

## Bestehende OpenLayers-Pipeline (`/`)

1. `importDwg` startet einen `DwgWorkerClient`; ein vorheriger Import wird beendet.
2. Der Worker lädt die Dateien unter `/wasm/` und normalisiert die DWG. Parser-Rohdaten bleiben nur im Arbeitsspeicher verfügbar, damit HATCH-Begrenzungspfade ausgewertet werden können.
3. `convertCadDocument` löst INSERT-/Block-Verweise rekursiv bis maximal 32 Ebenen auf.
4. Das WCS der DWG wird als `EPSG:2169` behandelt. Die dichteste plausible LUREF-Modellgruppe bestimmt den Startausschnitt.
5. OpenLayers transformiert die Geometrien nach `EPSG:3857` und rendert sie mit Layer-, Text-, Auswahl- und Sichtbarkeitszuständen.

Diese Pipeline bleibt für Vergleich und Rückfall unverändert verfügbar.

Direkt normalisiert werden Linien, Polylinien einschließlich Bulge-Bögen, Kreise, Bögen, Ellipsen, Splines als Stützpunktapproximation, Punkte, Texte, Solid-/Hatch-Umrisse und rekursive Blöcke. Nicht rekonstruierbare Schraffuren, Papierbereich, 3D-/Z-Werte, fehlende oder zyklische Blöcke und unbekannte Elementtypen erzeugen Hinweise. Jedes OpenLayers-Feature besitzt eine stabile Objekt-ID, einen CAD-Typ und eine `layerId`. Der Viewer unterstützt Auswahl, Objekt-/Layer-Ausblendung, globale Textsichtbarkeit und die Wiederherstellung automatisch erkannter LUREF-Ausreißer.

## MLightCAD-Pipeline (`/mlightcad`)

1. `MlightCadCanvas` erzeugt für die aktuelle Dateirevision einen `MlightCadViewerAdapter`.
2. Der Adapter prüft den LibreDWG- und MTEXT-Worker unter `/mlightcad-workers/`.
3. `CancellableLibreDwgConverter` liest die lokale Datei als `ArrayBuffer` und analysiert sie in genau einem Worker. Fortschritt wird für Workerprüfung, Lesen, Analysieren, Rendern, abschließende Geometriefinalisierung und Bereitschaft gemeldet.
4. MLightCAD öffnet das Dokument lesend, aktiviert ausdrücklich den Modellbereich und rendert progressiv in einen transparenten Three.js-/WebGL-Canvas. Der Adapter setzt den Clear-Alpha-Wert auch nach dem Layoutwechsel wieder auf `0`, weil MLightCAD dabei Renderzustand neu initialisieren kann.
5. Nach dem Aktivieren des Layouts setzt der Adapter die Ansicht ausdrücklich auf `AcEdViewMode.PAN`. Pan und Pinch besitzen damit die Bewegung; ein kurzer Tap bleibt dem Auswahl-Fallback vorbehalten.
6. Die eingebettete Desktop-Kommandozeile wird verborgen und für Pointer-Ereignisse deaktiviert, damit sie die mobile Kartenbedienung nicht überlagert.
7. Der Adapter leitet Layer mit Sichtbarkeit und Objektzahl, Auswahlinformationen und den Fertigzustand an die gemeinsame React-Oberfläche weiter. Erst dieser `ready`-Zustand übergibt die Gestensteuerung von OpenLayers an MLightCAD.

Der Konverter kann den Parser-Worker bei Abbruch sofort zerstören. Bei großen Zeichnungen werden Objekt- und Layerinformationen iterativ ausgewertet, ohne eine zusätzliche vollständige Kopie der Entitätenliste aufzubauen. Temporäre Datei- und Dokumentreferenzen werden nach Erfolg, Fehler oder Abbruch gelöst. Die MLightCAD-Bibliothek verwendet einen globalen Dokumentmanager und eine globale DWG-Konverterregistrierung; deshalb verhindert eine Entsorgungsbarriere, dass eine neue Instanz startet, bevor die vorherige vollständig freigegeben wurde.

Vor der Übergabe des lokalen Parserergebnisses an MLightCAD prüft eine Kompatibilitätsschicht ausschließlich `MULTILEADER`-/`MLEADER`-MText aus DWG-Versionen vor `AC1021`; der Referenzfall ist `AC1015` mit `ANSI_1252`. Die Version wird vorrangig aus der sechs Byte langen Originalsignatur und ersatzweise aus `header.ACADVER` gelesen. Ist `DWGCODEPAGE` vorhanden, muss sie eine ANSI-/CP-/Windows-1252-Form bezeichnen. Lässt LibreDWG die Header-Codepage leer, ist der Fallback nur erlaubt, wenn die Originalsignatur unabhängig eine alte DWG belegt und der einzelne Text das starke Packungsmuster erfüllt; eine ausdrücklich andere Codepage sperrt die Korrektur. Manche betroffenen Werte enthalten je JavaScript-Zeichen zwei ursprünglich aufeinanderfolgende Bytes. Modellbereich und Blockdatensätze werden ohne Doppelverarbeitung gleicher Entitäten untersucht. Low- und High-Byte werden in ihre ursprüngliche Reihenfolge gebracht und als Windows-1252 dekodiert. Ein rekonstruiertes NUL beendet den Text und trennt einen von LibreDWG angehängten Binärfooter ab. Moderne DWGs, andere Codepages, normale Unicode-Texte und nicht passende Inhalte bleiben unverändert; MText-Steuerfolgen wie `\P` bleiben erhalten.

Eine Worker-Ablehnung nach einem ausdrücklich ausgelösten Abbruch gehört zum erwarteten Entsorgungspfad und wird nicht als neuer Importfehler an die Oberfläche gemeldet. Echte Parser-, Renderer- oder Workerfehler bleiben davon getrennt und werden weiterhin lokalisiert angezeigt.

## `EPSG:2169`-Overlay und Kamerabrücke

Die MLightCAD-Zeichnungskoordinaten werden ohne affine Verschiebung oder automatische Georeferenzierung als LUREF-Meter (`EPSG:2169`) interpretiert. Die darunterliegende OpenLayers-Ansicht läuft ebenfalls in `EPSG:2169`; die Geoportail-Quellen bleiben in `EPSG:3857` und werden durch OpenLayers reprojiziert.

Die Zuständigkeit für Pointer- und Touchgesten ist zustandsabhängig. Solange keine DWG ausgewählt ist oder MLightCAD noch lädt, bleibt OpenLayers interaktiv; die Satellitenkarte lässt sich daher auch ohne Zeichnung verschieben und zoomen. Ab `ready` ist OpenLayers passiv und MLightCAD übernimmt Pan und Zoom. Die Desktopsteuerung des CAD-Viewers bleibt unverändert, während der mobile Pinch-Zoom einen reduzierten Empfindlichkeitswert verwendet.

Bei einer CAD-Kameraänderung liest `cameraBridge` den WCS-Mittelpunkt und berechnet aus zwei benachbarten Bildschirmpunkten die Zeichnungsmeter pro CSS-Pixel. Diese Werte setzen Mittelpunkt und Auflösung der Geoportail-Karte; deren Drehung bleibt bei 0. Auch programmatische CAD-Bewegungen durch GPS-Zentrierung und „Zeichnung einpassen“ veröffentlichen anschließend ausdrücklich einen Kamerastand. Dadurch werden CAD und Orthofoto nicht nur bei direkten Gesten, sondern auch bei diesen Aktionen gemeinsam geführt.

Die frühere Begrenzung auf einen festen LUREF-Ausschnitt, den daraus abgeleiteten Reprojektions-Kachelbereich und eine minimale OpenLayers-Auflösung entfällt in der MLightCAD-Route. Damit sind reale LUREF-Zeichnungen außerhalb dieses Ausschnitts und ein tiefer CAD-Zoom möglich, ohne dass die Basiskarte vorzeitig stehen bleibt. Die MLightCAD-Ansicht ist konstruktiv nordfixiert und zeigt deshalb keine zusätzliche `N`-Taste; der bestehende drehbare OpenLayers-Viewer behält seine Nordausrichtung. Standortkoordinaten werden von `EPSG:4326` nach `EPSG:2169` transformiert und können die CAD-Kamera zentrieren. Ein bereits vor dem Import vorhandener GPS-Fix wird erst nach `ready` auf den CAD-Viewer angewendet, damit dessen initiales Einpassen die Standortzentrierung nicht wieder überschreibt.

Damit die Überlagerung fachlich belastbar ist, muss eine reale DWG mit bekannten LUREF-Kontrollpunkten in mehreren Zoomstufen abgenommen werden. Die automatisierten Tests prüfen die mathematische Übergabe, ersetzen aber keine visuelle Georeferenzierungsprüfung.

## MLightCAD-Bedienzustände

- Der Deckkraftregler setzt ausschließlich die CSS-Opazität des CAD-Canvas von 0 bis 100 Prozent; Vorgaben sind Karte `0`, Mix `60` und CAD `100`, Standard ist `70`. Der WebGL-Clear-Alpha bleibt unabhängig davon `0`, sodass unbelegte Pixel die Basiskarte weder einfärben noch abdunkeln.
- Layer werden in den MLightCAD-Szenen einzeln oder gemeinsam sichtbar beziehungsweise unsichtbar gesetzt.
- Eine Auswahl liefert Objekt-ID, CAD-Typ und Layer. Einzelne Objekte werden über die Wiederherstellung im CAD-Drawer erneut sichtbar; Layer lassen sich im Layer-Drawer einzeln oder vollständig einblenden. Wird die Objekt-Wiederherstellung ausgeführt, schaltet sie zusätzlich alle Layer ein.
- Für mobile Pointer-Taps ergänzt der Adapter die eingebaute Mausauswahl um einen verzögerten Fallback mit 12-Pixel-Trefferradius. Bewegung, Mehrfingerbedienung sowie Shift-, Ctrl- oder Meta-Taste unterdrücken ihn; eine bereits erfolgte eingebaute Auswahl wird nicht doppelt ausgelöst.
- Der Textschalter berücksichtigt `TEXT`, `MTEXT`, `ATTRIB` und `ATTDEF` sowohl über Dokumententitäten als auch über gerenderte Textmerkmale in der gesamten Szene. `LEADER`, `MLEADER` und `MULTILEADER` folgen dem Textzustand als vollständige CAD-Entität, sodass Text, Führungslinien und Pfeile gemeinsam verschwinden. Dadurch werden auch Texte in verschachtelten Blöcken geschaltet; bereits einzeln verborgene Objekte bleiben beim erneuten Einblenden der Texte verborgen.
- MLightCAD speichert Hinweise als i18n-Schlüssel und übersetzt sie erst beim Rendern. Eine bereits offene Meldung aktualisiert sich deshalb beim Sprachwechsel zwischen DE, FR und EN.

## Gemeinsame Drawer- und Kartenbedienung

- Beide Viewer verwenden dieselben Komponenten `CadControlSheet`, `SelectionPanel`, `LayerSheet` und `BottomSheet`.
- „DWG & Darstellung“, Objekt und Layer sind viewportfeste modale Drawer mit derselben Backdrop-Logik. Beim Öffnen über die Kartenaktionen wird der jeweils andere Steuer-Drawer geschlossen; ein vollständiger Klick beziehungsweise Tipp außerhalb des Inhalts schließt den offenen Drawer, ohne auf darunterliegende Kartenaktionen durchzufallen. Escape schließt ebenfalls; der Tastaturfokus bleibt im offenen Drawer und kehrt mit `preventScroll` anschließend zum vorherigen Element zurück. Der Dialog selbst erhält den Anfangsfokus, damit die Einfahranimation den App-Container nicht programmgesteuert scrollt. Eine Auswahl öffnet den kompakten Objekt-Drawer.
- Der CAD-Drawer bündelt lokale Datei, Importstatus, Deckkraft, Textsichtbarkeit, Verborgen-Zähler und Wiederherstellung. Sein Aktionsknopf zeigt die Zahl verborgener Objekte zusätzlich als Badge.
- Die schwebenden Kartenaktionen verwenden in beiden Viewern dieselben wiederverwendbaren Komponenten. Layer und CAD-Drawer bilden die obere Gruppe; Standort und Zeichnung einpassen bilden eine getrennte untere Gruppe direkt über dem Site-Banner. Ein geöffneter Drawer darf diese Kartenaktionen und den Banner überdecken.
- Der bestehende OpenLayers-Viewer stellt `fitDrawing()` über seinen `MapCanvas`-Handle bereit und setzt die 0–100%-Deckkraft direkt auf seiner CAD-Vektorebene. MLightCAD setzt denselben UI-Wert ausschließlich auf den transparenten WebGL-Canvas.
- Während beide Pipelines eine DWG lesen, zeigt das gemeinsame `CadControlSheet` denselben kompakten Spinner mit 18 Pixel Durchmesser.
- Beide Karten verwenden dieselben Statuskarten. Die Satellitenkarte ist als kompakter 26-Pixel-Schalter mit erweiterter unsichtbarer Tippfläche ausgeführt und blendet WMTS/WMS sitzungsweit ein oder aus; dadurch ist auch eine CAD-Ansicht ohne Hintergrundkarte möglich. Eine eigene GPS-Karte zeigt die aktuelle Genauigkeit. Die LUREF-Koordinate bleibt separat sichtbar. Der neutrale Kartenuntergrund ist schwarz.
- Standortlogik, Basiskartensichtbarkeit, Dateireferenz, App-Kopf und Site-Banner sind ebenfalls gemeinsam; parserspezifischer Fortschritt, Warnungen und Rendererzustand bleiben in der jeweiligen Route.

Der `AppHeader` zeigt die Version `v0.2.4` und direkt neben der Sprache genau eine kompakte `ML`-/`OL`-Taste für den Ziel-Viewer. Das `site-info-banner` 1.1.0 steht unten rechts, zeigt „Powered by bf.lu“ und „© Map: geoportail.lu“ und verlinkt Geoportail. Ein Betreiber muss den für eine öffentliche AGPL-Bereitstellung erforderlichen Zugang zum passenden Quellcode zusätzlich sicherstellen.

## Lebenszyklus und Entsorgung

Beim Ersetzen oder Entfernen einer Datei, bei einem Parser- oder Renderfehler, beim Routenwechsel und beim Unmount werden laufende Parserarbeiten abgebrochen und alle Adapter-Listener entfernt. Der Adapter leert Auswahl, Textindizes und Szene, beendet die Animationsschleife, gibt Renderlisten und Renderer frei, verliert den WebGL-Kontext, zerstört den MLightCAD-Dokumentmanager, entfernt den global registrierten DWG-Konverter und leert den Container. Der identische Dispose-Pfad gilt damit auch für fehlgeschlagene große Imports. Abgeleitete CAD-Daten werden nicht zwischen den Viewern geteilt.

## Statische und externe Laufzeitressourcen

- `/wasm/`: Worker-/WASM-Dateien des bestehenden Viewers
- `/mlightcad-workers/`: `libredwg-parser-worker.js`, `libredwg-web.wasm` und `mtext-renderer-worker.js`
- `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/`: von MLightCAD konfigurierte unterstützende CAD-/Schriftressourcen
- Geoportail: normale WMTS-/WMS-Kachelabrufe

Nur die statischen Viewerdateien werden mit der App gebaut. Die ausgewählte DWG wird weder an Geoportail, jsDelivr noch Netlify gesendet. Die App besitzt keine Function, API, Dokumentdatenbank oder persistente Zeichnungsablage.

## Bekannte Grenzen

- Beide Routen setzen absolute LUREF-Koordinaten voraus; lokale Zeichnungskoordinaten werden nicht automatisch eingepasst.
- Die MLightCAD-Integration verwendet nur den 2D-Modellbereich. Papierlayouts und 3D-Darstellung sind nicht Teil der Abnahme.
- XRefs werden nicht dargestellt. Proprietäre benutzerdefinierte Objekte können vom LibreDWG-basierten Parser nicht ausgewertet und deshalb ausgelassen werden.
- HATCH-Füllungen können gegenüber CAD-Referenzsoftware abweichen; siehe das offene Upstream-Thema [mlightcad/cad-viewer #230](https://github.com/mlightcad/cad-viewer/issues/230).
- Vom Parser unbekannte oder proprietäre Textobjekte können trotz der erweiterten Szenensuche ausgelassen werden.
- Objekt- und Layerzahlen beider Viewer sind nicht zwingend identisch, weil ihre Parser und Renderobjektmodelle unterschiedlich zählen.
