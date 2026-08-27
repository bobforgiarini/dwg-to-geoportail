# Test- und Abnahmeplan 0.5.0

## Grundsatz

Automatisierte Tests prüfen Datenstrukturen, Filterung, Zustandsautomaten und Lebenszyklus. Sie ersetzen weder den visuellen Vergleich mit einer bekannten LUREF-DWG noch einen echten Speichertest in iOS Safari. Private DWG-Dateien bleiben außerhalb des Repositorys und werden nicht an einen externen Dienst übertragen.

Die unten aufgeführten automatisierten und manuellen Prüfungen sind die Abnahmebasis für Version 0.5.0. Der vollständige Abschlusslauf umfasst 47 Vitest-Dateien mit 227 bestandenen Tests, einen fehlerfreien TypeScript-Projektbuild und einen erfolgreichen Vite-Produktionsbuild. Die reale Junglinster-Prüfung aus Version 0.4.1 bleibt mit ihren Messwerten als Performance-Referenz dokumentiert. Prüfungen mit privaten XRef-DWGs und auf echter iPhone-Hardware bleiben lokale Abnahmen.

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
- Schema-2-Berichte führen konkrete `DwgProfileEffect`-Einträge für feste, empfohlene und manuelle Ausschlüsse sowie `DwgProfileImpact` für vorher/empfohlen
- echte Objektzahlen und gewichtete Performancekosten werden getrennt berechnet und beschriftet; Kosten erscheinen niemals als „Renderobjekte“
- Schema-1-Fixtures bleiben während der Migration ohne die neuen optionalen Abschnitte lesbar

### Annotationsmaßstäbe und lokale XRefs

- valide `SCALE`-, `CONTEXTDATAMANAGER`- und `*OBJECTCONTEXTDATA`-Strukturen liefern gespeicherten und verfügbare Annotationsmaßstäbe
- der gespeicherte Maßstab wird standardmäßig gewählt; eine manuelle Auswahl bleibt bei Pan, Zoom und Viewerwechsel unverändert
- beschädigte, fehlende und mehrdeutige Kontextdaten arbeiten fail-open, entfernen keine Darstellung und erzeugen eine Warnung
- Text, Linie und Pfeil von Leader/MLeader teilen denselben Textsichtbarkeitszustand
- XRef-Basisnamen werden unabhängig von Pfadtrennzeichen, Erweiterung und Groß-/Kleinschreibung normalisiert
- eindeutige, fehlende, mehrdeutige, zyklische und ungültige lokale Referenzen liefern jeweils den erwarteten Status
- Attachments dürfen weitere lokale Referenzen laden; Overlays werden nicht rekursiv verfolgt
- zusammengeführte Tabellen und Blöcke erhalten getrennte `XRefName|…`-Namensräume; INSERT-Position, Rotation und Skalierung bleiben erhalten
- XRef-Dateien werden sequenziell im selben Worker verarbeitet und verlassen den Browser-Arbeitsspeicher nicht

### Luxemburg-Filter

- die generierte Grenze besitzt `EPSG:2169`, fünf Meter Vereinfachungstoleranz, 1.000 Meter Puffer und die dokumentierte ACT-Quellprüfsumme
- Objekte innerhalb, auf der Puffergrenze und mit schneidender Ausdehnung bleiben vollständig erhalten
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

- `CadLoadProfile` und Preflight-Bericht bleiben beim Viewerwechsel erhalten; eine neue DWG setzt beide zurück
- `/` löst MLightCAD als Standard-Viewer auf; `/openlayers` öffnet ausschließlich die OpenLayers-Legacy-Ansicht
- der Viewer-Umschalter schreibt die jeweils kanonische Route in die Browser-History und bewahrt dabei die lokale Dateisitzung
- die bisherige Route `/mlightcad` bleibt ein kompatibler MLightCAD-Einstieg; unbekannte SPA-Pfade fallen auf den Standard-Viewer zurück
- die Version im App-Kopf entspricht `package.json` und zeigt für diesen Release `0.5.0`

### Layer- und Block-Drawer

