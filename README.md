# DWG to Geoportail

Mobile-first Webanwendung zum lokalen Anzeigen einer 2D-DWG mit absoluten LUREF-Koordinaten (`EPSG:2169`) über dem Geoportail-Orthofoto. Seit Version 0.4.0 ist der direkt gekoppelte MLightCAD-/Three.js-Viewer die Standardansicht. Keine Datei wird allein aufgrund ihrer Größe blockiert.

## Viewer und Routen

| Route | Viewer | Zweck |
| --- | --- | --- |
| `/` | MLightCAD / Three.js | Standardansicht mit direkter WebGL-Darstellung |
| `/openlayers` | OpenLayers / `@flyfish-dev/cad-viewer` | Legacy-Ansicht mit normalisierter 2D-Darstellung |

Der Umschalter im Kopfbereich verwendet die Browser-History. Die lokal ausgewählte `File`-Referenz und ihr Ladeprofil bleiben beim Wechsel zwischen beiden Routen in einer gemeinsamen React-Sitzung erhalten; der Ziel-Viewer verarbeitet die Datei kontrolliert neu. Die Datei geht bei einem Neuladen oder Schließen der Seite verloren. Beide Viewer werden als eigene Routenmodule erst für die jeweils aktive Ansicht geladen. Die frühere Route `/mlightcad` bleibt als kompatibler Einstieg in die MLightCAD-Ansicht erhalten; neue Links sollen `/` verwenden.

## Funktionen

