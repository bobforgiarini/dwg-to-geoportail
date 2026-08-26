# Test- und Abnahmeplan 0.3.1

## Grundsatz

Automatisierte Tests prüfen Datenstrukturen, Filterung, Zustandsautomaten und Lebenszyklus. Sie ersetzen weder den visuellen Vergleich mit einer bekannten LUREF-DWG noch einen echten Speichertest in iOS Safari. Private DWG-Dateien bleiben außerhalb des Repositorys und werden nicht an einen externen Dienst übertragen.

Finaler lokaler Stand vom 26. August 2026: **31 Testdateien mit 146 Tests bestanden**, TypeScript- und Vite-Produktionsbuild bestanden. Die weiterhin ausstehenden Prüfungen auf echter iPhone-Hardware sind unten ausdrücklich als manuelle Abnahme markiert.

## Automatisierte Prüfung

```sh
npm test
npm run build
```

### Preflight und Risikobewertung

- kleine beziehungsweise wenig komplexe Dateien laufen ohne Vorbereitungssheet automatisch vollständig weiter
- die Dateigröße allein setzt `shouldPrepare` niemals und entfernt die Aktion „Vollständig laden“ nicht
- erhöhte Renderkosten, Entitätszahl, Blockexpansion, Text-/Hatch-/Polyline-Dichte und begrenztes Gerätebudget liefern nachvollziehbare Risikogründe
- fehlendes `navigator.deviceMemory` auf einem erkannten Mobilgerät verwendet das konservative Safari-Budget, blockiert aber nicht
- DWG-Version, Dateimetadaten, Layer, direkte und rekursive Instanzen, Objektarten, Blocktiefe und Warnungen werden stabil in `DwgPreflightReport` abgebildet
- das empfohlene Profil entfernt zunächst nur ausgeschaltete, eingefrorene und No-Plot-Layer sowie Papierbereich, nicht aufgelöste XRefs, Bilder, OLE-/Proxy- und 3D-Inhalte
- benannte fachliche Blöcke, Texte und Hatches bleiben im automatisch empfohlenen Profil erhalten

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

### Sitzung, Block-Drawer und Bedienung

- `CadLoadProfile` und Preflight-Bericht bleiben beim Viewerwechsel erhalten; eine neue DWG setzt beide zurück
- Suche, sichtbare/ausgeblendete Zähler, „Alle anzeigen“ und „Alle ausblenden“ im Block-Drawer funktionieren
- benannte Blöcke, Systemblöcke und XRefs erscheinen in der korrekten Gruppe; Systemblöcke sind einklappbar
- Block- und Layer-Drawer verwenden denselben `BottomSheet`, besitzen keinen Kreuz-Button und schließen über Außentipp beziehungsweise Escape
- direkt erreichbare Modellbereichsblöcke schalten ohne vollständigen Neuimport
- verschachtelte oder vorher weggefilterte Blöcke verlangen „Änderungen anwenden“ und lösen genau einen kontrollierten CAD-Neuaufbau aus
- Kartenmittelpunkt, Zoom, GPS-Zustand, Deckkraft und Drawerzustand bleiben bei diesem Neuaufbau erhalten
- der Objekt-Drawer zeigt den rekursiven Blockpfad und bietet Objekt-, Layer- und Block-Ausblendung

### Recovery und Lebenszyklus

- der Recovery-Marker enthält nur Dateiname, Dateigröße und Startzeit, niemals Dateibytes oder Geometrien
- Erfolg und geordneter Abbruch löschen den Marker
- ein zurückgebliebener Marker wird einmalig konsumiert und löst die vorbereitete Empfehlung aus
- deaktiviertes beziehungsweise fehlschlagendes Browser-Storage verhindert einen Import nicht
- Abbruch während der Workerphase beendet den Vorgang innerhalb von 500 ms und erzeugt kein verspätetes `ready`
- fünf aufeinanderfolgende Importe beziehungsweise Viewerwechsel hinterlassen keinen zusätzlichen Worker, Canvas oder WebGL-Kontext
- ein Viewerwechsel beginnt erst nach dem vollständigen Dispose des vorherigen CAD-Dokuments
- der Worker sendet den kompakten Bericht vor dem großen Modell, wartet auf die Entscheidung und überträgt erst anschließend die gefilterte Datenbank
- der versionierte LibreDWG-API-Bundle verweist auf die tatsächlich mit ausgelieferte Emscripten-Laufzeit; ein fehlendes Nebenasset wird im Test erkannt
- der Parser-Timeout läuft nur während aktiver Workerarbeit, pausiert während der Nutzerentscheidung, wird danach neu gestartet und ignoriert verspätete Workerantworten

