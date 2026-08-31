# DWG to Geoportail

Mobile-first Webanwendung zum lokalen Anzeigen einer 2D-DWG mit absoluten LUREF-Koordinaten (`EPSG:2169`) über dem Geoportail-Orthofoto. Version 0.7.0 verwendet ausschließlich den direkt gekoppelten MLightCAD-/Three.js-CAD-Viewer, trennt Settings und DWG-Verwaltung, ergänzt lokalen Desktop-Drag-and-drop sowie Positionsaktionen per Rechtsklick oder mobilem Langdruck. OpenLayers bleibt als Kartenbasis erhalten. Der bewährte synchrone Kamera-Hotpath bleibt unverändert; keine Datei wird allein aufgrund ihrer Größe blockiert.

## Viewer und Route

| Route | Viewer | Zweck |
| --- | --- | --- |
| `/` | MLightCAD / Three.js | Standardansicht mit direkter WebGL-Darstellung |
| `/openlayers` | permanente Weiterleitung | Kompatibilitätsredirect auf `/` |

MLightCAD ist der einzige CAD-Renderer. OpenLayers bleibt als interne Kartenbasis für Geoportail, Kataster, GPS, Messgeometrie und die synchrone Kamera-Kopplung erhalten. Die lokal ausgewählte `File`-Referenz und ihr Ladeprofil existieren nur in der aktuellen React-Sitzung; die Datei geht bei einem Neuladen oder Schließen der Seite verloren.

## Funktionen