- Geoportail `ortho_2025` per WMTS mit Retry, Stillstanderkennung und `ortho_latest` per WMS als automatischem Fallback
- gemeinsamer Basemap-Status für beide Viewer; bei Totalausfall bleibt CAD auf schwarzem Hintergrund bedienbar
- browserlokaler, abbrechbarer DWG-Import in Web Workern mit auf 128 MiB reduziertem LibreDWG-WASM-Anfangsspeicher und kontrolliertem Wachstum
- adaptiver Preflight nach tatsächlicher Zeichnungskomplexität; Dateigröße ist nur ein Faktor und niemals ein hartes Importlimit
- echter Worker-Handshake für beide Viewer: zuerst nur kompakter Bericht, danach Nutzerentscheidung und Filterung, erst anschließend Structured Clone der reduzierten Datenbank
- Vorbereitungssheet für risikoreiche Zeichnungen mit vollständigem, empfohlenem oder benutzerdefiniertem Ladeprofil
- speicherwirksame Filterung vor Feature- beziehungsweise Szenenaufbau für abgewählte Layer, Blöcke und nicht unterstützte Objektgruppen
- kleiner Recovery-Marker ohne DWG-Inhalt, der nach einem wahrscheinlich abgebrochenen Browser-Tab beim nächsten Besuch den Vorbereitungsmodus empfiehlt
- zwei unabhängig implementierte 2D-Viewer für den Vergleich realer Zeichnungen; MLightCAD ist der Standard, OpenLayers bleibt als Legacy-Ansicht erhalten
- OpenLayers-Legacy-Pipeline für Linien, Polylinien, Bögen, Kreise, Ellipsen, Splines, Punkte, Texte, Schraffuren und rekursive Blöcke
- automatische LUREF-Ausreißerfilterung im OpenLayers-Legacy-Viewer
- MLightCAD als transparenter WebGL-Layer über einer in `EPSG:2169` betriebenen OpenLayers-Basiskarte; Mittelpunkt und lokale Auflösung werden ohne asynchrone Zwischenkopplung direkt aus der CAD-Kamera übernommen
- hybride Kartensteuerung: Ohne fertig geladene DWG bedient OpenLayers Pan und Zoom; nach `ready` übernimmt MLightCAD die CAD- und Kartenbewegung
- Synchronisierung von CAD-Mittelpunkt und Metern pro Bildschirmpixel mit der Geoportail-Kamera, einschließlich expliziter Übergabe nach Standortzentrierung und „Zeichnung einpassen“
- MLightCAD-Bewegung ausdrücklich im `PAN`-Modus; Desktopsteuerung bleibt erhalten, der mobile Pinch-Zoom ist weniger empfindlich und kurze Taps wählen weiterhin über den mobilen Auswahl-Fallback aus
- eingebettete MLightCAD-Kommandozeile ausgeblendet, damit sie keine Karten- oder Touchbedienung abfängt
- CAD-Deckkraft in beiden Viewern von 0 bis 100 Prozent mit den Vorgaben Karte, Mix und CAD; im MLightCAD-Viewer betrifft sie ausschließlich die CAD-Zeichenfläche, deren unbelegte Pixel transparent bleiben
- adaptive MLightCAD-Canvas-Qualität im Drawer „DWG & Darstellung“: `Auto` nutzt bis zu 2× und reduziert bei knapper Speicherlage oder höherem Preflight-Risiko, `Scharf` nutzt die native Pixeldichte bis höchstens 2,5×, `Speichersparend` rendert fest mit 1×
- die Qualitätswahl betrifft ausschließlich den transparenten CAD-WebGL-Canvas; die OpenLayers-Basiskarte verwendet weiterhin ihre eigene mobile Speicherregel mit DPR 1 und wird nicht zusammen mit dem CAD hochskaliert
- keine pauschale volle iPhone-Pixeldichte: Ein Gerät mit DPR 3 bleibt in `Auto` bei höchstens 2× und selbst in `Scharf` bei höchstens 2,5×
- DWG-Layer einzeln oder gemeinsam schalten und als gemeinsames Ladeprofil zwischen beiden Viewern übernehmen
- Layer-Drawer im selben kompakten Layout wie der Block-Drawer: Suche nach Name oder Kennung, sichtbare und ausgeblendete Zähler, Objektzahl und geschätzte Belastung je Layer
- Neuladehinweis für Layer, die aus dem geladenen Modell gefiltert wurden; strukturelle Änderungen werden gesammelt über „Änderungen anwenden“ kontrolliert neu aufgebaut
- eigener Block-Drawer mit Suche, Zählern, benannten Blöcken, gruppierten Systemblöcken, XRefs und Belastungsschätzung
- direkte Modellbereichsblöcke unmittelbar schalten; verschachtelte oder bereits weggefilterte Strukturen über „Änderungen anwenden“ kontrolliert neu laden
- CAD-Objekte auswählen, rekursiven Blockpfad prüfen, Objekt, Layer oder Block ausblenden und verborgene Objekte wiederherstellen
- selektive MLightCAD-Kompatibilitätskorrektur für als Zeichenpaare gepackte Windows-1252-`MULTILEADER`-Beschriftungen alter `AC1015`-Dateien; bereits korrekte Texte werden nicht verändert
- globaler Textschalter für direkte und verschachtelte Texte; im MLightCAD-Viewer werden `LEADER`, `MLEADER` und `MULTILEADER` einschließlich Führungslinien und Pfeilen als vollständige Anmerkung geschaltet
- dieselben viewportfesten modalen „DWG & Darstellung“-, Objekt- und Layer-Drawer in beiden Viewern; Griff, Tipp außerhalb und Escape schließen den offenen Drawer ohne die Karte zu verschieben
- dieselben gruppierten Kartenaktionen in beiden Viewern: Layer und CAD oben sowie Standort und Zeichnung einpassen unten über dem Site-Banner
- kompakter Objekt-Drawer; Deckkraft, Textschalter und Verborgen-Zähler liegen in beiden Viewern im gemeinsamen CAD-Drawer
- gemeinsamer kompakter DWG-Ladespinner mit 18 Pixel Durchmesser
- Live-Standort mit Genauigkeitskreis und pausierbarer Kartenfolge
- kompakte klickbare Satelliten-Statuskarte zum Ein- und Ausblenden der gemeinsamen Basiskarte sowie eigene GPS-Genauigkeitskarte
- schwarzer neutraler Kartenhintergrund, wenn keine Geoportail-Kachel sichtbar ist
- drehbare Karte mit Nordausrichtung im bestehenden Viewer; im nordfixierten MLightCAD-Viewer ist kein redundanter Nordpfeil sichtbar
- mobile Oberfläche in Deutsch, Französisch und Englisch; offene MLightCAD-Hinweise wechseln ihre Sprache live mit
- kompakter `ML`-/`OL`-Viewerwechsel neben der Sprachauswahl und aus den Paketmetadaten gelesene Version im App-Kopf
- `site-info-banner` unten rechts mit „Powered by bf.lu“ und „© Map: geoportail.lu“
- keine DWG-Übertragung, keine Dokumentdatenbank und keine persistente Speicherung der Zeichnung

