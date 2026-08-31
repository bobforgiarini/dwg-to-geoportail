# Changelog

Alle relevanten Änderungen an DWG to Geoportail werden hier dokumentiert.

## [0.7.1] – 2026-08-31

### Geändert

- den DWG-/Upload-Button in den App-Kopf verschoben und den goldenen Settings-Button wieder rechts in der kompakten Kartensteuerung angeordnet
- mobile Positionsaktionen verwenden bei einem Langdruck ausschließlich die LUREF-Position des festen roten Kartenmittelpunkt-Kreuzes; auf Mobilgeräten wird keine zusätzliche goldene Zielmarkierung erzeugt
- den Desktop-Rechtsklick um eine schnelle Zielwahl zwischen „Position von hier“ mit goldener Markierung und „Position von der Mitte“ am roten Fadenkreuz erweitert
- die Desktop-Detailansicht des Positionsmenüs erhält links neben der kopierbaren Koordinate einen kleinen quadratischen Zurück-Button, der ohne Schließen des Menüs zur Zielwahl zurückführt
- Paket- und Kopfversion auf `0.7.1` angehoben

### Prüfung

- Regressionen für vertauschte Header-/Kartenaktionen, ausschließlich rote mobile Mittelpunktwahl, beide Desktop-Zielarten, Rücknavigation und Koordinatenkopie ergänzt beziehungsweise aktualisiert
- Pan, Pinch, CAD-Auswahl, Messung und der synchrone MLightCAD-Kamera-Hotpath bleiben von der Positionswahl getrennt

## [0.7.0] – 2026-08-31

### Hinzugefügt

- eigenständigen Settings-Drawer im App-Kopf ergänzt; er bündelt CAD-Deckkraft, Qualitätsstufe, Textsichtbarkeit und getrennte Wiederherstellung von Objekten, Layern und Blöcken mit eigenen Zählern
- separaten DWG-Drawer für Dateiauswahl, Entfernen, Ersetzen, Importstatus, Abbruch, Vorbereitung und den eindeutig bezeichneten Filter „Luxemburg + 1 km Außenpuffer“ ergänzt
- lokalen Desktop-Drag-and-drop-Einstieg für genau eine `.dwg` auf der Kartenfläche ergänzt; eine bestehende Zeichnung wird erst nach Bestätigung ersetzt
- Positionsmenü per Desktop-Rechtsklick und mobiles Positions-Sheet per Einfinger-Langdruck ergänzt; LUREF-Koordinaten lassen sich im Format `X.XX, Y.XX` kopieren und in Geoportail, Google Maps, Apple Maps oder Google Street View öffnen
- temporäres goldfarbenes Zweilinienkreuz für die im Positionsmenü gewählte Stelle ergänzt

### Geändert

- MLightCAD ist der einzige CAD-Viewer unter `/`; der bisherige eigenständige OpenLayers-/Flyfish-CAD-Viewer, seine Importpipeline, Umschaltung und Laufzeitabhängigkeit wurden entfernt
- `/openlayers` wird vor dem SPA-Fallback permanent auf `/` umgeleitet; OpenLayers bleibt als interne Kartenbasis für Geoportail, Kataster, GPS, Messgeometrie und die synchrone MLightCAD-Kamerakopplung erhalten
- Datei-, Replace- und Drag-and-drop-Einstiege verwenden denselben lokalen Importpfad; ungültige oder mehrere gedroppte Dateien werden im DWG-Drawer erklärt und verändern die bestehende Sitzung nicht
- getrennte Wiederherstellungsaktionen bewahren jeweils die übrigen Objekt-, Layer- und Blockfilter; nur zuvor workerseitig entfernte Inhalte lösen genau einen kontrollierten CAD-Neuaufbau mit erhaltener Kamera aus
- Luxemburg-Filtertext und Dokumentation stellen klar, dass Luxemburg selbst sowie der Bereich bis einschließlich 1.000 Meter außerhalb der Landesgrenze erhalten bleiben
- Paket- und Kopfversion auf `0.7.0` angehoben

### Prüfung

- Tests für Single-Viewer-Root, permanenten Legacy-Redirect, geteilte Drawer, getrennte Wiederherstellung, Drag-and-drop-Bestätigung, Positionslinks, Koordinatenkopie und mobile Langdruck-Abbruchbedingungen ergänzt beziehungsweise aktualisiert
- 51 Testdateien mit 275 bestandenen Tests sowie den vollständigen TypeScript-/Vite-Produktionsbuild erfolgreich ausgeführt
- Produktionsbuild liefert ausschließlich die versionierten MLightCAD-/LibreDWG-Assets unter `/mlightcad-workers/0.7.0/`; ein Legacy-WASM-Verzeichnis wird nicht mehr erzeugt
- Produktionsvorschau bei 390 × 844 und 1.200 × 800 CSS-Pixeln geprüft: beide getrennten Drawer, Backdrop-Schließen und das Desktop-Positionsmenü funktionieren ohne Browserfehler
- die unveränderte synchrone Kameraabfolge `viewChanged → setCenter/setResolution → renderSync()` sowie die Abwesenheit der Flyfish-/Legacy-CAD-Pipeline bleiben durch Regression und Produktionsgraph abgesichert

