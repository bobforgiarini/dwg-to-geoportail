# Test- und Abnahmeplan 0.7.1

## Grundsatz

Automatisierte Tests prüfen Datenstrukturen, Filterung, Zustandsautomaten und Lebenszyklus. Sie ersetzen weder den visuellen Vergleich mit einer bekannten LUREF-DWG noch einen echten Speichertest in iOS Safari. Private DWG-Dateien bleiben außerhalb des Repositorys und werden nicht an einen externen Dienst übertragen.

Die unten aufgeführten automatisierten und manuellen Prüfungen sind die Abnahmebasis für Version 0.7.1. Die private Junglinster-DWG bleibt außerhalb des Repositorys. Prüfungen mit privaten XRef-DWGs und auf echter iPhone-Hardware bleiben lokale Abnahmen.

## Automatisierte Prüfung

```sh
npm test
npm run build
```

Abschlusslauf vom 31. August 2026:

- Vitest: 51 Dateien, 276 Tests, alle bestanden
- TypeScript und Vite-Produktionsbuild: erfolgreich, 2.956 Module transformiert
- lokale Browserprüfung: Desktop 1.200 × 800 und Mobil 390 × 844; korrigierte Buttonpositionen, Desktop-Zielwahl, Zurücknavigation sowie ausschließlich rotes Mittelpunktkreuz auf Mobil bestätigt
- Browserkonsole: keine Fehler oder Warnungen

### Preflight und Risikobewertung

- kleine beziehungsweise wenig komplexe Dateien laufen ohne Vorbereitungssheet automatisch vollständig weiter
- die Dateigröße allein setzt `shouldPrepare` niemals und entfernt die Aktion „Vollständig laden“ nicht
- erhöhte Renderkosten, Entitätszahl, Blockexpansion, Text-/Hatch-/Polyline-Dichte und begrenztes Gerätebudget liefern nachvollziehbare Risikogründe
- fehlendes `navigator.deviceMemory` auf einem erkannten Mobilgerät verwendet das konservative Safari-Budget, blockiert aber nicht
- DWG-Version, Dateimetadaten, Layer, direkte und rekursive Instanzen, Objektarten, Blocktiefe und Warnungen werden stabil in `DwgPreflightReport` abgebildet
- das empfohlene Profil entfernt zunächst nur ausgeschaltete, eingefrorene und No-Plot-Layer sowie Papierbereich, nicht aufgelöste XRefs, Bilder, OLE-/Proxy- und 3D-Inhalte
- benannte fachliche Blöcke, Texte und Hatches bleiben im automatisch empfohlenen Profil erhalten
- Schema-2-Berichte führen konkrete `DwgProfileEffect`-Einträge für feste, empfohlene und manuelle Ausschlüsse sowie `DwgProfileImpact` für vorher/empfohlen
- echte Objektzahlen und gewichtete Performancekosten werden getrennt berechnet und beschriftet; Kosten erscheinen niemals als „Renderobjekte“
- Schema-1-Fixtures bleiben während der Migration ohne die neuen optionalen Abschnitte lesbar

### Annotationsmaßstäbe und lokale XRefs

- valide `SCALE`-, `CONTEXTDATAMANAGER`- und `*OBJECTCONTEXTDATA`-Strukturen liefern gespeicherten und verfügbare Annotationsmaßstäbe
- der gespeicherte Maßstab wird standardmäßig gewählt; eine manuelle Auswahl bleibt bei Pan, Zoom und kontrolliertem CAD-Neuaufbau unverändert
- beschädigte, fehlende und mehrdeutige Kontextdaten arbeiten fail-open, entfernen keine Darstellung und erzeugen eine Warnung
- Text, Linie und Pfeil von Leader/MLeader teilen denselben Textsichtbarkeitszustand
- XRef-Basisnamen werden unabhängig von Pfadtrennzeichen, Erweiterung und Groß-/Kleinschreibung normalisiert
- eindeutige, fehlende, mehrdeutige, zyklische und ungültige lokale Referenzen liefern jeweils den erwarteten Status
- Attachments dürfen weitere lokale Referenzen laden; Overlays werden nicht rekursiv verfolgt
- zusammengeführte Tabellen und Blöcke erhalten getrennte `XRefName|…`-Namensräume; INSERT-Position, Rotation und Skalierung bleiben erhalten
- XRef-Dateien werden sequenziell im selben Worker verarbeitet und verlassen den Browser-Arbeitsspeicher nicht

### Luxemburg-Filter

- die generierte Grenze besitzt `EPSG:2169`, fünf Meter Vereinfachungstoleranz, exakt 1.000 Meter Außenpuffer und die dokumentierte ACT-Quellprüfsumme
- Objekte innerhalb Luxemburgs sowie 999,99 Meter und genau 1.000 Meter außerhalb der Landesgrenze bleiben vollständig erhalten
- ein sicher vollständig 1.000,01 Meter außerhalb liegendes Objekt wird entfernt
- Objekte auf der Puffergrenze und mit schneidender Ausdehnung bleiben vollständig erhalten
- ausschließlich sicher vollständig außerhalb liegende Objekte werden entfernt
- unbekannte, ungültige, zyklische und nicht berechenbare Ausdehnungen bleiben fail-open mit Warnung erhalten
- rekursive INSERT-Transformationen werden vor der räumlichen Entscheidung angewendet; danach nicht mehr erreichbare Blockdefinitionen werden verworfen
- der Filter ist für eine neue Haupt-DWG aktiv, kann separat ausgeschaltet werden und wird von „Vollständig laden“ nicht überschrieben

### Blockgraph und Filter

Synthetische Fixtures müssen folgende Fälle abdecken:

- direkter Modellbereichs-INSERT
- benannter und anonymer Block
- mehrfach verschachtelte Blöcke
- Zeilen-/Spalten-INSERTs mit Multiplizität
- zyklische Referenz und maximale Suchtiefe
- fehlende Blockdefinition
- XRef-Kennzeichnung
- nicht mehr erreichbare Blockdefinition nach Filterung

Zusätzlich wird geprüft:

- Layer `0` erbt den wirksamen Elternlayer eines INSERTs
- ByLayer-/ByBlock-Eigenschaften und ursprüngliche Layernamen bleiben an den verbleibenden Entitäten erhalten
- ausgeblendete Layer greifen innerhalb verschachtelter Blockdefinitionen
- ein abgewählter innerer Block entfernt nur die zugehörigen verschachtelten INSERTs
- weiterhin erreichbare Definitionen, Position, Rotation, Skalierung und Attribute verbleibender INSERTs bleiben erhalten
- der Filter verändert das ursprüngliche Parserdokument nicht
- geschätzte und tatsächlich verbleibende Entitäts-/Blockzahlen liegen im dokumentierten Näherungsrahmen

### Sitzung, Routen und Bedienung

- `CadLoadProfile` und Preflight-Bericht bleiben bei einem kontrollierten CAD-Neuaufbau erhalten; eine neue DWG setzt beide zurück
- `/` löst den einzigen MLightCAD-CAD-Viewer auf; `/openlayers` wird permanent auf `/` umgeleitet
- es existieren weder Viewerart noch Viewerwechsel im Sitzungskontext; der App-Kopf besitzt keinen OL-/MLightCAD-Umschalter
- ein goldener DWG-/Upload-Button im App-Kopf öffnet ausschließlich den DWG-Drawer; der goldene Settings-Button rechts in der Kartensteuerung öffnet ausschließlich den Settings-Drawer
- die Version im App-Kopf entspricht `package.json` und zeigt für diesen Release `0.7.1`

### Gemeinsame Drawer und getrennte Wiederherstellung

- Layer- und Block-Drawer verwenden denselben `BottomSheet` sowie dasselbe kompakte Layout, besitzen keinen Kreuz-Button und schließen über Außentipp beziehungsweise Escape
- Settings- und DWG-Drawer verwenden dieselbe `BottomSheet`-Basis mit Griff, Animation, Safe Area, Backdrop, Escape und ohne Kreuz-Button
- der Settings-Drawer enthält ausschließlich CAD-Deckkraft samt Presets, CAD-Qualität, CAD-Textschalter sowie getrennte Aktionen für verborgene Objekte, Layer und Blöcke
- jede Wiederherstellungsaktion zeigt einen eigenen Zähler, ist bei null deaktiviert und bewahrt die beiden übrigen Filterzustände
- eine Wiederherstellung workerseitig entfernter Layer oder Blöcke löst genau einen kontrollierten CAD-Neuaufbau aus; Kamera, Karte und übrige Filter bleiben erhalten
- der DWG-Drawer enthält ausschließlich Datei auswählen/entfernen/ersetzen, Importstatus, Abbruch, Fehler, „DWG vorbereiten“ und „Luxemburg + 1 km Außenpuffer“
- ohne ausgewählte Datei öffnet initial der DWG-Drawer; Vorbereitung, Abbruch und Importfehler kehren in ihn zurück
- die Layersuche filtert ohne Beachtung der Groß-/Kleinschreibung nach Name und Kennung; ein leerer Trefferzustand wird verständlich angezeigt
- sichtbare und ausgeblendete Layerzähler beziehen sich auf die vollständige Layerliste und bleiben beim Suchen korrekt
- „Alle anzeigen“ und „Alle ausblenden“ schalten die gesamte Layerliste und sind bei wirkungslosen Aktionen deaktiviert
- jede Layerzeile zeigt ihre Objektzahl und eine aus Objektzahl sowie Gerätebudget abgeleitete Belastung `niedrig`, `mittel` oder `hoch`
- im Ladeprofil gefilterte Layer erhalten einen Neuladehinweis; „Änderungen anwenden“ ist nur bei ausstehenden strukturellen Änderungen aktiv und löst genau einen kontrollierten CAD-Neuaufbau aus
- Suche, sichtbare/ausgeblendete Zähler, „Alle anzeigen“ und „Alle ausblenden“ im Block-Drawer funktionieren
- benannte Blöcke, Systemblöcke und XRefs erscheinen in der korrekten Gruppe; Systemblöcke sind einklappbar
- direkt erreichbare Modellbereichsblöcke schalten ohne vollständigen Neuimport
- verschachtelte oder vorher weggefilterte Blöcke verlangen „Änderungen anwenden“ und lösen genau einen kontrollierten CAD-Neuaufbau aus
- Kartenmittelpunkt, Zoom, GPS-Zustand, Deckkraft und Drawerzustand bleiben bei diesem Neuaufbau erhalten
- der Objekt-Drawer zeigt den rekursiven Blockpfad und bietet Objekt-, Layer- und Block-Ausblendung
- ein bereits geschlossener Layer- oder Block-Drawer rendert keine Inhaltsliste; beim Schließen bleiben die Inhalte genau für die 300-ms-Exit-Animation erhalten und werden danach entfernt
- Preflight- und Renderer-Layer werden trotz unterschiedlicher ID-/Namensschreibweise korrekt verbunden; Sichtbarkeit und jeweils höhere Objektzahl bleiben erhalten
- beim Umschalten eines einzelnen Layers wird von den memoisierten Layerzeilen nur der geänderte Eintrag erneut gerendert

### DWG-Drag-and-drop und Positionsaktionen