- Geoportail `ortho_2025` per WMTS mit Retry, Stillstanderkennung und `ortho_latest` per WMS als automatischem Fallback
- gemeinsamer Basemap-Status für die OpenLayers-Karte und den MLightCAD-CAD-Layer; bei Totalausfall bleibt CAD auf schwarzem Hintergrund bedienbar
- browserlokaler, abbrechbarer DWG-Import in Web Workern mit auf 128 MiB reduziertem LibreDWG-WASM-Anfangsspeicher und kontrolliertem Wachstum
- adaptiver Preflight nach tatsächlicher Zeichnungskomplexität; Dateigröße ist nur ein Faktor und niemals ein hartes Importlimit
- echter Worker-Handshake: zuerst nur kompakter Bericht, danach Nutzerentscheidung und Filterung, erst anschließend Structured Clone der reduzierten Datenbank
- Vorbereitungssheet für risikoreiche Zeichnungen mit vollständigem, empfohlenem oder benutzerdefiniertem Ladeprofil
- Vorbereitungsschema 2 mit getrennten echten Objektzahlen und gewichteten Performancekostenschätzungen sowie konkreten Auswirkungen je Layer, Block, Objektart, XRef und räumlichem Filter
- Erkennung gespeicherter und weiterer gültiger Annotationsmaßstäbe; die feste Auswahl gilt für Hauptzeichnung und lokale XRefs und ändert sich nicht durch Pan oder Zoom
- lokale XRef-Mehrfachauswahl mit basisnamengestützter Zuordnung, sichtbaren Statusmeldungen sowie zyklusgeschützter, sequenzieller Verarbeitung im selben Worker; Attachments dürfen weiter auflösen, Overlays nicht
- standardmäßig aktiver Filter „Luxemburg + 1 km Außenpuffer“ auf Basis eines lokal ausgelieferten ACT-Grenzpolygons in `EPSG:2169`; Luxemburg und Objekte bis einschließlich 1.000 Meter außerhalb der Landesgrenze bleiben erhalten, nur vollständig weiter außen liegende Objekte werden entfernt
- speicherwirksame Filterung vor Feature- beziehungsweise Szenenaufbau für abgewählte Layer, Blöcke und nicht unterstützte Objektgruppen
- kleiner Recovery-Marker ohne DWG-Inhalt, der nach einem wahrscheinlich abgebrochenen Browser-Tab beim nächsten Besuch den Vorbereitungsmodus empfiehlt
- MLightCAD als transparenter WebGL-Layer über einer in `EPSG:2169` betriebenen OpenLayers-Basiskarte; Mittelpunkt und lokale Auflösung werden ohne asynchrone Zwischenkopplung direkt aus der CAD-Kamera übernommen
- hybride Kartensteuerung: Ohne fertig geladene DWG bedient OpenLayers Pan und Zoom; nach `ready` übernimmt MLightCAD die CAD- und Kartenbewegung
- Synchronisierung von CAD-Mittelpunkt und Metern pro Bildschirmpixel mit der Geoportail-Kamera, einschließlich expliziter Übergabe nach Standortzentrierung und „Zeichnung einpassen“
- die direkte Kamera-Bridge aus Version 0.2.4 bleibt unverändert synchron: CAD-Mittelpunkt, Auflösung und `renderSync()` erreichen OpenLayers in jeder Kamerameldung; ausschließlich die Koordinatenanzeige wird mit 100 ms nachlaufend aktualisiert
- programmgesteuerte OpenLayers-`moveend`-Ereignisse aus dieser CAD-Kopplung lösen keinen zusätzlichen React-Seitenrender aus; ohne aktive MLightCAD-Steuerung werden manuelle Kartenbewegungen weiterhin gemeldet
- MLightCAD-Bewegung ausdrücklich im `PAN`-Modus; Desktopsteuerung bleibt erhalten, der mobile Pinch-Zoom ist weniger empfindlich und kurze Taps wählen weiterhin über den mobilen Auswahl-Fallback aus
- eingebettete MLightCAD-Kommandozeile ausgeblendet, damit sie keine Karten- oder Touchbedienung abfängt
- CAD-Deckkraft von 0 bis 100 Prozent mit den Vorgaben Karte, Mix und CAD; sie betrifft ausschließlich die MLightCAD-Zeichenfläche, deren unbelegte Pixel transparent bleiben
- adaptive MLightCAD-Canvas-Qualität im Settings-Drawer: `Auto` nutzt bis zu 2× und reduziert bei knapper Speicherlage oder höherem Preflight-Risiko, `Scharf` nutzt die native Pixeldichte bis höchstens 2,5×, `Speichersparend` rendert fest mit 1×
- die Qualitätswahl betrifft ausschließlich den transparenten CAD-WebGL-Canvas; die OpenLayers-Basiskarte verwendet weiterhin ihre eigene mobile Speicherregel mit DPR 1 und wird nicht zusammen mit dem CAD hochskaliert
- keine pauschale volle iPhone-Pixeldichte: Ein Gerät mit DPR 3 bleibt in `Auto` bei höchstens 2× und selbst in `Scharf` bei höchstens 2,5×
- DWG-Layer einzeln oder gemeinsam schalten und im sitzungsweiten Ladeprofil erhalten
- Layer-Drawer im selben kompakten Layout wie der Block-Drawer: Suche nach Name oder Kennung, sichtbare und ausgeblendete Zähler, Objektzahl und geschätzte Belastung je Layer
- Neuladehinweis für Layer, die aus dem geladenen Modell gefiltert wurden; strukturelle Änderungen werden gesammelt über „Änderungen anwenden“ kontrolliert neu aufgebaut
- Preflight- und Renderer-Layer werden für große Listen linear in `O(L)` zusammengeführt; memoisiert gerenderte Layerzeilen aktualisieren bei einer Umschaltung nur die tatsächlich geänderten Einträge
- eigener Block-Drawer mit Suche, Zählern, benannten Blöcken, gruppierten Systemblöcken, XRefs und Belastungsschätzung
- geschlossene Layer- und Block-Drawer halten ihren Inhalt nur für die 300-ms-Exit-Animation und entfernen ihn anschließend, sodass verborgene Listen keine Filter- und Renderarbeit verursachen
- direkte Modellbereichsblöcke unmittelbar schalten; verschachtelte oder bereits weggefilterte Strukturen über „Änderungen anwenden“ kontrolliert neu laden
- CAD-Objekte auswählen, rekursiven Blockpfad prüfen sowie Objekt, Layer oder Block ausblenden; Settings stellt verborgene Objekte, Layer und Blöcke getrennt mit eigenem Zähler wieder her
- ausgewählte logische CAD-Objekte sitzungsweit ganz nach vorne oder ganz nach hinten setzen; Leader-/Text-, Hatch-/Kontur- und wiederverwendete Blockgruppen bleiben dabei zusammen
- selektive MLightCAD-Kompatibilitätskorrektur für als Zeichenpaare gepackte Windows-1252-`MULTILEADER`-Beschriftungen alter `AC1015`-Dateien; bereits korrekte Texte werden nicht verändert
- globaler Textschalter für direkte und verschachtelte Texte; im MLightCAD-Viewer werden `LEADER`, `MLEADER` und `MULTILEADER` einschließlich Führungslinien und Pfeilen als vollständige Anmerkung geschaltet
- viewportfeste modale Drawer auf einer gemeinsamen `BottomSheet`-Basis; Griff, Tipp außerhalb und Escape schließen den offenen Drawer ohne die Karte zu verschieben
- gruppierte Kartenaktionen für Layer, Blöcke, DWG, Messung, Standort und Zeichnung einpassen über dem Site-Banner
- goldener Settings-Zugang im App-Kopf und eigener Kartenbutton für den DWG-Drawer; Einstellungen und Datei-/Vorbereitungsfunktionen bleiben sauber getrennt
- Desktop-Drag-and-drop für genau eine lokale `.dwg` auf der Kartenfläche mit dezentem Drop-Overlay und Bestätigung vor dem Ersetzen einer bestehenden Zeichnung
- Positionsmenü am Desktop-Rechtsklickpunkt und mobiles Positions-Sheet nach einem Einfinger-Langdruck von ungefähr 550 ms; Bewegung, Pinch oder ein zweiter Finger brechen die Erkennung ab
- Kopieren der gewählten LUREF-Position als `X.XX, Y.XX` sowie explizite Links zu Geoportail, Google Maps, Apple Maps und Google Street View; ein temporäres goldfarbenes Zweilinienkreuz kennzeichnet den gewählten Punkt
- gemeinsamer kompakter DWG-Ladespinner mit 18 Pixel Durchmesser
- Live-Standort mit Genauigkeitskreis und pausierbarer Kartenfolge
- kompakte klickbare Satelliten-Statuskarte zum Ein- und Ausblenden der gemeinsamen Basiskarte sowie eigene GPS-Genauigkeitskarte
- schwarzer neutraler Kartenhintergrund, wenn keine Geoportail-Kachel sichtbar ist
- nordfixierte MLightCAD-Kartenansicht ohne redundanten Nordpfeil
- mobile 2D-Distanzmessung über das feste rote Aim im echten Karten- beziehungsweise CAD-Canvasbereich; Touchpunkte werden ausschließlich mit der 44-Pixel-Aktion gesetzt, niemals durch Tap, Pan oder Pinch
- Desktop-Messung per direktem Mausklick; sichtbare CAD-Fänge erscheinen beim Hover und verwenden dieselben 18-CSS-Pixel- sowie Sichtbarkeitsregeln wie die Aim-Messung
- gemeinsamer kompakter Mess-Sheet mit ausschließlich CAD-Snap, Punktaktion und nach Abschluss dem Distanzresultat; beendet wird über den aktiven `Ruler`-Schalter oder den Sheet-Griff
- leichter CAD-Snap im 18-Pixel-Fangradius über den nativen MLightCAD-OSNAP ausschließlich für sichtbare CAD-Inhalte
- mobile Oberfläche in Deutsch, Französisch und Englisch; offene MLightCAD-Hinweise wechseln ihre Sprache live mit
- aus den Paketmetadaten gelesene Version und ein kompakter Settings-Zugang im App-Kopf
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