## [0.6.1] – 2026-08-28

### Geändert

- Messoberfläche auf denselben gemeinsamen Bottom-Sheet wie Layer und Blöcke vereinheitlicht und mobil auf CAD-Snap, Punktaktion und Ergebnis reduziert
- sichtbare Überschrift, Anleitung, Punktkoordinaten und Snap-Detailtext entfernt; vertikale Abstände, Safe-Area-Padding und Aktionszeile verhindern einen abgeschnittenen unteren Button
- Desktop-Messung in beiden Viewern um direkte Mausklick-Punktwahl und eine CAD-Snap-Vorschau beim Hover ergänzt
- Touchbedienung bleibt strikt beim festen Aim mit expliziter 44-Pixel-Punktaktion; Touch-Taps, Pan und Pinch setzen weiterhin keinen Punkt
- Paket- und Kopfversion auf `0.6.1` angehoben

### Prüfung

- Regressionstests für kompakten Sheet, Desktop-Hover/-Klick, Touch-Sperre, sichtbarkeitsgefiltertes Snap und MLightCAD-Screenkoordinaten ergänzt
- Abschlusslauf mit 52 Testdateien und 288 bestandenen Tests sowie erfolgreichem TypeScript-/Vite-Produktionsbuild durchgeführt

## [0.6.0] – 2026-08-28

### Hinzugefügt

- touchgerechte 2D-Distanzmessung für beide Viewer ergänzt; der `Ruler`-Button öffnet einen gemeinsamen Bottom-Sheet mit Punkt 1, Punkt 2, Ergebnis, „Neue Messung“ und CAD-Snap-Schalter; beendet wird über den aktiven `Ruler`-Schalter oder den Sheet-Griff
- das feste rote Aim liegt exakt in der Mitte des tatsächlich nutzbaren Karten- beziehungsweise CAD-Canvasbereichs; ein Punkt wird ausschließlich über die mindestens 44 Pixel große Aktion gesetzt, niemals durch Pan, Pinch oder einen Karten-Tap
- euklidische Distanzberechnung direkt in LUREF `EPSG:2169`; Meterwerte werden mit mindestens drei und höchstens vier Nachkommastellen ausgegeben
- OpenLayers-Snap für Endpunkt, Stützpunkt, Schnittpunkt, Mittelpunkt, Kreismittelpunkt und Nächstpunkt innerhalb von 18 CSS-Pixeln ergänzt; berücksichtigt werden nur sichtbare CAD-Features, begrenzt auf 48 Kandidaten und 512 Geometriesegmente
- MLightCAD-Snap über den nativen OSNAP mit 18 CSS-Pixeln Fangradius und Sichtbarkeitsprüfung ergänzt; Messlinie, Punkte und Fangvorschau werden als leichte Three.js-Geometrie dargestellt

### Geändert

- Messphase, gesetzte LUREF-Punkte und Snap-Schalter liegen im gemeinsamen Sitzungskontext und bleiben beim Wechsel zwischen `/` und `/openlayers` erhalten; eine neue Haupt-DWG setzt die Messung zurück
- die normale CAD-Objektauswahl ist während des Messmodus deaktiviert, damit ein explizites Setzen nicht gleichzeitig ein Objekt auswählt
- die Snap-Vorschau wird erst 120 ms nach Bewegungsende berechnet; der synchrone MLightCAD-Kamera-Hotpath enthält weiterhin keine Snap-, React-, Worker- oder zusätzliche Projektionsarbeit
- Paket- und Kopfversion auf `0.6.0` angehoben

### Prüfung

- automatisierte Prüfungen für Messzustand, Formatierung, Snap-Prioritäten und -Grenzen, Sichtbarkeitsfilter, beide Vieweradapter sowie den unveränderten Kamera-Hotpath ergänzt
- Abschlusslauf mit 52 Testdateien und 280 bestandenen Tests sowie erfolgreichem TypeScript-/Vite-Produktionsbuild durchgeführt
- Produktionsvorschau bei 390 × 844 CSS-Pixeln ohne DWG geprüft: Aim, nicht modales Mess-Sheet, Kartenbewegung, Zwei-Punkt-Messung und erhaltener Zustand beim Wechsel zwischen `/` und `/openlayers` funktionieren ohne Browserfehler
- manuelle Abnahme auf echter iPhone-Hardware bleibt getrennt im Prüfplan aufgeführt und wird nicht durch responsive Desktop-Prüfungen ersetzt