- auf Desktop akzeptiert ausschließlich die Kartenfläche genau eine `.dwg`; Touchgeräte und Drops außerhalb der Karte werden ignoriert
- während eines gültigen Drags erscheint „DWG hier ablegen“ und verschwindet nach Drop, Leave oder Abbruch
- ohne vorhandene Hauptdatei verwendet der Drop denselben lokalen Importpfad wie die Dateiauswahl
- mit vorhandener Datei öffnet ein Bestätigungs-Sheet; Abbrechen bewahrt Datei, Kamera und Sitzung, Bestätigen ersetzt die Haupt-DWG genau einmal
- mehrere Dateien sowie Nicht-DWG-Dateien werden abgewiesen und im DWG-Drawer erklärt
- ein Desktop-Rechtsklick öffnet zuerst die schnelle Wahl „Position von hier“ beziehungsweise „Position von der Mitte“; die erste Option verwendet die tatsächliche Pointerposition, die zweite exakt den roten Kartenmittelpunkt
- nur „Position von hier“ erzeugt eine kleine goldfarbene Zweilinienmarkierung; die Mittelpunktoption verwendet ausschließlich das bestehende rote Kreuz
- das Desktop-Detailmenü zeigt links neben der kopierbaren Koordinate einen kleinen quadratischen Zurück-Button und kehrt damit ohne Schließen zur Zielwahl zurück
- ein Einfinger-Langdruck öffnet nach ungefähr 550 ms das Positions-Bottom-Sheet ausschließlich für den roten Kartenmittelpunkt; Mobil zeigt weder eine Zielauswahl noch eine goldene oder sonstige zusätzliche Markierung
- mehr als zehn CSS-Pixel Bewegung, Pinch, zweiter Finger oder Pointer-Abbruch verhindern das Öffnen des mobilen Sheets
- die kopierte Koordinate entspricht exakt `X.XX, Y.XX`; erfolgreicher Clipboard-Zugriff und Fallback zeigen eine kurze Bestätigung
- Geoportail verwendet die erwartete LUREF-Achsenreihenfolge; Google Maps, Apple Maps und Google Street View erhalten korrekt transformierte WGS84-Koordinaten
- externe Ziele öffnen mit `noopener`/`noreferrer`; Apple Look Around wird nicht angeboten
- Rechtsklick und Langdruck dürfen Pan, Pinch, CAD-Auswahl, Messmodus und den synchronen Kamera-Hotpath nicht verändern

### Recovery und Lebenszyklus

- der Recovery-Marker enthält nur Dateiname, Dateigröße und Startzeit, niemals Dateibytes oder Geometrien
- Erfolg und geordneter Abbruch löschen den Marker
- ein zurückgebliebener Marker wird einmalig konsumiert und löst die vorbereitete Empfehlung aus
- deaktiviertes beziehungsweise fehlschlagendes Browser-Storage verhindert einen Import nicht
- Abbruch während der Workerphase beendet den Vorgang innerhalb von 500 ms und erzeugt kein verspätetes `ready`
- fünf aufeinanderfolgende Importe beziehungsweise CAD-Neuaufbauten hinterlassen keinen zusätzlichen Worker, Canvas oder WebGL-Kontext
- ein CAD-Neuaufbau beginnt erst nach dem vollständigen Dispose des vorherigen CAD-Dokuments
- der Worker sendet den kompakten Bericht vor dem großen Modell, wartet auf die Entscheidung und überträgt erst anschließend die gefilterte Datenbank
- der versionierte LibreDWG-API-Bundle verweist auf die tatsächlich mit ausgelieferte Emscripten-Laufzeit; ein fehlendes Nebenasset wird im Test erkannt
- der Parser-Timeout läuft nur während aktiver Workerarbeit, pausiert während der Nutzerentscheidung, wird danach neu gestartet und ignoriert verspätete Workerantworten

### LibreDWG-WASM

- `patchLibreDwgInitialMemory` akzeptiert ausschließlich ein gültiges wasm32-Modul mit Memory-Section
- der gepatchte Minimalwert beträgt 2.048 WASM-Seiten beziehungsweise 128 MiB
- ein vorhandener Maximalwert und die Growth-Flags bleiben unverändert
- `WebAssembly.validate` akzeptiert das erzeugte Modul
- der Produktionsbuild enthält genau die gepatchte Datei unter `dist/mlightcad-workers/0.3.0/libredwg-web.wasm`

### Geoportail-Zustandsautomat

- ein einzelner WMTS-Kachelfehler wechselt die Quelle nicht
- drei aufeinanderfolgende WMTS-Fehler lösen genau einen Retry aus
- acht Sekunden WMTS-Stillstand wechseln zu WMS `ortho_latest`
- zehn Sekunden erfolgloses WMS setzen `unavailable`
- Online-/Offline-Wechsel ergeben `offline` und einen sauberen WMTS-Neustart
- Ereignisse einer alten Quellgeneration werden ignoriert
- zwei erfolgreiche WMTS-Proben während funktionierendem WMS wechseln zurück; ein Fehlschlag setzt die Erfolgsserie zurück
- OpenLayers-Karte und MLightCAD-CAD-Layer lesen denselben Basemap-Zustand und bleiben bei Totalausfall auf schwarzem Hintergrund bedienbar
- URL, Matrix-Set, Layernamen, WMS-Parameter und Attribution entsprechen dem offiziellen Open-Data-Dienst

### Projektion und Kamerabrücke

- bekannte LUREF-Punkte werden korrekt zwischen `EPSG:2169` und `EPSG:3857` transformiert
- die MLightCAD-OpenLayers-View unter `/` arbeitet wie in 0.2.4 direkt in `EPSG:2169`
- die Kamerabrücke übernimmt LUREF-Mittelpunkt und Meter-pro-Pixel-Auflösung unverändert
- mehrere MLightCAD-Kamerameldungen werden jeweils unmittelbar und synchron auf OpenLayers übertragen; kein CAD-Frame darf einer älteren Kartenkamera vorauslaufen
- die 0.2.4-Kamerabrücke bleibt auch unter Last unverändert: jede CAD-Meldung setzt Mittelpunkt und Auflösung und ruft `renderSync()` im selben Zyklus auf
- ausschließlich die Koordinatenanzeige arbeitet 100 ms nachlaufend; während einer Ereignisfolge wird kein Zwischenstand an React veröffentlicht und nach Ablauf erhält sie genau den letzten Mittelpunkt
- ein durch `renderSync()` programmgesteuert ausgelöstes OpenLayers-`moveend` ruft bei aktiver MLightCAD-Steuerung keinen Seiten-Callback auf; eine manuelle OpenLayers-Bewegung ohne aktive CAD-Steuerung bleibt meldewirksam
- wiederholte erfolgreiche Kachelabschlüsse im bereits erreichten Zustand `ready` benachrichtigen React nicht erneut
- GPS zentriert zuerst die CAD-Kamera, anschließend folgt OpenLayers ohne Animation
- beim Pan, Pinch, Mausrad, Einpassen und tiefen Zoom bleibt die Abweichung zwischen CAD und Orthofoto bei einer bekannten Referenz unter zwei CSS-Pixeln