- Layer- und Block-Drawer verwenden denselben `BottomSheet` sowie dasselbe kompakte Layout, besitzen keinen Kreuz-Button und schließen über Außentipp beziehungsweise Escape
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
- die MLightCAD-OpenLayers-View unter `/` arbeitet wie in 0.2.4 direkt in `EPSG:2169`
- die Kamerabrücke übernimmt LUREF-Mittelpunkt und Meter-pro-Pixel-Auflösung unverändert
- mehrere MLightCAD-Kamerameldungen werden jeweils unmittelbar und synchron auf OpenLayers übertragen; kein CAD-Frame darf einer älteren Kartenkamera vorauslaufen
- die 0.2.4-Kamerabrücke bleibt auch unter Last unverändert: jede CAD-Meldung setzt Mittelpunkt und Auflösung und ruft `renderSync()` im selben Zyklus auf
- ausschließlich die Koordinatenanzeige arbeitet 100 ms nachlaufend; während einer Ereignisfolge wird kein Zwischenstand an React veröffentlicht und nach Ablauf erhält sie genau den letzten Mittelpunkt
- ein durch `renderSync()` programmgesteuert ausgelöstes OpenLayers-`moveend` ruft bei aktiver MLightCAD-Steuerung keinen Seiten-Callback auf; eine manuelle OpenLayers-Bewegung ohne aktive CAD-Steuerung bleibt meldewirksam
- wiederholte erfolgreiche Kachelabschlüsse im bereits erreichten Zustand `ready` benachrichtigen React nicht erneut
- GPS zentriert zuerst die CAD-Kamera, anschließend folgt OpenLayers ohne Animation
- beim Pan, Pinch, Mausrad, Einpassen und tiefen Zoom bleibt die Abweichung zwischen CAD und Orthofoto bei einer bekannten Referenz unter zwei CSS-Pixeln

### Adaptive MLightCAD-Canvas-Qualität

- `Auto` übernimmt die native Gerätedichte höchstens bis 2×; ein simuliertes iPhone mit DPR 3 darf daher keinen WebGL-Pixelratio 3 erhalten
- `Scharf` übernimmt die native Gerätedichte höchstens bis 2,5× und skaliert Geräte mit kleinerem nativen DPR nicht künstlich hoch
- `Speichersparend` liefert unabhängig von Gerät, Datei und Preflight immer 1×
- `Auto` liefert bei höchstens 2 GiB gemeldetem Gerätespeicher oder hoher Preflight-Risikostufe 1×
- `Auto` begrenzt eine erhöhte Preflight-Risikostufe auf höchstens 1,5× und eine unauffällige Zeichnung auf höchstens 2×
- solange der Preflight noch aussteht, erhält eine mobile Datei höchstens 1,5× und eine Datei über 10 MiB 1×; nach dem Bericht wird die Stufe erneut aus der gemessenen Risikoklasse bestimmt
- ein Qualitätswechsel setzt den Pixelratio des bestehenden MLightCAD-/Three.js-Renderers und markiert die Ansicht als darstellungsbedürftig, ohne CAD-Geometrie oder OpenLayers-Kamera neu aufzubauen
- der Schalter erscheint nur für MLightCAD im Drawer „DWG & Darstellung“, kennzeichnet den aktiven Modus mit `aria-pressed` und ist in DE, FR und EN vollständig beschriftet
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
- die Reihenfolge bleibt zwischen `/` und `/openlayers`, bei Sichtbarkeitswechsel und kontrolliertem CAD-Neuladen erhalten; eine neue Haupt-DWG setzt sie zurück
- OpenLayers ändert ausschließlich vorberechnete `Style.zIndex`-Werte und ruft je Aktion genau einmal `cadLayer.changed()` auf
- MLightCAD ersetzt bestehende Previews, erhält die Auswahlzuordnung und gibt Materialien sowie geklonte Geometrien bei Wechsel, Neuladen und Dispose frei
- Preview-Budgets 128/384 auf Mobilgeräten und 256/512 auf Desktop lassen die Szene bei Überschreitung unverändert und melden die Grenze lokalisiert
- während Pan und Zoom findet keine Zeichenreihenfolgearbeit statt

### i18n und Regression

- alle neuen Preflight-, Annotation-, XRef-, Luxemburg-, Darstellungs- und Zeichenreihenfolgetexte sind in Deutsch, Französisch und Englisch vorhanden
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

Das LibreDWG-WASM muss valide sein und 128 MiB Anfangsspeicher deklarieren. Browseranfragen beider Viewer müssen denselben Releasepfad verwenden und dürfen nicht auf unversionierte oder alte 0.2.x-URLs zurückfallen. Beide Routenmodule bleiben lazy geladen: `/` lädt den MLightCAD-/Three.js-Viewer, `/openlayers` die Legacy-Pipeline; die jeweils andere Viewer-Pipeline darf nicht unnötig vorab aktiviert werden.

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
5. Zeichnung in beiden Viewern gegen die CAD-Referenz vergleichen und INSERT-Position, Rotation, Skalierung und Layer-/Blocknamen prüfen.
6. Jeden erkannten Annotationsmaßstab fest auswählen. Annotative Texte, Bemaßungen, Attribute, Leader, MLeader und INSERTs dürfen bei Pan oder Zoom nicht die Variante wechseln.
7. Eine beschädigte Kontextfixture muss fail-open bleiben und eine Warnung zeigen, statt Geometrie still zu löschen.