## [0.5.2] – 2026-08-28

### Behoben

- die reale Junglinster-DWG erkennt nun ihre physischen Maßstab-Layerfamilien mit den Suffixen `@ 1`, `@ 0.5` und `@ 0.25`; die gewählte Darstellung wird über den vorhandenen struktur-erhaltenden Modellfilter statt über eine direkte Mutation der LibreDWG-Datenbank angewendet
- bei fehlendem globalem `CANNOSCALE` wird der dominante Objektkontext als Empfehlung verwendet; für die Junglinster-Referenz wird dadurch automatisch `1/1000 Best` statt des zuvor zufällig sortierten `1/500 Best` gewählt
- die manuelle Auswahl `1/500 Best` blendet nur die eindeutig zugehörigen Maßstabgeschwister aus und vermeidet den zuvor bei direkter Datenbankmutation möglichen MLightCAD-Stackoverflow
- der WMTS-Wiederanlauf ist vom WMS-Kachellebenszyklus entkoppelt: Solange WMS oder der Zustand „nicht verfügbar“ aktiv ist, prüft die App WMTS alle 60 Sekunden und wechselt nach zwei erfolgreichen Prüfungen zurück

### Geändert

- das Kartenmittelpunkt-Symbol ist jetzt ein schlichtes rotes Zweilinienkreuz mit 14 Pixel Kantenmaß, ohne Kreis oder Zielmarkierung
- Kataster wird in der Oberfläche ausdrücklich als `Kataster (WMTS)` bezeichnet; die offiziellen Layer `parcels` und `parcels_labels` besitzen bewusst keinen WMS-Fallback
- der Vorbereitungssheet verwendet nur noch eine dynamische goldene Hauptaktion: unverändert „Empfohlen laden“, nach einer manuellen Änderung „Auswahl laden“
- die Kennzahlen unterscheiden Ausgangsobjekte, erwartete Objekte nach Empfehlung und geschätzte Last klar voneinander; der Luxemburg-Abschnitt wurde zu einer kompakten, nicht redundanten Zusammenfassung verdichtet
- Paket- und Kopfversion auf `0.5.2` angehoben

### Prüfung

- 48 Testdateien mit 243 bestandenen Tests sowie der TypeScript-/Vite-Produktionsbuild erfolgreich ausgeführt
- private Junglinster-DWG mit 11,31 MB vollständig browserlokal importiert; automatische Auswahl `1/1000 Best` sowie manuelle `1/500`-Darstellung bei LUREF `86200 / 86311.948` mit genau einer sichtbaren Maßstabsvariante geprüft
- Desktop- und Mobiloberfläche bei 1280 × 720 beziehungsweise 390 × 844 CSS-Pixeln mit DPR 1 gegen die fünf bereitgestellten Referenzbilder verglichen

## [0.5.1] – 2026-08-28

### Hinzugefügt

- optionale Geoportail-Kataster-Overlays `parcels` und `parcels_labels` mit Parzellengrenzen und -nummern als eigenen kompakten Kartenschalter direkt unterhalb der Satellitenkarte ergänzt
- kleines festes rotes Fadenkreuz in der Bildschirmmitte ergänzt; es markiert exakt den Kartenmittelpunkt, dessen LUREF-Koordinaten in der Statuskarte angezeigt werden
- dauerhaft verfügbare Aktion „DWG vorbereiten“ im CAD-Drawer ergänzt, sodass Maßstab, XRefs, Luxemburg-Filter und Ladeprofil auch bei automatisch geladenen einfachen Zeichnungen nachträglich angepasst werden können
- Importnachbearbeitung für eindeutig zuordenbare annotative Attribute und MLeader-Maßstabsvarianten ergänzt; mehrdeutige Kontextdaten bleiben weiterhin verlustfrei erhalten

### Geändert

- den nicht benötigten Bereich „Darstellungsprofil“ samt Profilwahl und Füllungsdeckkraft aus dem CAD-Drawer entfernt; die globale CAD-Deckkraft bleibt erhalten
- Kataster- und Satellitenzustand werden gemeinsam sitzungsweit zwischen `/` und `/openlayers` erhalten
- Paket-, Kopf- und Releaseversion auf `0.5.1` angehoben

### Performance und Grenzen