### 2D-Distanzmessung und CAD-Snap

- die Phasen inaktiv, ersten Punkt setzen, zweiten Punkt setzen und abgeschlossen besitzen eindeutige Zustandsübergänge; „Neue Messung“ verwirft beide Punkte, „Beenden“ beendet den Modus
- die euklidische Distanz wird aus zwei LUREF-Koordinaten direkt in Metern berechnet; Ausgabe und Rundungsgrenzen verwenden mindestens drei und höchstens vier Nachkommastellen
- Messphase, beide Punkte und Snap-Schalter bleiben beim Schließen des Mess-Sheets erhalten; eine neue Haupt-DWG setzt sie zurück
- das rote Aim liegt auf Desktop und Mobilgerät im Zentrum des echten Karten-/Canvasbereichs und stimmt mit der aktuellen LUREF-Mittelpunktkoordinate überein
- auf Mobilgeräten setzen kurzer Kartentipp, Pan, Pinch und CAD-Auswahl keinen Messpunkt; nur die mindestens 44 CSS-Pixel große Aktion bestätigt den aktuellen Aim-Punkt
- auf Desktop zeigt Mouse-Hover die sichtbare CAD-Fangposition und ein kurzer Mausklick setzt den nächsten Punkt; eine Dragbewegung darf nicht als Klick übernommen werden
- das gemeinsame Bottom-Sheet enthält ohne sichtbaren Titel, Anleitung oder Koordinaten ausschließlich CAD-Snap, Punktaktion und nach Abschluss das Ergebnis; der aktive `Ruler`-Schalter und der zugängliche Griff beenden den Messmodus
- MLightCAD verwendet den nativen OSNAP mit 18 CSS-Pixeln Fangradius; Ergebnisse aus ausgeblendeten Layern, Blöcken, Texten oder Objekten werden verworfen
- Messlinie, Punkte und Fangvorschau verwenden leichte Three.js-Geometrie und werden beim Beenden und Dispose vollständig freigegeben
- während des Messmodus ist die normale CAD-Objektauswahl deaktiviert
- 240 MLightCAD-Kameraereignisse erzeugen weiterhin 240 synchrone `setCenter`-/`setResolution`-/`renderSync()`-Folgen; dazwischen darf keine Snap-, React-, Worker- oder zusätzliche CRS-Arbeit auftreten

### Adaptive MLightCAD-Canvas-Qualität

- `Auto` übernimmt die native Gerätedichte höchstens bis 2×; ein simuliertes iPhone mit DPR 3 darf daher keinen WebGL-Pixelratio 3 erhalten
- `Scharf` übernimmt die native Gerätedichte höchstens bis 2,5× und skaliert Geräte mit kleinerem nativen DPR nicht künstlich hoch
- `Speichersparend` liefert unabhängig von Gerät, Datei und Preflight immer 1×
- `Auto` liefert bei höchstens 2 GiB gemeldetem Gerätespeicher oder hoher Preflight-Risikostufe 1×
- `Auto` begrenzt eine erhöhte Preflight-Risikostufe auf höchstens 1,5× und eine unauffällige Zeichnung auf höchstens 2×
- solange der Preflight noch aussteht, erhält eine mobile Datei höchstens 1,5× und eine Datei über 10 MiB 1×; nach dem Bericht wird die Stufe erneut aus der gemessenen Risikoklasse bestimmt
- ein Qualitätswechsel setzt den Pixelratio des bestehenden MLightCAD-/Three.js-Renderers und markiert die Ansicht als darstellungsbedürftig, ohne CAD-Geometrie oder OpenLayers-Kamera neu aufzubauen
- der Schalter erscheint im Settings-Drawer, kennzeichnet den aktiven Modus mit `aria-pressed` und ist in DE, FR und EN vollständig beschriftet
- die OpenLayers-Basiskarte verwendet auf mobilen beziehungsweise grob bedienten Geräten weiterhin DPR 1; keine MLightCAD-Qualitätsstufe darf ihren Pixelratio verändern
- `Auto`, `Scharf` und `Speichersparend` ändern weder CAD-Weltkoordinaten noch Meter-pro-CSS-Pixel der Kamerabrücke

### Darstellungsprofile, Füllungen und Zeichenreihenfolge

- `Original` ist die Vorgabe und zeigt Füllungen mit 100 Prozent; `Karte` startet bei 35 Prozent Füllungsdeckkraft
- der Füllungsregler verändert HATCH-, SOLID- und echte Füllmaterialien, aber keine leeren Canvaspixel, Kartenkacheln, Linien oder Texte
- vom MLightCAD-Renderer gemeldete `missedFonts` werden nach Renderstart je Schrift zusammengefasst und in DE/FR/EN mit Schriftname und Vorkommenszahl angezeigt
- ein Profil- oder Deckkraftwechsel erstellt weder OpenLayers-`Map`/`View` noch CAD-Dokument oder WebGL-Kontext neu
- `Ganz nach vorne` und `Ganz nach hinten` aktualisieren dieselbe logische Objektgruppe; die zuletzt verschobene Gruppe liegt am jeweiligen Extrem
- Leader plus Text/Pfeil und Hatch plus Kontur teilen ihren `drawOrderGroupKey`
- Unterobjekte einer wiederverwendeten Blockdefinition ändern bewusst alle Instanzen; ein eigenständiges Modellbereichs-INSERT behält seine Identität
- die Reihenfolge bleibt bei Sichtbarkeitswechsel und kontrolliertem CAD-Neuladen erhalten; eine neue Haupt-DWG setzt sie zurück
- MLightCAD ersetzt bestehende Previews, erhält die Auswahlzuordnung und gibt Materialien sowie geklonte Geometrien bei Wechsel, Neuladen und Dispose frei
- Preview-Budgets 128/384 auf Mobilgeräten und 256/512 auf Desktop lassen die Szene bei Überschreitung unverändert und melden die Grenze lokalisiert
- während Pan und Zoom findet keine Zeichenreihenfolgearbeit statt