## Lokal starten

Voraussetzung: Node.js 20.19 oder neuer.

```sh
npm install
npm run dev
```

Danach die von Vite angezeigte lokale Adresse öffnen. Für Standorttests auf einem Mobilgerät wird ein sicherer HTTPS-Kontext benötigt.

## Qualitätssicherung

```sh
npm test
npm run build
npm run preview
```

Der Build erzeugt die gemeinsame versionierte Laufzeit unter `dist/mlightcad-workers/0.3.0/`. Das ausgelieferte LibreDWG-WASM wird reproduzierbar auf 128 MiB Anfangsspeicher gepatcht und validiert; API, Emscripten-Laufzeit und WASM des gemeinsamen Workers werden als geprüfte relative Assetkette ausgeliefert. Der Versionspfad verhindert, dass ein langfristig gecachtes 0.2.x-WASM weiterverwendet wird. Die frühere, seit dem gemeinsamen Worker ungenutzte Flyfish-WASM-Kopie wird nicht mehr mit ausgeliefert. Eine reale DWG-Fixture ist nicht im Repository enthalten; die lokale Abnahme ist in [docs/testing.md](docs/testing.md) protokolliert.

## Grenzen von Version 0.4.0

- Beide Viewer erwarten 2D-Modellbereichsdaten in absoluten LUREF-Meterkoordinaten; es gibt keine automatische Georeferenzierung.
- XRefs, proprietäre benutzerdefinierte CAD-Objekte und 3D-Darstellung gehören nicht zum abgenommenen Funktionsumfang.
- MLightCAD kann Schraffuren abweichend darstellen; der Upstream-Fehler wird in [mlightcad/cad-viewer #230](https://github.com/mlightcad/cad-viewer/issues/230) verfolgt.
- Der MLightCAD-Textschalter erfasst `TEXT`, `MTEXT`, `ATTRIB` und `ATTDEF` einschließlich gerenderter Texte in verschachtelten Blöcken sowie vollständige `LEADER`-, `MLEADER`- und `MULTILEADER`-Entitäten. Proprietäre oder vom Parser ausgelassene Textobjekte können weiterhin fehlen.
- Es gibt kein 10-MiB-Limit. „Vollständig laden“ bleibt immer verfügbar; eine sehr komplexe DWG kann den Speicherrahmen eines Mobilbrowsers dennoch überschreiten.
- iOS Safari kann einen speicherintensiven Tab beenden, bevor JavaScript den Fehler melden oder den Worker geordnet abbrechen kann. Der Recovery-Marker enthält deshalb nur Dateiname, Größe und Startzeit; die DWG muss danach erneut ausgewählt werden.
- `Scharf` erhöht die WebGL-Framebufferlast gegenüber `Auto` bewusst und kann auf speicherknappen Geräten weniger stabil sein; `Auto` bleibt die empfohlene Vorgabe und `Speichersparend` der robuste 1×-Modus.
- Die App ist kein CAD-Editor: Sie verändert oder schreibt keine DWG und erzeugt keinen optimierten DWG-Download.
- Ein aus dem Preflight-Modell entfernter verschachtelter Block oder Layer muss aus der weiterhin lokal ausgewählten Originaldatei neu aufgebaut werden, bevor er wieder sichtbar ist.
- MLightCAD lädt unterstützende CAD-/Schriftressourcen zur Laufzeit von der konfigurierten jsDelivr-Quelle; die DWG selbst wird nicht dorthin gesendet.

Weitere Informationen: [Architektur](docs/architecture.md), [Netlify](docs/netlify.md), [Tests](docs/testing.md) und [Release 0.4.0](docs/releases/0.4.0.md).

## Lizenz und Quellcode

Die Anwendung ist unter `AGPL-3.0-only` lizenziert. MLightCAD-Kernpakete stehen unter MIT; der verwendete LibreDWG-Konverter steht unter `GPL-3.0`. Bei öffentlichem Betrieb muss der vollständige, zur bereitgestellten Version passende Quellcode für alle Nutzer zugänglich bleiben. Details stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