- die synchrone MLightCAD-Kamerabrücke und der Pan-/Zoom-Hotpath aus `0.2.4` bleiben unverändert; Kataster, Fadenkreuz und Koordinatenanzeige fügen dort keine React- oder Workerarbeit hinzu
- alternative annotative Darstellungen werden nur bei belastbarer Zuordnung entfernt; beschädigte oder uneindeutige LibreDWG-Kontexte werden bewusst nicht heuristisch gelöscht

## [0.5.0] – 2026-08-27

### Hinzugefügt

- nativen Annotationsmaßstab-Preflight für `SCALE`, `CONTEXTDATAMANAGER` und bekannte `*OBJECTCONTEXTDATA` ergänzt; gespeicherte und erkannte Maßstäbe können für den Import fest gewählt werden, beschädigte oder mehrdeutige Zuordnungen bleiben bewusst unverändert
- lokale Mehrfachauswahl für fehlende XRefs sowie sequenzielle, basisnamengestützte Auflösung mit Status für Attachments, Overlays, Mehrdeutigkeiten, Zyklen und ungültige Referenzen ergänzt; DWG-Dateien bleiben vollständig im Browser-Arbeitsspeicher
- lokalen Luxemburg-Filter auf Grundlage der offiziellen ACT-Landesgrenze ergänzt: standardmäßig aktiv, exakt 1.000 Meter Puffer, konservatives Behalten schneidender und unbekannter Objekte
- Darstellungsprofile `Original` und `Karte` sowie einen separaten Regler ausschließlich für HATCH-/SOLID-/Füllungsmaterialien ergänzt
- Objektaktionen `Ganz nach vorne` und `Ganz nach hinten` in beiden Viewern ergänzt; mehrteilige Darstellungen und wiederverwendete Block-Unterobjekte verwenden stabile gemeinsame Reihenfolgeschlüssel
- Vorbereitungsbericht auf Schema 2 mit konkreten Auswirkungen, echten Objektzahlen und ausdrücklich getrennten Performancekostenschätzungen erweitert
- Datenquellen-, Architektur-, Test- und Release-Dokumentation für Annotationsmaßstäbe, lokale XRefs, ACT-Grenzdaten, Darstellung und Zeichenreihenfolge ergänzt

### Geändert

- MLightCAD führt aufgelöste XRefs vor der Viewer-Konvertierung unter getrennten `XRefName|…`-Tabellen- und Blocknamensräumen zusammen; Attachments können weitere lokale Referenzen laden, Overlays nicht
- Layer-, Block-, Text-, Objekt-, Filter-, Darstellungs-, Maßstabs- und Zeichenreihenfolgezustände bleiben innerhalb der Sitzung zwischen `/` und `/openlayers` erhalten und werden bei einer neuen Haupt-DWG zurückgesetzt
- `Original` zeigt Füllungen mit 100 Prozent; `Karte` startet mit 35 Prozent Füllungsdeckkraft, ohne leere Canvasbereiche, Orthofoto, Linien oder Texte abzudunkeln
- OpenLayers setzt Zeichenreihenfolgen über `Style.zIndex` und genau eine Ebenenaktualisierung um; MLightCAD verwendet begrenzte Preview-Fragmente mit vollständigem Dispose statt eines CAD-Neuimports
- die App-Version im Kopf und die Paketmetadaten wurden auf `0.5.0` angehoben; die bestehenden MLightCAD-Abhängigkeiten und der Worker-Assetpfad `/mlightcad-workers/0.3.0/` bleiben unverändert
- Vorbereitung, Annotationsmaßstab, XRef-Zustände, Luxemburg-Filter, Darstellungsprofile und Zeichenreihenfolge vollständig in Deutsch, Französisch und Englisch ergänzt
- vom MLightCAD-Renderer nach Renderstart gemeldete fehlende beziehungsweise ersetzte CAD-Schriften werden bestmöglich mit Schriftname und Vorkommenszahl im lokalisierten Importbericht angezeigt

### Performance

- der synchrone Kamera-Hotpath aus `0.2.4`/`0.4.1` bleibt unverändert: jede MLightCAD-Meldung setzt direkt LUREF-Mittelpunkt und Auflösung und führt im selben Ereignis `renderSync()` aus
- Annotationen, XRefs, Grenzfilter und Importauswirkungen werden ausschließlich während Preflight beziehungsweise Import berechnet; Pan und Zoom erhalten keine zusätzliche Worker-, React-, Projektions- oder Grenzprüfungsarbeit
- MLightCAD-Preview-Budgets verhindern übergroße Zeichenreihenfolgeaktionen; bei Überschreitung bleibt die Szene unverändert und zeigt einen lokalisierten Hinweis

### Grenzen