### LibreDWG-WASM

- `patchLibreDwgInitialMemory` akzeptiert ausschließlich ein gültiges wasm32-Modul mit Memory-Section
- der gepatchte Minimalwert beträgt 2.048 WASM-Seiten beziehungsweise 128 MiB
- ein vorhandener Maximalwert und die Growth-Flags bleiben unverändert
- `WebAssembly.validate` akzeptiert das erzeugte Modul
- der Produktionsbuild enthält genau die gemeinsam verwendete gepatchte Datei unter `dist/mlightcad-workers/0.3.0/libredwg-web.wasm`; die ungenutzte Flyfish-WASM-Kopie wird nicht ausgeliefert

### Geoportail-Zustandsautomat

- ein einzelner WMTS-Kachelfehler wechselt die Quelle nicht
- drei aufeinanderfolgende WMTS-Fehler lösen genau einen Retry aus
- acht Sekunden WMTS-Stillstand wechseln zu WMS `ortho_latest`
- zehn Sekunden erfolgloses WMS setzen `unavailable`
- Online-/Offline-Wechsel ergeben `offline` und einen sauberen WMTS-Neustart
- Ereignisse einer alten Quellgeneration werden ignoriert
- zwei erfolgreiche WMTS-Proben während funktionierendem WMS wechseln zurück; ein Fehlschlag setzt die Erfolgsserie zurück
- beide Viewer lesen denselben Basemap-Zustand und bleiben bei Totalausfall auf schwarzem Hintergrund bedienbar
- URL, Matrix-Set, Layernamen, WMS-Parameter und Attribution entsprechen dem offiziellen Open-Data-Dienst

### Projektion und Kamerabrücke

- bekannte LUREF-Punkte werden korrekt zwischen `EPSG:2169` und `EPSG:3857` transformiert
- die MLightCAD-Kamerabrücke transformiert Mittelpunkt und lokale Meter-pro-Pixel-Probe ohne affine Näherung
- mehrere MLightCAD-Kamerameldungen innerhalb eines Bildschirmframes ergeben genau eine OpenLayers-Aktualisierung mit dem neuesten Stand und keine synchrone Kartendarstellung
- wiederholte erfolgreiche Kachelabschlüsse im bereits erreichten Zustand `ready` benachrichtigen React nicht erneut
- GPS zentriert zuerst die CAD-Kamera, anschließend folgt OpenLayers ohne Animation
- beim Pan, Pinch, Mausrad, Einpassen und tiefen Zoom bleibt die Abweichung zwischen CAD und Orthofoto bei einer bekannten Referenz unter zwei CSS-Pixeln

### i18n und Regression

- alle neuen Preflight-, Block-, Recovery- und Basemap-Texte sind in Deutsch, Französisch und Englisch vorhanden
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

Das LibreDWG-WASM muss valide sein und 128 MiB Anfangsspeicher deklarieren. Browseranfragen beider Viewer müssen denselben Releasepfad verwenden und dürfen nicht auf unversionierte oder alte 0.2.x-URLs zurückfallen. Die MLightCAD-Route bleibt lazy geladen; ein Aufruf von `/` darf den großen MLightCAD-/Three.js-Chunk nicht vorab aktivieren.

## Manuelle mobile Abnahme

### Adaptive Vorbereitung

1. Eine kleine DWG laden: Sie soll ohne unnötigen Dialog vollständig öffnen.
2. Eine große, aber strukturell einfache DWG laden: Sie darf nicht allein wegen ihrer Dateigröße blockiert werden.
3. Eine tatsächlich komplexe DWG laden: Vor Feature-/Szenenaufbau muss „DWG vorbereiten“ erscheinen.
4. „Vollständig laden“ wählen: Die Aktion bleibt auf Desktop und Mobilgerät vorhanden und startet den ungefilterten Versuch.
5. „Empfohlen laden“ wählen: Die Wirkungsschätzung muss sich plausibel verringern, fachliche benannte Blöcke, Texte und Hatches bleiben erhalten.
6. „Auswahl anpassen“ öffnen: Layer- und Blockauswahl ändern, anwenden und das Ergebnis gegen eine CAD-Referenz vergleichen.
7. Während des Imports abbrechen: Oberfläche und Karte müssen unmittelbar wieder bedienbar sein.