Der automatisierte Prüfplan deckt zusätzlich Single-Viewer-Routing, die Trennung der Drawer, getrennte Wiederherstellung, Drag-and-drop, Replace-Bestätigung, Positionslinks und Langdruck-Abbruchbedingungen ab. Zustandsübergänge der Messung, Meterberechnung, CAD-Snap sowie die unveränderte synchrone Kamerabrücke bleiben Teil der Regression. Die reale Junglinster-Prüfung aus Version 0.4.1 mit 11,31 MB, 66.816 Objekten, 316 Layern und 1.097 Blöcken bleibt die lokale Performance-Referenz: Eine Layer-Umschaltung dauerte ungefähr 0,28 s, ein MLightCAD-Pan mit 30 Schritten ungefähr 0,30 s. Private DWG- und XRef-Dateien bleiben außerhalb des Repositorys; weitergehende Browser- und Hardwareabnahmen stehen in [docs/testing.md](docs/testing.md).

Der Build erzeugt die versionierte Laufzeit unter `dist/mlightcad-workers/0.3.0/`. Das ausgelieferte LibreDWG-WASM wird reproduzierbar auf 128 MiB Anfangsspeicher gepatcht und validiert; API, Emscripten-Laufzeit und WASM werden als geprüfte relative Assetkette ausgeliefert. Der direkte Parser ist mit `@mlightcad/libredwg-web` 0.7.10 festgeschrieben. Eine reale DWG-Fixture ist nicht im Repository enthalten; die lokale Abnahme ist in [docs/testing.md](docs/testing.md) protokolliert.