### Räumlicher Filter und Darstellung

1. Luxemburg-Filter bei einer neuen Haupt-DWG als aktiviert prüfen und die dokumentierte Toleranz von 1.000 Metern anzeigen lassen.
2. Referenzobjekte innerhalb, außerhalb, berührend, schneidend und mit unbekannter Ausdehnung prüfen; nur der sicher vollständig äußere Fall darf verschwinden.
3. Den Filter deaktivieren und kontrolliert neu laden; Kamera, GPS, Opazität und Drawerzustand müssen erhalten bleiben.
4. `Original` und `Karte` vergleichen. Im Kartenprofil Füllungsdeckkraft von 0 bis 100 Prozent bewegen: Orthofoto, Linien und Texte dürfen sich nicht verdunkeln.
5. Ein Objekt ganz nach vorne und danach ganz nach hinten setzen; dieselbe Gruppe muss in beiden Viewern und nach einem CAD-Neuladen am gewählten Extrem bleiben.
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
- zwischen `/` und `/openlayers` wechseln und prüfen, dass dasselbe Profil erneut angewendet wird
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
- Layer- und Block-Drawer nebeneinander vergleichen: Suchfeld, Zähler, Aktionsleiste, Zeilenabstände, Icons, Belastungs-Badges und Touchziele müssen übereinstimmen
- Layersuche, Objektzahlen und Belastungs-Badges mit einer Zeichnung mit vielen Layern prüfen; einen vorab gefilterten Layer auswählen und Neuladehinweis sowie „Änderungen anwenden“ kontrollieren
- beim Schließen der Layer- und Block-Drawer kontrollieren, dass die 300-ms-Animation vollständig bleibt und die langen Listen danach aus dem DOM entfernt sind
- prüfen, dass alle Drawer oberhalb von OpenLayers, WebGL, Kartenbuttons und Site-Banner liegen
- im MLightCAD-Drawer nacheinander `Auto`, `Scharf` und `Speichersparend` wählen; CAD-Linienschärfe, Bedienbarkeit und unveränderte Kartenlage bei jedem Wechsel vergleichen
- auf einem iPhone mit DPR 3 kontrollieren, dass der CAD-Canvas in `Auto` höchstens 2×, in `Scharf` höchstens 2,5× und in `Speichersparend` genau 1× verwendet; die mobile OpenLayers-Basiskarte muss in allen drei Fällen bei DPR 1 bleiben
- eine Zeichnung mit hoher Preflight-Risikostufe in `Auto` laden und den Rückgang auf 1× sowie die gegenüber `Scharf` geringere WebGL-Speicherbelegung beobachten
- Pan, Pinch, Mausrad, GPS, Einpassen und tiefen Zoom in beiden Viewern testen
- während eines MLightCAD-Pans prüfen, dass CAD und Orthofoto in jedem Schritt synchron bleiben, die Koordinatenanzeige aber erst 100 ms nach der letzten Kamerameldung den Endstand übernimmt
- fünf Imports und fünf Viewerwechsel mit Browser-Speicherwerkzeugen beobachten; Worker, Canvas und WebGL-Kontexte müssen nach Dispose auf den Sollzustand zurückfallen
- Standortberechtigung erlaubt und abgelehnt sowie pausierte Folge und Wiederaufnahme prüfen

## Nicht Teil der Abnahme

- Bearbeiten oder Neuschreiben einer DWG
- Erzeugen einer optimierten DWG zum Download
- Upload, Netlify Function, Datenbank oder persistente Dateispeicherung
- vollständige Darstellungsgarantie für nicht lokal aufgelöste XRefs, Papierlayouts, proprietäre Custom Entities oder 3D-Inhalte
- vollständige XCLIP-, Proxy-/Custom-Entity- oder AutoCAD-XRef-Parität
- vollständige Schrifterkennung über die vom Renderer gemeldeten `missedFonts` hinaus

Nach einem späteren GitHub-Push übernimmt das vorhandene Git-basierte Netlify-Projekt Build und Bereitstellung von Version 0.5.0. Push und Deploy gehören nicht zu diesem Implementierungsschritt; die dortigen Ergebnisse und die manuelle Routenabnahme sind bis dahin ausstehend.