### Lokale Junglinster-Referenz

Die bekannte lokale Junglinster-DWG bleibt außerhalb von Git. Sie ist größer als 10 MiB und dient als Stabilitätsfall, nicht als öffentliches Testasset:

Lokal abgeschlossen wurde ein Durchlauf mit der 11,31-MB-Datei und 66.816 erkannten Objekten: Der neue Worker lud sie auf dem Desktop sowohl in `/mlightcad` als auch in `/`; es gab keine 10-MiB-Sperre. Dabei wurde zusätzlich die vollständige versionierte Worker-Abhängigkeitskette im Produktions-Preview geprüft. Ein auf 390 × 844 Pixel gesetzter Desktop-Browser ist dabei nur eine responsive UI-Prüfung und kein Ersatz für iOS Safari.

- auf einem leistungsfähigen Desktop vollständig laden
- auf einem echten iPhone zuerst das empfohlene Profil prüfen
- bestätigen, dass kein 10-MiB-Limit erscheint und „Vollständig laden“ angeboten bleibt
- Layer-, Block-, Text- und HATCH-Darstellung gegen die CAD-Referenz vergleichen
- einen direkten Block sofort ausblenden
- einen verschachtelten Block über „Änderungen anwenden“ entfernen und ausschließlich diesen Strukturzweig kontrollieren
- zwischen `/` und `/mlightcad` wechseln und prüfen, dass dasselbe Profil erneut angewendet wird
- Netzwerkprotokoll kontrollieren: DWG-Bytes verlassen das Gerät nicht

Ein erfolgreicher Lauf auf einem einzelnen Desktop belegt keine iPhone-Kompatibilität. Die oben genannten iPhone-Schritte sind noch offen. iOS Safari kann den gesamten Tab bei Speicherdruck beenden; dieses Verhalten muss auf realer Hardware geprüft und als verbleibendes Risiko dokumentiert werden.

### Geoportail und Offlinebetrieb

- WMTS absichtlich blockieren und Retry sowie automatischen WMS-Fallback beobachten
- WMS ebenfalls blockieren und sicherstellen, dass CAD auf schwarzem Hintergrund bedienbar bleibt
- bei aktivem WMS die WMTS-Erholung abwarten; erst nach zwei erfolgreichen Proben darf die App zurückwechseln
- Browser offline/online schalten und Status, Layer, CAD, GPS und Kamera prüfen
- Satellitenkarte bewusst aus- und einschalten; der Zustand muss einen Viewerwechsel überstehen

### UI, Kamera und Speicher

- DE/FR/EN auf schmalem iPhone- und Android-Viewport prüfen
- Block-, Layer-, CAD- und Objekt-Drawer wiederholt öffnen, außen schließen und lange Listen scrollen; kein Drawer darf die App verschieben
- prüfen, dass alle Drawer oberhalb von OpenLayers, WebGL, Kartenbuttons und Site-Banner liegen
- Pan, Pinch, Mausrad, GPS, Einpassen und tiefen Zoom in beiden Viewern testen
- fünf Imports und fünf Viewerwechsel mit Browser-Speicherwerkzeugen beobachten; Worker, Canvas und WebGL-Kontexte müssen nach Dispose auf den Sollzustand zurückfallen
- Standortberechtigung erlaubt und abgelehnt sowie pausierte Folge und Wiederaufnahme prüfen

## Nicht Teil der Abnahme

- Bearbeiten oder Neuschreiben einer DWG
- Erzeugen einer optimierten DWG zum Download
- Upload, Netlify Function, Datenbank oder persistente Dateispeicherung
- positive Darstellungsgarantie für XRefs, Papierlayouts, proprietäre Custom Entities oder 3D-Inhalte

Es erfolgt für 0.3.0 kein manueller Netlify-Deploy. Nach einem späteren GitHub-Push übernimmt ausschließlich der vorhandene Git-basierte Netlify-Build die Bereitstellung.