### i18n und Regression

- alle neuen Settings-, DWG-, Drag-and-drop-, Bestätigungs-, Positions- und Luxemburg-Texte sind in Deutsch, Französisch und Englisch vorhanden
- Umlaute, französische Apostrophe und englische Platzhalter werden korrekt gerendert
- bestehende CRS-, HATCH-, Kurven-, Auswahl-, Layer-, Text-/Leader- und MLeader-Encoding-Tests bleiben grün
- TypeScript-Build und Vite-Produktionsbuild laufen ohne Fehler

## Produktionsbuild prüfen

Nach `npm run build` müssen mindestens vorhanden sein:

- `dist/mlightcad-workers/0.3.0/libredwg-parser-worker.js`
- `dist/mlightcad-workers/0.3.0/libredwg-web-api.js`
- `dist/mlightcad-workers/0.3.0/libredwg-web.js`
- `dist/mlightcad-workers/0.3.0/libredwg-web.wasm`
- `dist/mlightcad-workers/0.3.0/mtext-renderer-worker.js`

Das LibreDWG-WASM muss valide sein und 128 MiB Anfangsspeicher deklarieren. Browseranfragen müssen den versionierten Releasepfad verwenden und dürfen nicht auf unversionierte oder alte 0.2.x-URLs zurückfallen. `/` lädt ausschließlich den MLightCAD-/Three.js-CAD-Viewer; `/openlayers` muss vor dem SPA-Fallback permanent auf `/` umleiten. Es darf keine Flyfish- oder Legacy-CAD-Pipeline im Produktionsgraph verbleiben.

## Manuelle mobile Abnahme

### Adaptive Vorbereitung

1. Eine kleine DWG laden: Sie soll ohne unnötigen Dialog vollständig öffnen.
2. Eine große, aber strukturell einfache DWG laden: Sie darf nicht allein wegen ihrer Dateigröße blockiert werden.
3. Eine tatsächlich komplexe DWG laden: Vor Feature-/Szenenaufbau muss „DWG vorbereiten“ erscheinen.
4. „Vollständig laden“ wählen: Die Aktion bleibt auf Desktop und Mobilgerät vorhanden und startet den ungefilterten Versuch.
5. „Empfohlen laden“ wählen: Die Wirkungsschätzung muss sich plausibel verringern, fachliche benannte Blöcke, Texte und Hatches bleiben erhalten.
6. „Auswahl anpassen“ öffnen: Layer- und Blockauswahl ändern, anwenden und das Ergebnis gegen eine CAD-Referenz vergleichen.
7. Während des Imports abbrechen: Oberfläche und Karte müssen unmittelbar wieder bedienbar sein.
8. Im Schema-2-Bericht Haupt-DWG/XRefs, Maßstab, Luxemburg-Filter, feste Ausschlüsse, Empfehlungen und manuelle Auswahl getrennt kontrollieren.
9. Für jeden Ausschluss Name, Typ, Grund, echte Objektzahl und ausdrücklich als Schätzung bezeichnete Performancekosten prüfen.

### Lokale XRefs und Annotationen

1. Eine Haupt-DWG mit beiden privaten XRef-Dateien zunächst ohne Ergänzungen öffnen und die fehlenden Referenzen prüfen.
2. „XRefs hinzufügen“ verwenden und beide Dateien gemeinsam auswählen; im Netzwerkprotokoll darf kein DWG-Upload erscheinen.
3. Eine zweite lokale Datei mit identischem normalisiertem Basisnamen anbieten und den mehrdeutigen Treffer anhand Dateiname, Größe und Änderungsdatum auflösen.
4. Attachment-Kette, Overlay, fehlende Referenz und Zyklus jeweils kontrollieren; nur Attachments dürfen rekursiv weiterladen.
5. Zeichnung im MLightCAD-Viewer gegen die CAD-Referenz vergleichen und INSERT-Position, Rotation, Skalierung und Layer-/Blocknamen prüfen.
6. Jeden erkannten Annotationsmaßstab fest auswählen. Annotative Texte, Bemaßungen, Attribute, Leader, MLeader und INSERTs dürfen bei Pan oder Zoom nicht die Variante wechseln.
7. Eine beschädigte Kontextfixture muss fail-open bleiben und eine Warnung zeigen, statt Geometrie still zu löschen.

### Räumlicher Filter und Darstellung

1. Luxemburg-Filter bei einer neuen Haupt-DWG als aktiviert prüfen und die dokumentierte Toleranz von 1.000 Metern anzeigen lassen.
2. Referenzobjekte innerhalb, außerhalb, berührend, schneidend und mit unbekannter Ausdehnung prüfen; nur der sicher vollständig äußere Fall darf verschwinden.
3. Den Filter deaktivieren und kontrolliert neu laden; Kamera, GPS, Opazität und Drawerzustand müssen erhalten bleiben.
4. `Original` und `Karte` vergleichen. Im Kartenprofil Füllungsdeckkraft von 0 bis 100 Prozent bewegen: Orthofoto, Linien und Texte dürfen sich nicht verdunkeln.
5. Ein Objekt ganz nach vorne und danach ganz nach hinten setzen; dieselbe Gruppe muss nach einem CAD-Neuladen am gewählten Extrem bleiben.
6. Leader, Hatch plus Kontur und ein Unterobjekt eines wiederverwendeten Blocks prüfen. Bei letzterem müssen bewusst alle Vorkommen gemeinsam reagieren.

### Lokale Junglinster-Referenz

Die bekannte lokale Junglinster-DWG bleibt außerhalb von Git. Sie dient als reale Stabilitäts- und Performance-Referenz, nicht als öffentliches Testasset. Der lokale Browserlauf für Version 0.4.1 ergab und muss für 0.5.0 ohne relevante Verschlechterung wiederholt werden:

| Kennzahl | Ergebnis |
| --- | --- |
| Dateigröße | 11,31 MB |
| erkannte Objekte | 66.816 |
| Layer | 316 |
| Blöcke | 1.097 |
| Layer-Umschaltung | vor dem Fix ungefähr 1 s, danach ungefähr 0,28 s |
| MLightCAD-Pan | 30 Schritte in ungefähr 0,30 s |
| Browserwarnungen | keine |

Dieser Lauf bestätigt den Desktop-Browser-Hotpath, ersetzt aber keine Prüfung auf echter iPhone-Hardware. Ein auf einen schmalen mobilen Viewport gesetzter Desktop-Browser bleibt ebenfalls nur eine responsive UI-Prüfung und kein Ersatz für iOS Safari.

### Lokale XRef-Funktionsprüfung 0.5.0

Die beiden privaten XRef-Referenzen wurden ausschließlich lokal in einem Desktop-Browser geprüft und nicht ins Repository kopiert. Die Projektdatei öffnete als Hauptzeichnung mit 5.086 Objekten, 166 Layern und 18 Blöcken. Die Straßenbauzeichnung meldete vor Ergänzung 56.435 Objekte, 460 Blöcke und 269 Layer sowie zwei fehlende Attachments. Nach lokaler Ergänzung der Projektdatei zeigte der Bericht 62.265 Objekte, 480 Blöcke und 271 Layer; die importierten Tabellen erschienen im getrennten `XRefName|…`-Namensraum. Das empfohlene Profil ließ sich anschließend laden und rendern. Die weiterhin fehlende Trafo-Referenz blieb sichtbar gemeldet.

Der Lauf bestätigt Basisnamenzuordnung, lokale Nachlieferung, Namensräume, Schema-2-Bericht und das Rendern des zusammengeführten Bundles. Er ist keine vollständige visuelle CAD-Paritätsprüfung und ersetzt insbesondere weder die offene Maßstabsvarianten-Abnahme noch den Speichertest auf echtem iPhone-Safari.

- auf einem leistungsfähigen Desktop vollständig laden
- auf einem echten iPhone zuerst das empfohlene Profil prüfen
- bestätigen, dass kein 10-MiB-Limit erscheint und „Vollständig laden“ angeboten bleibt
- Layer-, Block-, Text- und HATCH-Darstellung gegen die CAD-Referenz vergleichen
- einen direkten Block sofort ausblenden
- einen verschachtelten Block über „Änderungen anwenden“ entfernen und ausschließlich diesen Strukturzweig kontrollieren
- einen kontrollierten CAD-Neuaufbau auslösen und prüfen, dass dasselbe Profil erneut angewendet wird
- Netzwerkprotokoll kontrollieren: DWG-Bytes verlassen das Gerät nicht

Ein erfolgreicher Lauf auf einem einzelnen Desktop belegt keine iPhone-Kompatibilität. Die oben genannten iPhone-Schritte sind noch offen. iOS Safari kann den gesamten Tab bei Speicherdruck beenden; dieses Verhalten muss auf realer Hardware geprüft und als verbleibendes Risiko dokumentiert werden.

### Geoportail und Offlinebetrieb

- WMTS absichtlich blockieren und Retry sowie automatischen WMS-Fallback beobachten
- WMS ebenfalls blockieren und sicherstellen, dass CAD auf schwarzem Hintergrund bedienbar bleibt
- bei aktivem WMS die WMTS-Erholung abwarten; erst nach zwei erfolgreichen Proben darf die App zurückwechseln
- Browser offline/online schalten und Status, Layer, CAD, GPS und Kamera prüfen
- Satellitenkarte bewusst aus- und einschalten; der Zustand muss einen CAD-Neuaufbau überstehen

### UI, Kamera und Speicher

- DE/FR/EN auf schmalem iPhone- und Android-Viewport prüfen
- Block-, Layer-, Settings-, DWG- und Objekt-Drawer wiederholt öffnen, außen schließen und lange Listen scrollen; kein Drawer darf die App verschieben
- Layer- und Block-Drawer nebeneinander vergleichen: Suchfeld, Zähler, Aktionsleiste, Zeilenabstände, Icons, Belastungs-Badges und Touchziele müssen übereinstimmen
- Layersuche, Objektzahlen und Belastungs-Badges mit einer Zeichnung mit vielen Layern prüfen; einen vorab gefilterten Layer auswählen und Neuladehinweis sowie „Änderungen anwenden“ kontrollieren
- beim Schließen der Layer- und Block-Drawer kontrollieren, dass die 300-ms-Animation vollständig bleibt und die langen Listen danach aus dem DOM entfernt sind
- prüfen, dass alle Drawer oberhalb von OpenLayers, WebGL, Kartenbuttons und Site-Banner liegen
- im Settings-Drawer nacheinander `Auto`, `Scharf` und `Speichersparend` wählen; CAD-Linienschärfe, Bedienbarkeit und unveränderte Kartenlage bei jedem Wechsel vergleichen
- auf einem iPhone mit DPR 3 kontrollieren, dass der CAD-Canvas in `Auto` höchstens 2×, in `Scharf` höchstens 2,5× und in `Speichersparend` genau 1× verwendet; die mobile OpenLayers-Basiskarte muss in allen drei Fällen bei DPR 1 bleiben
- eine Zeichnung mit hoher Preflight-Risikostufe in `Auto` laden und den Rückgang auf 1× sowie die gegenüber `Scharf` geringere WebGL-Speicherbelegung beobachten
- Pan, Pinch, Mausrad, GPS, Einpassen und tiefen Zoom im MLightCAD-Viewer testen
- während eines MLightCAD-Pans prüfen, dass CAD und Orthofoto in jedem Schritt synchron bleiben, die Koordinatenanzeige aber erst 100 ms nach der letzten Kamerameldung den Endstand übernimmt
- fünf Imports und fünf kontrollierte CAD-Neuaufbauten mit Browser-Speicherwerkzeugen beobachten; Worker, Canvas und WebGL-Kontexte müssen nach Dispose auf den Sollzustand zurückfallen
- Standortberechtigung erlaubt und abgelehnt sowie pausierte Folge und Wiederaufnahme prüfen

### Manuelle Distanzmessung 0.6.1