- keine Datei wird allein aufgrund ihrer Größe blockiert; ein vollständiger Ladeversuch bleibt verfügbar
- XCLIP, proprietäre Custom-/Proxy-Objekte, 3D-Darstellung, CAD-Bearbeitung und das Schreiben einer optimierten DWG bleiben außerhalb dieses Releases
- weil `convertEx()` keine belastbare Eigentümerzuordnung alternativer Annotationsdarstellungen liefert, bleibt die Maßstabsauswahl fail-open und entfernt in 0.5.0 keine Darstellung heuristisch
- die Schriftmeldung basiert auf den vom Renderer erkannten `missedFonts`; vom Parser ausgelassene oder nicht gemeldete Schriftverwendungen können weiterhin fehlen
- private Referenz-DWGs werden nicht in das Repository aufgenommen, hochgeladen oder persistent gespeichert

## [0.4.1] – 2026-08-26

### Behoben

- MLightCAD-Bewegungen lösen nicht mehr für jede Kamerameldung einen vollständigen React-Seitenrender aus: Die direkte Kamerabrücke aus Version `0.2.4` bleibt unverändert synchron, nur die Koordinatenanzeige übernimmt den letzten Stand nach 100 ms ohne weitere Kamerameldung
- ein durch die CAD-Kamerakopplung programmgesteuert ausgelöstes OpenLayers-`moveend` veröffentlicht keine zusätzliche Koordinate mehr an die Seite; manuelle OpenLayers-Bewegungen ohne aktive MLightCAD-Steuerung bleiben davon unberührt

### Optimiert

- Inhalte der Layer- und Block-Drawer bleiben während der 300-ms-Schließanimation gemountet und werden unmittelbar danach entfernt; geschlossene Drawer berechnen und rendern damit keine teuren Listen mehr
- Preflight- und Renderer-Layer werden über vorbereitete Identitätsindizes in `O(L)` statt über wiederholte Suchen in `O(L²)` zusammengeführt
- Layerzeilen sind memoisiert; stabile Daten, Beschriftungen und Sichtbarkeits-Callbacks verhindern, dass eine einzelne Umschaltung alle unveränderten Zeilen neu rendert

### Prüfung

- 31 gezielte Regressionstests für Kamerakopplung, Koordinatenaktualisierung, Drawer-Lebenszyklus, Layer-Zusammenführung und Zeilen-Memoisierung erfolgreich ausgeführt
- reale Junglinster-DWG mit 11,31 MB, 66.816 Objekten, 316 Layern und 1.097 Blöcken im Browser geprüft: Layer-Umschaltung von ungefähr 1 s auf ungefähr 0,28 s reduziert, MLightCAD-Pan mit 30 Schritten in ungefähr 0,30 s, keine Browserwarnungen

## [0.4.0] – 2026-08-26

### Hinzugefügt

- adaptive MLightCAD-Canvas-Qualität im Drawer „DWG & Darstellung“ ergänzt: `Auto` rendert mit bis zu 2×, `Scharf` mit der nativen Pixeldichte bis höchstens 2,5× und `Speichersparend` fest mit 1×
- der Auto-Modus reduziert die CAD-Auflösung bei knappen Gerätespeichern sowie erhöhter oder hoher Preflight-Risikoeinstufung; vor abgeschlossenem Preflight werden große beziehungsweise mobile Importe vorsichtig behandelt

### Geändert

- MLightCAD ist jetzt der Standard-Viewer unter `/`; der bisherige OpenLayers-Viewer bleibt als Legacy-Ansicht unter `/openlayers` erreichbar
- der Viewer-Umschalter verwendet die neuen Routen, während die lokale DWG-Sitzung und das Ladeprofil beim Wechsel erhalten bleiben
- der Layer-Drawer verwendet jetzt Layout und Bedienelemente des Block-Drawers: Suche, sichtbare und ausgeblendete Zähler, gemeinsame Sichtbarkeitsaktionen und kompakte Layerzeilen
- jede Layerzeile zeigt Objektzahl und geschätzte Belastung; aus dem geladenen Modell gefilterte Layer werden mit einem Neuladehinweis gekennzeichnet und lassen sich gesammelt über „Änderungen anwenden“ neu aufbauen
- die im Kopf angezeigte Version wird aus den Paketmetadaten gelesen und zeigt damit ebenfalls `0.4.0`
- die Qualitätswahl verändert ausschließlich die Pixeldichte des MLightCAD-WebGL-Canvas; die darunterliegende OpenLayers-Basiskarte behält ihre unabhängige mobile Speicherregel mit DPR 1
- iPhones rendern nicht mehr pauschal den vollständigen nativen DPR 3: `Auto` endet spätestens bei 2×, `Scharf` spätestens bei 2,5× und `Speichersparend` bei 1×

