# Design QA – Version 0.5.1

## Vergleichsgrundlage

- Source visual truth: `C:\Users\bfo\AppData\Local\Temp\codex-clipboard-01f95fa9-3b59-413c-9399-093abe125e5f.png`
- Implementierung, Desktop-Drawer: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.1\drawer-desktop.png`
- Direkter Vergleich: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.1\comparison.png`
- Mobile MLightCAD-Karte: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.1\map-mobile.png`
- Mobiler Katasterzustand: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.1\cadastre-on-mobile.png`
- Mobile OpenLayers-Ansicht: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.1\openlayers-mobile.png`

## Normalisierung und Zustand

- Source: 1119 × 795 Pixel.
- Desktop-Implementierung: Browser-Viewport und Screenshot 1119 × 795 CSS-/Bildpixel, Device Scale Factor 1.
- Mobile Implementierung: Browser-Viewport und Screenshot 390 × 844 CSS-/Bildpixel, Device Scale Factor 1.
- Desktop-Zustand: MLightCAD unter `/`, lokale kleine DWG vollständig im Browser geladen, CAD-Drawer geöffnet, Kataster eingeschaltet.
- Mobile Zustände: MLightCAD beziehungsweise `/openlayers`, Drawer geöffnet oder geschlossen sowie Kataster ein beziehungsweise aus.
- Der Source- und Implementierungs-Drawer wurden im gemeinsamen Bild `comparison.png` nebeneinander beurteilt. Die mobile Karte wurde separat geprüft, weil der Source keinen mobilen Kartenleerzustand mit dem neuen Fadenkreuz oder Kataster vorgibt.

## Full-view comparison evidence

Der direkte Vergleich bestätigt die beabsichtigten Änderungen aus den roten Source-Anmerkungen: Die Vorbereitung ist nun über einen klaren Button erreichbar; „Display profile“, Profilwahl und Füllungsregler sind entfernt. Der Drawer bleibt zentriert, kompakt und vollständig oberhalb von Karte, CAD und Site-Banner. Seine vertikale Dichte ist gegenüber dem Source geringer, weil der ausdrücklich zu entfernende Abschnitt fehlt.

## Focused region comparison evidence

- `drawer-desktop.png`: Dateizeile, Vorbereitungsschaltfläche, CAD-Deckkraft, Luxemburg-Filter, Qualitätswahl und Text-/Objektaktionen sind lesbar, sauber gruppiert und ohne Überlauf sichtbar.
- `map-mobile.png`: Satellite-, Kataster- und LUREF-Kartenkarten bleiben kompakt; das 20 × 20 Pixel große Overlay enthält das 15-Pixel-Fadenkreuz exakt im 390 × 844 großen Bildschirmmittelpunkt bei x=195/y=422 und blockiert mit `pointer-events: none` keine Gesten.
- `cadastre-on-mobile.png`: Der Katasterzustand ist als eigener Schalter sichtbar und der offizielle PCN-Karteninhalt wird geladen.
- `openlayers-mobile.png`: Header, Kartenkarten, Fadenkreuz und gemeinsamer Drawer bleiben auch im Legacy-Viewer gleich aufgebaut.

## Required fidelity surfaces

- Fonts and typography: bestehende Systemschrift, Gewichte, kleine Statusschrift und Drawer-Hierarchie bleiben konsistent; keine neue Schrift oder optisch abweichende Ersatztypografie eingeführt.
- Spacing and layout rhythm: bestehende 520-Pixel-Desktopbreite und mobile Vollbreite des gemeinsamen Bottom-Sheets bleiben erhalten; neuer Button verwendet die vorhandenen Abstände, Radien und Touchziele.
- Colors and visual tokens: Navy, Weiß, Gold und neutrale Flächen bleiben unverändert; nur das fachlich verlangte kleine rote Kartenmittelpunkt-Symbol kommt hinzu.
- Image quality and asset fidelity: bestehendes bf.lu-Logo und Geoportail-Bildkacheln bleiben echte Assets/Dienstdaten; Icons stammen aus `lucide-react`. Keine sichtbaren Platzhalter oder nachgebauten Bildassets.
- Copy and content: Kataster, Vorbereitung und Fadenkreuz benötigen keine erklärende Dauerbeschriftung außerhalb der vorhandenen lokalisierten Bedienoberfläche; DE, FR und EN sind umgesetzt. Kopf zeigt `v0.5.1`.
- Responsiveness and accessibility: Kartenbuttons sind semantische Toggle-Buttons mit `aria-pressed`; der Mittelpunkt ist dekorativ `aria-hidden`; Drawer-Griff, Außenklick, Escape und mindestens 44-Pixel-Touchziele bleiben erhalten.

## Primary interactions tested

- Satellitenkarte aus/ein: `aria-pressed` wechselte `true → false → true`.
- Kataster aus/ein: `aria-pressed` wechselte `false → true → false`.
- „DWG vorbereiten“ öffnete den vollständigen Vorbereitungssheet auch nach einem automatischen einfachen Import.
- Route `/` zu `/openlayers` gewechselt; Version, Katastersteuerung und Mittelpunkt sind in beiden Ansichten vorhanden.
- Frische Browserläufe für `/` und `/openlayers` auf Konsolenfehler geprüft: keine Fehler.
- 240 synchrone Kameraereignisse bleiben durch den automatisierten Regressionstest weiterhin 240 unmittelbare `renderSync()`-Aufrufe mit nur einer nachlaufenden Koordinatenaktualisierung.

## Findings and comparison history

### Iteration 1

- [P2] Der erste Katasterversuch verwendete den vollständigen WMTS-Layer `cadastre`. Im mobilen Vergleich überdeckte dessen komplette Kartengestaltung das Orthofoto stärker als für einen gezielten Parzellen-/Nummernzustand nötig.
- Fix: auf die offiziellen PCN-Layer `parcels` und `parcels_labels` getrennt umgestellt, gemeinsam unter CAD/GPS geschichtet und mit demselben kompakten Toggle verbunden.
- Post-fix evidence: `cadastre-on-mobile.png`; die Schaltlogik und der offizielle PCN-Inhalt funktionieren, während Satellite und Kataster unabhängig bleiben.

### Final pass

Keine verbleibenden P0-, P1- oder P2-Befunde. Der Unterschied in der Drawerhöhe ist beabsichtigt, weil der Nutzer den Profil-/Füllungsabschnitt ausdrücklich entfernt haben wollte. Keine zusätzliche sichtbare Funktion wurde ergänzt.

## Residual test gaps

- Die echte Darstellung maßstabsabhängiger Texte muss weiterhin mit der problematischen privaten Junglinster-DWG und den zugehörigen CAD-Referenzmaßstäben auf Nutzerhardware visuell abgenommen werden.
- Standortfreigabe und echtes GPS wurden nicht im Browser erteilt; das Fadenkreuz selbst hängt ausschließlich am Kartenmittelpunkt und nicht an der Berechtigungslogik.

final result: passed