## Grenzen von Version 0.7.0

- Der Viewer erwartet 2D-Modellbereichsdaten in absoluten LUREF-Meterkoordinaten; es gibt keine automatische Georeferenzierung.
- Lokale XRefs werden bestmöglich ohne Upload aufgelöst und vor der Darstellung zusammengeführt. XCLIP, Proxy-/Custom-Objekte und vollständige AutoCAD-XRef-Parität gehören nicht zum abgenommenen Funktionsumfang.
- Nicht eindeutig zuordenbare oder beschädigte Annotationskontexte werden bewusst nicht entfernt. Die App meldet diesen Fail-open-Fall; dadurch können weiterhin mehrere Darstellungen sichtbar bleiben.
- Nach dem MLightCAD-Renderstart werden vom Renderer gemeldete fehlende beziehungsweise ersetzte CAD-Schriften mit Name und Vorkommenszahl im Importbericht angezeigt. Die Erkennung ist rendererbasiert und daher bestmöglich, nicht vollständig für vom Parser ausgelassene Schriftverwendungen.
- MLightCAD kann Schraffuren abweichend darstellen; der Upstream-Fehler wird in [mlightcad/cad-viewer #230](https://github.com/mlightcad/cad-viewer/issues/230) verfolgt.
- Der MLightCAD-Textschalter erfasst `TEXT`, `MTEXT`, `ATTRIB` und `ATTDEF` einschließlich gerenderter Texte in verschachtelten Blöcken sowie vollständige `LEADER`-, `MLEADER`- und `MULTILEADER`-Entitäten. Proprietäre oder vom Parser ausgelassene Textobjekte können weiterhin fehlen.
- Es gibt kein 10-MiB-Limit. „Vollständig laden“ bleibt immer verfügbar; eine sehr komplexe DWG kann den Speicherrahmen eines Mobilbrowsers dennoch überschreiten.
- iOS Safari kann einen speicherintensiven Tab beenden, bevor JavaScript den Fehler melden oder den Worker geordnet abbrechen kann. Der Recovery-Marker enthält deshalb nur Dateiname, Größe und Startzeit; die DWG muss danach erneut ausgewählt werden.
- `Scharf` erhöht die WebGL-Framebufferlast gegenüber `Auto` bewusst und kann auf speicherknappen Geräten weniger stabil sein; `Auto` bleibt die empfohlene Vorgabe und `Speichersparend` der robuste 1×-Modus.
- Die App ist kein CAD-Editor: Sie verändert oder schreibt keine DWG und erzeugt keinen optimierten DWG-Download.
- Ein aus dem Preflight-Modell entfernter verschachtelter Block oder Layer muss aus der weiterhin lokal ausgewählten Originaldatei neu aufgebaut werden, bevor er wieder sichtbar ist.
- MLightCAD lädt unterstützende CAD-/Schriftressourcen zur Laufzeit von der konfigurierten jsDelivr-Quelle; die DWG selbst wird nicht dorthin gesendet.
- Die Messung ist eine ebene 2D-LUREF-Messung. Sie berücksichtigt weder Geländehöhen noch 3D-Geometrie; der leichte CAD-Snap ist auf sichtbare, vom jeweiligen Viewer verfügbare CAD-Geometrie und einen Fangradius von 18 CSS-Pixeln begrenzt.

Weitere Informationen: [Architektur](docs/architecture.md), [Datenquellen](docs/data-sources.md), [Luxemburg-Filter](docs/luxembourg-boundary-filter.md), [Netlify](docs/netlify.md), [Tests](docs/testing.md) und [Release 0.7.0](docs/releases/0.7.0.md).

## Lizenz und Quellcode

Die Anwendung ist unter `AGPL-3.0-only` lizenziert. MLightCAD-Kernpakete stehen unter MIT; der verwendete LibreDWG-Konverter steht unter `GPL-3.0`. Bei öffentlichem Betrieb muss der vollständige, zur bereitgestellten Version passende Quellcode für alle Nutzer zugänglich bleiben. Details stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