Diese Schritte sind auf Desktop-Chrome, einem schmalen responsiven Viewport und anschließend auf echter Mobilhardware auszuführen. Eine responsive Desktop-Prüfung darf nicht als iPhone-Abnahme verbucht werden.

1. Ohne DWG den Messmodus mobil öffnen, Karte unter dem festen Aim verschieben und zwei Punkte ausschließlich über „Punkt setzen“ bestätigen.
2. Die angezeigte Distanz gegen zwei bekannte LUREF-Punkte prüfen; Einheit und Ausgabe müssen Meter mit drei bis vier Nachkommastellen sein.
3. Eine CAD-Datei laden und nacheinander Endpunkt, Stützpunkt, Schnittpunkt, Segmentmittelpunkt, Kreismittelpunkt und Nächstpunkt im MLightCAD-Viewer anvisieren.
4. Den nativen Snap an sichtbarer Geometrie sowie die Ablehnung eines ausgeblendeten Layers oder Objekts prüfen.
5. Den CAD-Snap ausschalten; der gesetzte Punkt muss anschließend exakt der Aim-/Kartenmittelpunktkoordinate entsprechen.
6. Auf echter Touchhardware während aktivem Messmodus Pan, Pinch und kurze Taps ausführen. Keine dieser Gesten darf einen Punkt setzen oder ein CAD-Objekt auswählen.
7. Nach dem ersten Punkt das Mess-Sheet schließen und erneut öffnen; Messphase, Punkt und Snap-Schalter müssen erhalten bleiben. Danach eine neue Haupt-DWG auswählen und den vollständigen Reset prüfen.
8. „Neue Messung“ nach einem vollständigen Ergebnis verwenden und direkt neu messen; `Ruler`-Schalter, Griff und ein anderer Kartenmodus müssen die Messoberfläche sauber schließen. Ein Außentipp bleibt der Kartenbedienung vorbehalten und darf das nicht modale Mess-Sheet nicht schließen.
9. Bei geöffnetem Mess-Sheet Pan und Pinch auf einem echten Touchgerät prüfen; die mindestens 44 CSS-Pixel große Setzen-Aktion muss vollständig oberhalb der Safe Area liegen und ohne abgeschnittenen Rand bedienbar sein.
10. Auf Desktop die Maus über End-, Mittel- und Schnittpunkte bewegen, die Fangvorschau prüfen und zwei Punkte direkt per Klick setzen. Eine Maus-Dragbewegung darf keinen Punkt erzeugen.
11. Mit Browser-Performancewerkzeugen prüfen, dass reine MLightCAD-Bewegung keine Snap-Suche, React-Zustandsaktualisierung oder Worker-Nachricht in den synchronen Kamera-Hotpath einfügt.

### Manuelle UI- und Dateiabnahme 0.7.1

1. `/` direkt und nach einem Browser-Reload öffnen; ausschließlich MLightCAD darf als CAD-Viewer erscheinen. `/openlayers` muss per HTTP 301 auf `/` zeigen.
2. DWG über den goldenen Button im App-Kopf und Settings über den goldenen Button rechts in der Kartensteuerung öffnen. Inhaltstrennung, identische Bottom-Sheet-Animation, Griff, Backdrop, Escape, Fokus und mobile Safe Area kontrollieren.
3. Nacheinander ein Objekt, einen Layer und einen Block ausblenden. Die drei Zähler und Wiederherstellungsaktionen müssen unabhängig reagieren; die Wiederherstellung eines Typs darf die anderen beiden Zustände nicht löschen.
4. Eine `.dwg` vom Desktop auf die Kartenfläche ziehen. Ohne bestehende Datei direkt importieren; mit bestehender Datei Replace zuerst abbrechen und danach bestätigen. Kamera und Sitzung müssen beim Abbruch unverändert bleiben.
5. Mehrere Dateien und eine falsche Endung auf die Karte ziehen. Der DWG-Drawer muss eine verständliche Fehlermeldung zeigen, ohne die Hauptdatei zu ersetzen.
6. Auf Desktop per Rechtsklick „Position von hier“ wählen, die goldene Zweilinienmarkierung prüfen und anschließend über den quadratischen Zurück-Button zur offenen Zielwahl zurückkehren.
7. Danach „Position von der Mitte“ wählen. Koordinate und Links müssen dem roten Mittelpunkt entsprechen; eine zusätzliche goldene Markierung darf nicht erscheinen.
8. Für beide Desktop-Ziele die Koordinate kopieren und Geoportail, Google Maps, Apple Maps sowie Google Street View kontrollieren.
9. Auf echter Touchhardware die Karte so verschieben, dass das rote Kreuz über einem bekannten Punkt liegt, und einen Einfinger-Langdruck ausführen. Sheet, kopierte Koordinate und Links müssen ausschließlich diesen Kartenmittelpunkt verwenden; es darf keine goldene oder sonstige neue Markierung erscheinen.
10. Den mobilen Langdruck mit Bewegung über zehn Pixel, zweitem Finger und Pinch wiederholen; dabei darf sich kein Positions-Sheet öffnen und Pan/Zoom muss flüssig bleiben.
11. Den mobilen Mittelpunkt-Langdruck mit und ohne geladene DWG wiederholen. Rotes Kreuz, kopierte LUREF-Koordinate und externe Links müssen dieselbe Mittelpunktposition verwenden.
12. Den Filter „Luxemburg + 1 km Außenpuffer“ ein- und ausschalten und mit bekannten Grenzfixtures bei 999,99 m, 1.000 m und 1.000,01 m außerhalb vergleichen.
13. Mit geöffnetem und geschlossenem Drawer Pan, Pinch, Mausrad und tiefen Zoom prüfen. Der Hotpath und die visuelle CAD-/Kartenkopplung dürfen gegenüber 0.7.0 nicht schlechter werden.

## Nicht Teil der Abnahme