### Prüfung

- 36 Testdateien mit 171 Tests sowie den vollständigen TypeScript-/Vite-Produktionsbuild erfolgreich ausgeführt
- Produktionsvorschau für `/` und `/openlayers` ohne Browserfehler geprüft; MLightCAD-Qualitätswahl auf 390 × 844 Pixel kontrolliert und ihre Sitzungserhaltung beim Viewerwechsel bestätigt

## [0.3.2] – 2026-08-26

### Behoben

- die vollständige MLightCAD-Kamerakopplung des flüssigen Stands `0.2.4` wiederhergestellt: OpenLayers arbeitet in der MLightCAD-Ansicht wieder direkt in LUREF `EPSG:2169`
- CAD-Mittelpunkt und Meter-pro-Pixel-Auflösung werden ohne Web-Mercator-Transformation unmittelbar auf OpenLayers übertragen
- jede MLightCAD-Kamerameldung aktualisiert und rendert die Hintergrundkarte wieder synchron im selben Bewegungszyklus; dadurch entsteht kein sichtbarer Frame Abstand zwischen CAD und Orthofoto
- GPS-Marker und Genauigkeitskreis werden in der MLightCAD-Karte wieder direkt in LUREF-Metern geführt

### Beibehalten

- adaptiver Preflight, Block-/Layerfilter, gemeinsame Drawer, Speicherbegrenzungen und der WMTS-/WMS-Zustandsautomat aus `0.3.0` bleiben unverändert
- die in `0.3.1` ergänzte Unterdrückung redundanter Basemap-Statusmeldungen bleibt aktiv, da sie nicht in den Kamera-Hotpath eingreift

## [0.3.1] – 2026-08-26

### Behoben

- MLightCAD-Kamerameldungen werden beim Verschieben und Zoomen auf höchstens eine Kartenkopplung pro Browserframe zusammengefasst. Zwischenstände einer schnellen Maus- oder Touchbewegung werden verworfen, der neueste Kamerastand bleibt maßgeblich.
- die erzwungene synchrone OpenLayers-Darstellung aus der MLightCAD-Bewegungsschleife entfernt; OpenLayers plant die bereits durch Mittelpunkt und Auflösung ausgelöste Darstellung nun selbst, ohne die Three.js-Animation zu blockieren
- die LUREF-Koordinatenanzeige auf höchstens zehn Aktualisierungen pro Sekunde begrenzt, damit eine Bewegung nicht den gesamten React-Seitenbaum für jedes Pointerereignis neu berechnet
- identische Geoportail-Statusmeldungen werden nicht mehr für jede fertig geladene Kachel erneut an React verteilt

### Prüfung

- Git-Vergleich mit dem zuvor flüssigen Stand `0.2.4` durchgeführt: MLightCAD-Navigation und Renderer blieben gleich; neu in `0.3.0` waren die Web-Mercator-Transformation je Kamerameldung sowie die kachelweisen Basemap-Statusmeldungen
- 31 Testdateien mit 146 Tests sowie den vollständigen TypeScript-/Vite-Produktionsbuild erfolgreich ausgeführt

## [0.3.0] – 2026-08-26

### Hinzugefügt

- adaptiven DWG-Preflight ergänzt, der Layer, erreichbare Blockgraphen, Instanzen, Texte, Leader, Schraffuren, Polylinienpunkte, nicht unterstützte Inhalte und das geschätzte Gerätebudget bewertet
- Vorbereitungssheet für tatsächlich komplexe Zeichnungen mit „Vollständig laden“, empfohlenem Filterprofil, anpassbarer Layer-/Blockauswahl und Abbruch ergänzt; eine Dateigröße allein sperrt den Import niemals
- speicherwirksames Ladeprofil ergänzt: abgewählte Layer, Blöcke und nicht unterstützte Objektgruppen werden vor Feature-/Szenenaufbau gefiltert, während Blocktransformationen, Attribute und Layer-0-Vererbung erhalten bleiben
- gemeinsamen Block-Drawer für beide Viewer ergänzt, einschließlich Suche, Sichtbarkeitszählern, benannten beziehungsweise gruppierten Systemblöcken, XRef-Kennzeichnung und Belastungsschätzung
- Blockpfad und Block-Ausblendaktion im Objekt-Drawer ergänzt; direkte Modellbereichsblöcke lassen sich unmittelbar schalten, strukturelle Änderungen an verschachtelten Blöcken werden durch einen kontrollierten CAD-Neuladevorgang angewendet
- nicht dateihaltigen Recovery-Marker ergänzt, damit die App nach einem wahrscheinlich vom Browser beendeten Import eine vorbereitete Darstellung empfiehlt
- gemeinsamen Geoportail-Zustandsautomaten mit `loading`, `ready`, `retrying`, `offline` und `unavailable` für beide Viewer ergänzt
- automatisierte Tests für Preflight, verschachtelte beziehungsweise zyklische Blöcke, Filterung, Recovery-Marker, Block-Drawer, Basemap-Fallback und den gepatchten WASM-Speicher ergänzt
- ein anwendungseigener LibreDWG-Module-Worker sendet den kompakten Preflight vor dem Modell, wartet bei Risiko auf die Ladeentscheidung und überträgt erst danach die gefilterte Datenbank; beide Viewer verwenden diesen Pfad
- die versionierte MLightCAD-Laufzeit liefert neben API und gepatchtem WASM nun auch das tatsächlich referenzierte `libredwg-web.js` aus; ein Regressionstest schützt die relative Assetkette

### Geändert

- Geoportail-WMS-Fallback auf den offiziellen Open-Data-Endpunkt und den Layer `ortho_latest` korrigiert; `ortho_2025` per WMTS bleibt bevorzugt
- WMTS wechselt nicht mehr beim ersten Kachelfehler: nach drei aufeinanderfolgenden Fehlern folgt ein Retry, nach acht Sekunden Stillstand WMS; WMS wird nach zehn Sekunden ohne Erfolg als nicht verfügbar gemeldet
- während eines funktionierenden WMS-Fallbacks wird WMTS kontrolliert geprüft und erst nach zwei erfolgreichen Prüfungen wieder aktiviert
- die ausgelieferten LibreDWG-WASM-Module erhalten reproduzierbar 128 MiB Anfangsspeicher statt 1 GiB; kontrolliertes Speicherwachstum und das vorhandene Maximum bleiben erhalten
- Worker- und WASM-Ressourcen beider Viewer werden über den gemeinsamen Releasepfad `/mlightcad-workers/0.3.0/` geladen; die nicht mehr verwendete Flyfish-WASM-Kopie wird nicht erneut ausgeliefert
- Ladeprofil, Layer-, Block-, Text- und Objektzustände werden innerhalb der Sitzung zwischen OpenLayers und MLightCAD geteilt; eine neue DWG setzt sie zurück
- CAD bleibt bei einem Geoportail-Ausfall auf schwarzem Hintergrund bedienbar

### Bekannte Grenzen

- Version 0.3.0 ist kein CAD-Editor und schreibt keine optimierte oder geänderte DWG; das Original bleibt unverändert im lokalen Browser-Arbeitsspeicher
- „Vollständig laden“ bleibt auch bei hoher Risikoeinstufung verfügbar, kann aber den von iOS Safari gesetzten Speicherrahmen überschreiten; ein harter Tab-Abbruch kann von JavaScript nicht zuverlässig abgefangen werden
- ein zuvor aus dem Modell gefilterter Layer oder verschachtelter Block erfordert zum Wiedereinblenden einen erneuten CAD-Aufbau aus der noch ausgewählten lokalen Datei
- XRefs, Bilder, OLE-/Proxy-Objekte, Papierbereiche und 3D-Inhalte bleiben außerhalb des abgenommenen Darstellungsumfangs

## [0.2.4] – 2026-08-26

### Behoben

- Netlify-TypeScript-Build für die `AC1015`-Testfixture repariert: Die DWG-Signatur wird nun in einem garantiert echten `ArrayBuffer` aufgebaut und nicht mehr über das allgemeinere `ArrayBufferLike` von `Uint8Array.buffer` übergeben

### Prüfung

- 19 Testdateien mit 78 Tests sowie den vollständigen TypeScript-/Vite-Produktionsbuild erfolgreich ausgeführt

## [0.2.3] – 2026-08-25

### Behoben

- fehlerhaft paarweise gepackte Windows-1252-Zeichen in `MULTILEADER`-Beschriftungen alter `AC1015`-DWGs vor der MLightCAD-Konvertierung normalisiert; bereits korrekte Texte bleiben unverändert
- MLightCAD-Textschalter auf vollständige `LEADER`-, `MLEADER`- und `MULTILEADER`-Entitäten erweitert, damit beim Ausblenden der Beschriftungen keine verwaisten Führungslinien oder Pfeile sichtbar bleiben

### Prüfung

- Regressionstests für die selektive Windows-1252-Rückgewinnung, unveränderte reguläre Unicode-Texte und die vollständige Sichtbarkeit der Führungslinien ergänzt
- lokale Referenzprüfung mit `2023- Bestandskanal_Junglinster.dwg`: 1.087 von 1.087 betroffenen `MULTILEADER`-Texten normalisiert, danach 0 verbleibende CJK-Ersatztexte