- Bearbeiten oder Neuschreiben einer DWG
- Erzeugen einer optimierten DWG zum Download
- Upload, Netlify Function, Datenbank oder persistente Dateispeicherung
- vollständige Darstellungsgarantie für nicht lokal aufgelöste XRefs, Papierlayouts, proprietäre Custom Entities oder 3D-Inhalte
- vollständige XCLIP-, Proxy-/Custom-Entity- oder AutoCAD-XRef-Parität
- vollständige Schrifterkennung über die vom Renderer gemeldeten `missedFonts` hinaus

Nach einem späteren GitHub-Push übernimmt das vorhandene Git-basierte Netlify-Projekt Build und Bereitstellung der aktuellen Version. Push und Deploy gehören nicht zu diesem Implementierungsschritt; Netlify sowie die weitergehende manuelle CAD- und Hardware-Abnahme bleiben bis dahin ausstehend.

## Ergänzende Abnahme für 0.5.1

- die offizielle WMTS-Konfiguration der PCN-Layer `parcels` und `parcels_labels` verwendet PNG-Transparenz und `GLOBAL_WEBMERCATOR_4_V3`
- Satellit und Kataster lassen sich unabhängig schalten und behalten ihren sitzungsweiten Zustand bei einem CAD-Neuaufbau
- der Kataster-Layer liegt unter CAD und GPS; sein Schalter steht direkt unter dem Satellitenschalter
- das rote Fadenkreuz bleibt klein, nicht interaktiv und exakt am CSS-Viewportmittelpunkt; die LUREF-Koordinatenkarte zeigt denselben Kartenmittelpunkt
- eine automatisch geladene einfache DWG bietet im CAD-Drawer weiterhin „DWG vorbereiten“; bestätigte Änderungen laden nur CAD neu und erhalten die Ansicht
- der CAD-Drawer enthält weder Darstellungsprofil noch Füllungsdeckkraft, behält aber die globale CAD-Deckkraft
- eindeutige annotative Attribut- und MLeader-Varianten folgen dem gewählten Maßstab; uneindeutige Kontextdaten bleiben fail-open vollständig erhalten
- der MLightCAD-Hotpath bleibt `viewChanged → setCenter/setResolution → renderSync()` ohne zusätzliche React-, Worker- oder Katasterarbeit
- Version `0.5.1` erscheint in Paketmetadaten und Kopfzeile; TypeScript, Vitest, Produktionsbuild und visuelle Desktop-/Mobilprüfung müssen erfolgreich sein

## Abschlussprüfung 0.5.2

### Maßstab-Layer und reale Junglinster-DWG

- die 11,31-MB-Datei `2023- Bestandskanal_Junglinster.dwg` wurde ausschließlich browserlokal verarbeitet und erfolgreich bis zum gerenderten MLightCAD-Dokument importiert
- die Datei verwendet für die problematischen MLeader-Beschriftungen keine nativen annotativen MLeader-Kontexte, sondern physische Layerfamilien mit `@ 1`, `@ 0.5` und `@ 0.25`
- ohne globalen `CANNOSCALE` wird die Häufigkeit belastbarer Objektkontexte ausgewertet; `1/1000 Best` ist der dominante Kontext und wird automatisch empfohlen
- eine manuelle Auswahl von `1/500 Best` übernimmt die entsprechenden Geschwisterlayer in den bestehenden Modellfilter; Modellbereich, Blockdefinitionen und Referenzen bleiben dabei strukturell erhalten
- die direkte Mutation der LibreDWG-Entitätslisten wird nicht verwendet; der damit reproduzierbare MLightCAD-Stackoverflow tritt im Abschlusslauf nicht mehr auf
- bei LUREF `86200 / 86311.948` wurde die Auswahl `1/500 Best` visuell geprüft: Die Maßstabbeschriftung liegt genau einmal vor, nicht gleichzeitig in mehreren Layermaßstäben
- unvollständige Layerfamilien und nicht eindeutig zuordenbare Kontexte bleiben fail-open erhalten

### Basemap, Kataster und Mittelpunkt

- drei aufeinanderfolgende WMTS-Fehler erzeugen genau einen Retry; ein WMTS-Stall von acht Sekunden aktiviert WMS `ortho_latest`
- der unabhängige 60-Sekunden-Zeitgeber wird nicht von erfolgreichen WMS-Kacheln zurückgesetzt und läuft auch bei `unavailable`; zwei erfolgreiche WMTS-Proben wechseln zurück zu `ortho_2025`
- die Katasteranzeige verwendet ausschließlich die offiziellen WMTS-Layer `parcels` und `parcels_labels` und ist in DE/FR/EN als WMTS gekennzeichnet
- das rote Mittelpunkt-Symbol misst 14 × 14 CSS-Pixel, besteht nur aus horizontaler und vertikaler Linie, ist `aria-hidden` und blockiert keine Karteninteraktion

### Vorbereitungssheet und visuelle Prüfung

- ohne benutzerseitige Änderung ist genau eine goldene Aktion „Empfohlen laden“ vorhanden; nach Layer-, Block-, Maßstabs- oder Grenzfilteränderung wird dieselbe Aktion zu „Auswahl laden“
- Ausgangsobjekte und erwartete Objekte nach Empfehlung verwenden beide die Werte aus `DwgProfileImpact`; Layer-/Blockstruktur und geschätzte Performancekosten sind davon eindeutig getrennt
- der Luxemburg-Filter zeigt Toleranz, Schalter und eine einzige kompakte Ergebniszusammenfassung ohne doppelte Ausschlusszeile
- fünf bereitgestellte Source-Screenshots wurden mit Implementierungsscreenshots und vier gemeinsamen Vergleichsbildern unter `docs/qa/0.5.2/` geprüft
- Desktop: 1280 × 720 CSS-Pixel, DPR 1; Mobile: 390 × 844 CSS-Pixel, DPR 1
- geprüfte Zustände: MLightCAD-Karte mit realer Junglinster-DWG, Vorbereitungssheet, manuelle `1/500`-Darstellung und mobiler Kartenmittelpunkt

### Automatisierter Abschluss

- Vitest: 48 Dateien, 243 Tests, alle bestanden
- TypeScript-/Vite-Produktionsbuild: erfolgreich
- Produktionsassets einschließlich versioniertem LibreDWG-WASM und Workerpfad wurden erzeugt