## [0.2.2] – 2026-08-25

### Behoben

- programmgesteuertes Scrollen des App-Containers beim Öffnen eines animierten Drawers verhindert; Drawer, Karte und Site-Banner bleiben dadurch an der Viewport-Unterkante ausgerichtet
- modale Drawer fest an den Viewport gebunden und oberhalb von OpenLayers, MLightCAD, Kartenaktionen, Kopf und Site-Banner abgesichert
- doppeltes Scrollen im Layer-Drawer entfernt, sodass dessen Kopf stehen bleibt und ausschließlich die Layerliste scrollt

### Geändert

- redundante Kreuz-Schaltflächen aus CAD-, Layer- und Objekt-Drawer entfernt; Griff, Außentipp und Escape bleiben als gemeinsame Schließwege erhalten
- Satelliten-Statuskarte wieder auf eine sichtbare Höhe von 26 Pixeln verdichtet, bei weiterhin vergrößerter unsichtbarer Tippfläche
- neutralen Kartenhintergrund von Grün auf Schwarz geändert

### Prüfung

- Browser-Regression prüft nach erneutem Öffnen `app.scrollTop = 0` sowie identische Unterkanten von Viewport, Karte, Overlay und Drawer
- Fokuswechsel verwendet `preventScroll`; Komponentenprüfungen verhindern erneut eingeführte Header-Kreuze

## [0.2.1] – 2026-08-25

### Behoben

- MLightCAD- und Geoportail-Kamera bei Pan, Zoom, Standortzentrierung, Einpassen und Größenänderung dauerhaft gekoppelt
- OpenLayers-Begrenzungen entfernt, die Hintergrundkarte bei tiefem Zoom oder Zeichnungen außerhalb des bisherigen LUREF-Ausschnitts festhielten
- OpenLayers-Karte im MLightCAD-Modus ohne geladene Zeichnung wieder direkt bedienbar gemacht
- WebGL-Hintergrund nach Dokument- und Layoutwechsel erneut transparent gesetzt; CAD-Deckkraft beeinflusst nur noch CAD-Pixel
- Textschalter auf gerenderte Textmerkmale erweitert, damit auch verschachtelte Block-, Attribut- und Bemaßungstexte erfasst werden
- fehlgeschlagene oder abgebrochene MLightCAD-Importe geben partielle Szenen, Worker und WebGL-Kontexte unmittelbar frei
- ein bewusst abgebrochener Import wird nicht mehr nachträglich als Verarbeitungsfehler gemeldet
- übergroßen Ladespinner durch den festen 18 × 18-Pixel-Spinner des Designsystems ersetzt
- pausierte Standortfolge bleibt auch nach weiteren GPS-Messungen pausiert
- Drawer-Backdrop schließt erst nach einem vollständigen Außentipp, damit der Tipp nicht auf darunterliegende Kartenaktionen durchfällt
- Standortzentrierung mit bereits vorhandenem GPS-Fix wird nach dem tatsächlichen `ready`-Übergang erneut angewendet

### Geändert

- hybride Navigation eingeführt: OpenLayers steuert ohne DWG, MLightCAD behält nach erfolgreichem Laden seine Desktop- und Touchsteuerung
- Touch-Zoom von MLightCAD auf Geräten mit grober Eingabe beruhigt; Maus- und Mausradverhalten bleiben unverändert
- Dateien über 10 MiB werden mit kleineren Render-Chunks und reduzierter WebGL-Pixelratio verarbeitet
- Satelliten-Card in beiden Viewern als gemeinsamer Ein-/Aus-Schalter der Hintergrundkarte umgesetzt
- GPS-Genauigkeit als permanente Karten-Card angezeigt und aus dem CAD-Drawer entfernt
- Kartenaktionen in eine obere Gruppe für Layer/Darstellung und eine untere Gruppe für Standort/Einpassen oberhalb des Site-Banners aufgeteilt
- MLightCAD-Nordpfeil entfernt; der drehbare OpenLayers-Viewer behält seinen Kompass
- gemeinsame Layer-, CAD- und Objekt-Drawer weiter verdichtet; Objektwahl öffnet den kompakten Objektzustand und Außentipp schließt den Drawer
- modale Drawer um Escape-Taste, Fokusbindung und Fokus-Rückgabe sowie mobile Touchziele von mindestens 44 Pixeln ergänzt
- Ladefortschritt unterscheidet Analyse, Aufbau und abschließende Geometriefinalisierung

### Abnahme

- `2023- Bestandskanal_Junglinster.dwg` mit 11,31 MiB, 66.816 Objekten und 316 Layern als reale Großdatei für Lade-, Abbruch- und Speicherprüfungen verwendet

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
