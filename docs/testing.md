# Test- und Abnahmeplan 0.2.3

## Automatisiert

`npm test` prüft weiterhin die bestehende OpenLayers-Pipeline und zusätzlich die parallele MLightCAD-Integration. Die 0.2.0-Suite bleibt als Regressionstest erhalten.

Bestehende Schwerpunkte:

- LUREF-Roundtrip und Lage eines bekannten LUREF-Referenzpunkts
- WMTS-Layer, Matrix-Set, Dienst-URL und WMS-Fallback
- absolute LUREF-Ausdehnungen und Layer-Metadaten
- Blocktranslation, Layervererbung und Zyklenerkennung
- Kurvenapproximation sowie Warnungen für 3D und Papierbereich
- Schraffuren aus normalisierten und LibreDWG-rohen Begrenzungspfaden
- stabile CAD-Objekt-IDs, automatische LUREF-Ausreißerfilterung und Sichtbarkeitszählung
- zentrale UI-Texte einschließlich Umlauten in Deutsch, Französisch und Englisch

Neue Schwerpunkte in 0.2.0:

- Zuordnung von `/` und `/mlightcad`, Links sowie History-Navigation
- Erhalt derselben lokalen `File`-Referenz beim Viewerwechsel und Revisionswechsel beim Ersetzen oder Entfernen
- Übergabe von WCS-Mittelpunkt und Metern pro CSS-Pixel durch die MLightCAD-Kamerabrücke
- Deckkraftvorgaben, Rundung und Begrenzung auf 0 bis 100 Prozent
- einzelnes und gemeinsames Schalten von MLightCAD-Layern
- Beschreibung einer Auswahl, Ausblenden und Wiederherstellen eines Objekts
- `AcEdViewMode.PAN`, ausgeblendete eingebettete Kommandozeile und mobiler Pointer-Tap-Fallback mit 12-Pixel-Trefferradius
- Unterdrückung der Tap-Auswahl nach Ziehen und bei bereits erfolgter eingebauter Auswahl
- Schließen eines modalen `BottomSheet` über den gemeinsamen Backdrop, ohne Pointer-Ereignisse aus dem Inhalt als Außentipp zu behandeln
- kompakte `ML`-/`OL`-Taste und History-Wechsel im App-Kopf
- identische Vierer-Aktionsreihenfolge und denselben modalen CAD-Drawer im OpenLayers- und MLightCAD-Viewer
- OpenLayers-Deckkraft, „Zeichnung einpassen“, bestehende Warnungen und geschlossenen Startzustand bei bereits vorhandener Sitzungsdatei
- vollständiges Beenden der Renderanimation und Freigabe des WebGL-Kontexts bei der Adapter-Entsorgung

Neue Schwerpunkte in 0.2.1:

- hybride Gestenzuständigkeit: OpenLayers bleibt ohne DWG und während des Imports interaktiv; erst ein bereiter MLightCAD-Adapter übernimmt Pan und Zoom
- unveränderte MLightCAD-Desktopsteuerung und reduzierte Pinch-Zoom-Empfindlichkeit auf Touchgeräten
- explizite CAD-zu-OpenLayers-Synchronisierung nach GPS-Zentrierung und „Zeichnung einpassen“
- tiefe Zoomstufen und LUREF-Mittelpunkte außerhalb der früheren festen Ausdehnung ohne stehende Basiskarte
- Reprojektions-Kachelbereich für den realen Referenzmittelpunkt `LUREF 1176.41 / 44976.64`
- dauerhaft transparenter WebGL-Hintergrund mit `clearAlpha = 0`; der Deckkraftwert gilt nur für den CAD-Canvas
- Schalten von gerenderten `TEXT`-, `MTEXT`-, `ATTRIB`- und `ATTDEF`-Merkmalen einschließlich verschachtelter Blöcke
- iterative Layer-/Objekterfassung großer DWGs sowie identische vollständige Entsorgung nach Erfolg, Abbruch, Fehler, Dateiersatz und Viewerwechsel
- erwartete Worker-Ablehnung nach Abbruch ohne nachträglichen Importfehler
- sitzungsweit gemeinsame Sichtbarkeit der Geoportail-Basiskarte und klickbare Satelliten-Statuskarte in beiden Viewern
- GPS-Genauigkeitskarte und identische gruppierte Kartenaktionen in beiden Viewern
- gemeinsamer Layer-, CAD- und Objekt-Drawer mit Schließen über den Backdrop
- Fokusbindung, Escape-Schließen und Fokus-Rückgabe der modalen Drawer
- kompakter Ladespinner mit 18 Pixel Durchmesser
- drehbarer bestehender Viewer mit Nordausrichtung und nordfixierter MLightCAD-Viewer ohne redundanten Nordpfeil
- vollständige neue Oberflächentexte und Beschriftungen in Deutsch, Französisch und Englisch

Neue Schwerpunkte in 0.2.2:

- Anfangs- und Rückgabefokus der Drawer ohne programmgesteuertes Scrollen
- Griff als einzige sichtbare Drawer-Schließaktion; keine redundanten Kreuz-Schaltflächen in CAD-, Layer- oder Objektkopf
- viewportfeste Overlay-Geometrie oberhalb von OpenLayers und MLightCAD
- nur eine scrollende Layerliste bei festem Drawer-Kopf
- kompakte 26-Pixel-Satelliten-Card und schwarzer Kartenhintergrund

Neue Schwerpunkte in 0.2.3:

- Erkennung paarweise gepackter `MULTILEADER`-/`MLEADER`-MText-Werte aus vor Unicode liegenden Windows-1252-DWGs einschließlich `AC1015` und Rückgewinnung der ursprünglichen Zeichen einschließlich MText-Steuerfolgen
- Versionsbestimmung aus der originalen sechs Byte langen DWG-Signatur, wenn LibreDWG `ACADVER` und `DWGCODEPAGE` im Parsermodell leer lässt
- stark begrenzter Windows-1252-Fallback bei belegter alter Originalsignatur und leerer Header-Codepage; ausdrücklich andere Codepages bleiben gesperrt
- unveränderte Übergabe moderner DWGs, bereits korrekter Unicode-Texte sowie unvollständiger oder nicht plausibler Kandidaten
- einmalige Normalisierung gleicher Entitätsreferenzen aus Modellbereich und Blockdatensätzen
- Ende des rekonstruierten Textes am NUL-Byte, ohne einen nachfolgenden LibreDWG-Binärfooter als Beschriftung zu übernehmen
- Schalten vollständiger `LEADER`-, `MLEADER`- und `MULTILEADER`-Entitäten mit Text, Führungslinien und Pfeilen
- weiterhin verborgener Zustand einzeln ausgeblendeter Anmerkungen, wenn der globale Textschalter wieder aktiviert wird

`npm run build` führt TypeScript und Vite aus. Der Produktionsbuild muss sowohl die vier bisherigen Dateien unter `dist/wasm/` als auch diese drei Dateien unter `dist/mlightcad-workers/` enthalten:

- `libredwg-parser-worker.js`
- `libredwg-web.wasm`
- `mtext-renderer-worker.js`

Releaseprüfung 0.2.1 am 25. August 2026:

- `npm test`: 18 Testdateien und 61 Tests bestanden
- `npm run build`: TypeScript- und Vite-Produktionsbuild bestanden
- alle vier Dateien unter `dist/wasm/` und alle drei Dateien unter `dist/mlightcad-workers/` vorhanden
- Vite meldet einen Größenhinweis für den lazy geladenen MLightCAD-Chunk; dies ist eine Warnung, kein Buildfehler
- der vorherige Stand 0.2.0 mit 14 Testdateien und 39 Tests bleibt durch dieselbe Suite abgedeckt

Releaseprüfung 0.2.2 am 25. August 2026:

- `npm test`: 18 Testdateien und 63 Tests bestanden
- `npm run build`: TypeScript- und Vite-Produktionsbuild bestanden
- Browser-Produktionspreview: Nach Schließen und erneutem Öffnen bleiben `app.scrollTop = 0` und die Unterkanten von App, Karte, Modal-Overlay und Drawer identisch
- Browser-Produktionspreview: Drawer `z-index: 100` liegt oberhalb des MLightCAD-Overlays `z-index: 4`; kein Drawer-Kopf enthält eine Kreuz-Schaltfläche
- Browser-Produktionspreview: Satelliten-Card ist 26 Pixel hoch und der Kartenhintergrund wird schwarz berechnet

Releaseprüfung 0.2.3 am 25. August 2026:

- `npm test`: 19 Testdateien und 78 Tests bestanden
- `npm run build`: TypeScript- und Vite-Produktionsbuild bestanden
- alle vier Dateien unter `dist/wasm/` und alle drei Dateien unter `dist/mlightcad-workers/` vorhanden
- lokale Parserprüfung mit `2023- Bestandskanal_Junglinster.dwg`: 1.087 von 1.087 betroffenen `MULTILEADER`-Texten normalisiert; danach 0 verbleibende CJK-Ersatztexte

## Manuell vor einem Produktiveinsatz

- `/` und `/mlightcad` direkt über HTTPS öffnen; der SPA-Fallback muss auch den Deep Link liefern
- `/mlightcad` ohne gewählte DWG öffnen und Pan, Mausrad sowie Touchzoom der OpenLayers-Karte prüfen
- eine DWG unter einer Route wählen und während sowie nach dem Import zu beiden Viewern wechseln
- prüfen, dass die lokale Datei beim Routenwechsel erhalten bleibt und nach einem Browser-Neuladen erneut gewählt werden muss
- gültige, ungültige und über 10 MB große DWG sowie Ersetzen, Entfernen und Abbrechen testen
- lokale, nur online verfügbare oder während des Lesens unzugängliche Dateien auf den lokalisierten Lesefehler prüfen
- WMTS absichtlich blockieren und den sichtbaren WMS-Fallback in beiden Viewern verifizieren
- verweigerte und erlaubte Standortberechtigung, pausierte Folge und Wiederaufnahme prüfen
- nach einer GPS-Zentrierung und nach „Zeichnung einpassen“ kontrollieren, dass CAD und Orthofoto ohne sichtbaren Versatz gemeinsam stehen
- über die bisherige OpenLayers-Auflösungsgrenze hinaus zoomen; CAD und Basiskarte müssen beide weiterzoomen
- eine Zeichnung mit Mittelpunkt außerhalb der früheren festen LUREF-Ausdehnung laden und den unverfälschten Startausschnitt prüfen
- DE/FR/EN und Umlaute auf schmalem iPhone- und Android-Viewport kontrollieren
- wiederholte Viewer- und Dateiwechsel auf verwaiste Canvas-Elemente, weiterlaufende Worker und verlorene WebGL-Kontexte prüfen
- dünne CAD-Geometrie antippen; Auswahl darf einmal auslösen, Kartenpan und Pinch dürfen keine Auswahl erzeugen
- prüfen, dass MLightCAD in `PAN` startet, eine Touchbewegung den Kameramittelpunkt ändert und die eingebettete Kommandozeile nicht sichtbar oder bedienbar ist
- MLightCAD auf Desktop mit Maus sowie auf Mobilgeräten mit Pan und Pinch bedienen; auf Mobilgeräten darf der Zoom nicht sprunghaft reagieren
- Layer- und „DWG & Darstellung“-Drawer getrennt öffnen; Inhalt antippen, Backdrop antippen und den jeweils erwarteten Offen-/Geschlossen-Zustand prüfen
- jeden Drawer mehrfach öffnen und schließen; `.app-shell.scrollTop` muss `0` bleiben und die Drawer-Unterkante muss der Viewport-Unterkante entsprechen
- lange Layerliste scrollen; Drawer-Kopf, Griff und Drawer-Unterkante dürfen sich nicht verschieben
- nach einer Auswahl den kompakten Objekt-Drawer sowie Objekt- und Layeraktionen prüfen
- beide Routen nebeneinander auf dieselben drei modalen Drawer prüfen; Layer/CAD müssen oben und Standort/Einpassen unten über dem Site-Banner gruppiert sein
- „Zeichnung einpassen“ und Deckkraftvorgaben auch im OpenLayers-Viewer prüfen
- Deckkraft, Textschalter, Verborgen-Zähler und Wiederherstellung in beiden Viewern im CAD-Drawer prüfen
- den gemeinsamen Ladespinner während beider Importe mit 18 Pixel Durchmesser kontrollieren
- die Satelliten-Statuskarte in beiden Routen antippen; Orthofoto und WMS-Fallback müssen gemeinsam verschwinden beziehungsweise wieder erscheinen, die DWG muss sichtbar bleiben und der Zustand einen Viewerwechsel überstehen
- bei aktivem Standort die eigenständige GPS-Genauigkeitskarte und den Genauigkeitskreis prüfen
- kompakte `ML`-/`OL`-Taste neben DE/FR/EN, Version im Kopf und Banner rechts mit exaktem Text prüfen; nur der drehbare bestehende Viewer zeigt seine Nordausrichtung
- die MLightCAD-Deckkraft bei sichtbarer und ausgeblendeter Basiskarte prüfen: unbelegte Pixel müssen vollständig transparent bleiben, nur CAD-Geometrie und -Füllungen dürfen ihre Deckkraft ändern
- Texte in direkt gezeichneten und verschachtelten Blöcken gemeinsam aus- und einblenden
- in einer alten `AC1015`-DWG lesbare `MULTILEADER`-Beschriftungen einschließlich Umlauten, Sonderzeichen und MText-Zeilenumbrüchen mit der CAD-Referenz vergleichen
- Texte ausschalten und bestätigen, dass bei `LEADER`, `MLEADER` und `MULTILEADER` auch sämtliche zugehörigen Führungslinien und Pfeile verschwinden; beim Einschalten müssen nur ansonsten sichtbare Anmerkungen zurückkehren
- einen sichtbaren MLightCAD-Hinweis öffnen und die Sprache wechseln; die Meldung muss ohne erneutes Auslösen live übersetzt werden
- im Browser-Netzwerkprotokoll bestätigen, dass keine Anfrage den DWG-Dateiinhalt überträgt
- Netlify-Produktionsbuild in mobilem Safari und Chrome abnehmen

## Erwartete reale DWG-Abnahme 0.2.3

Eine reale DWG-Fixture ist bewusst nicht im Repository enthalten und darf nicht an einen externen Dienst übertragen werden. Für jede lokal bereitgestellte 2D-DWG mit bekannten LUREF-Koordinaten werden folgende Punkte dokumentiert:

1. Referenz: Dateikennung oder lokaler Hash, DWG-Erzeuger/-Version, Referenzansicht und bekannte LUREF-Kontrollpunkte festhalten.
2. Bestehender Viewer: Datei unter `/` öffnen und Layer, darstellbare Objekte, Warnungen sowie Startausschnitt notieren.
3. MLightCAD: ohne neue Dateiauswahl zu `/mlightcad` wechseln; erfolgreicher Import, Modellbereich, Layernamen und plausible Ausdehnung prüfen. Abweichende Objektzahlen werden erklärt, nicht automatisch als Fehler gewertet.
4. Georeferenzierung: mehrere bekannte Kontrollpunkte bei eingepasster Ansicht und in mehreren Zoomstufen mit dem Geoportail-Orthofoto vergleichen. Sichtbare Verschiebung oder zoomabhängige Drift wird mit Meter- beziehungsweise Pixelabweichung protokolliert.
5. Darstellung: repräsentative Linien, Polylinien, Bögen, Kreise, Blöcke und Texte gegen die CAD-Referenz prüfen. HATCH-Abweichungen werden ausdrücklich dem offenen [Upstream-Thema #230](https://github.com/mlightcad/cad-viewer/issues/230) zugeordnet, sofern sie diesem Fehlerbild entsprechen.
6. Bedienung: Deckkraft bei 0, 60, 70 und 100 Prozent, einzelne und alle Layer, Auswahl, Objekt-/Layer-Ausblendung, Wiederherstellung und „Zeichnung einpassen“ prüfen.
7. Text: `TEXT`, `MTEXT`, `ATTRIB` und `ATTDEF` direkt im Modellbereich und in verschachtelten Blöcken schalten. In alten `AC1015`-Dateien `MULTILEADER`-Beschriftungen gegen die Referenz lesen und `LEADER`, `MLEADER` sowie `MULTILEADER` einschließlich ihrer gesamten Führungslinien schalten. Proprietäre Textobjekte werden separat protokolliert.
8. Lebenszyklus: laufenden Import abbrechen, Datei ersetzen, beide Routen mehrfach wechseln und anschließend prüfen, dass nur der aktuelle Canvas und Worker aktiv sind.

XRefs, proprietäre benutzerdefinierte Objekte und 3D-Inhalte sind keine positiven Abnahmekriterien für 0.2.3. Ihr Fehlen oder ihre abweichende Darstellung muss als bekannte Grenze festgehalten werden. Ein erfolgreicher automatisierter Testlauf allein gilt nicht als reale DWG-Abnahme.

## Reale Referenz-DWG für 0.2.3

`2023- Bestandskanal_Junglinster.dwg` ist der verbindliche lokale Stabilitäts- und Kodierungsfall für Version 0.2.3. Die alte `AC1015`-Datei ist 11,31 MiB groß und ergibt im MLightCAD-Dokument 66.816 Objekte auf 316 Layern. Sie wird nicht in Git aufgenommen und nicht an einen Server übertragen.

Beim vorherigen Produktionsstand erreichte der Import nach ungefähr einer Minute die Renderphase bei 100 Prozent, bevor die Oberfläche vollständig bereit wurde. Die 0.2.3-Abnahme muss deshalb weiterhin ausdrücklich bestätigen:

- Der Tab stürzt weder auf Desktop noch auf einem unterstützten Mobilgerät ab.
- Während Analyse und Rendern bleibt der Import abbrechbar; der 18-Pixel-Spinner vergrößert den Drawer nicht.
- Nach `ready` sind alle 316 Layer bedienbar, ohne eine zweite vollständige Entitätenliste im Anwendungscode zu halten.
- Die Zeichnung wird an ihrer absoluten LUREF-Lage dargestellt; ihr Mittelpunkt darf nicht an einer früheren festen Kartenausdehnung abgeschnitten werden.
- Pan, Zoom, GPS-Zentrierung und Einpassen führen CAD und Orthofoto gemeinsam. Auch bei tiefem Zoom bleibt kein Renderer sichtbar zurück.
- Basiskarte aus zeigt ausschließlich die CAD-Zeichnung auf transparentem Hintergrund. Die Deckkraft verändert nur sichtbare CAD-Objekte und Füllungen.
- Textschalter, Layerausblendung, Objektausblendung und Wiederherstellung funktionieren auch bei diesem Dokument.
- `MULTILEADER`-Beschriftungen erscheinen als lesbarer Windows-1252-Text statt als ostasiatische Ersatzzeichen; Zahlen, Umlaute, Sonderzeichen und MText-Formatierung stimmen mit der CAD-Referenz überein.
- Bei ausgeschalteten Texten bleiben keine Führungslinien oder Pfeile von `LEADER`, `MLEADER` oder `MULTILEADER` sichtbar.
- Nach Entfernen, Ersetzen und Viewerwechsel sind Worker, Dokumentreferenzen, Szene, Renderer und WebGL-Kontext freigegeben.

Lokale Parser-Abnahme 0.2.3:

- Die Originaldatei wurde direkt mit der lokal installierten LibreDWG-Fassung gelesen; sie wurde weder kopiert noch hochgeladen.
- Das Parsermodell enthielt 1.087 `MULTILEADER`-Entitäten mit dem betroffenen Byte-Paar-Muster.
- Die Kompatibilitätskorrektur normalisierte alle 1.087 Werte; anschließend enthielt keiner dieser Texte mehr CJK-Ersatzzeichen.
- Stichproben ergaben wieder lesbare Kanaltexte einschließlich MText-Steuerfolgen und Windows-1252-Sonderzeichen wie `‰`.

Lokale Produktions-Preview-Abnahme 0.2.1 auf Desktop:

- Die Datei erreichte ohne Tab-Absturz und ohne Browser-Konsolenfehler vollständig `ready`; gemeldet wurden 66.816 Objekte und 316 Layer.
- Der Startmittelpunkt `LUREF 1176.41 / 44976.64` wurde trotz seiner Lage außerhalb der früheren festen Kartenausdehnung unverändert übernommen.
- Eine MLightCAD-Ziehbewegung änderte den gemeinsamen Kartenmittelpunkt, ohne den Objekt-Drawer zu öffnen. „Zeichnung einpassen“ stellte den Startmittelpunkt anschließend wieder exakt her.
- WebGL-Host und Canvas blieben transparent. Bei 70 Prozent hatte nur der Canvas `opacity: 0.7`; die Vorgaben Karte und CAD ergaben `0` beziehungsweise `1`.
- Der Textschalter wechselte ohne Rendererfehler, der Layer-Drawer zeigte alle 316 Layer und ein Außentipp schloss ihn.
- Die Satelliten-Card blendete die Basiskarte aus, während der CAD-Canvas sichtbar blieb. Der Zustand blieb beim kontrollierten Wechsel zu OpenLayers erhalten.
- Der Viewerwechsel entfernte den MLightCAD-Renderhost; der bestehende Viewer zeigte während seiner Neuverarbeitung den gemeinsamen 18-Pixel-Spinner.

## Reale DWG-Abnahme 0.2.0 – Teilstand

Im Produktions-Preview bei 390 × 844 Pixel wurde `/mlightcad` mit der lokal verfügbaren `doheem.dwg` (185.375 Byte) geprüft:

- MLightCAD analysierte und renderte die Datei mit 47 Layern und 7 Objekten auf oberster Modellbereichsebene.
- Die Überlagerung lag am geprüften Punkt `LUREF 81027.13 / 83979.27` über dem Geoportail-Orthofoto. Da nur ein Punkt protokolliert wurde, belegt dies noch keine vollständige Mehrpunkt- oder Zoomdrift-Abnahme.
- Die Deckkraftvorgaben sowie das Aus- und Einblenden eines Layers funktionierten.
- Eine Touchbewegung im `PAN`-Modus änderte den CAD-/Kartenmittelpunkt; die LUREF-Überlagerung blieb dabei gemeinsam geführt.
- Ein kurzer Tap wählte ein `LWPOLYLINE`-Objekt aus. Der kompakte Objekt-Drawer zeigte Typ und Layer; der separate Layer-Drawer ließ sich unabhängig öffnen.
- Das ausgewählte Objekt wurde ausgeblendet und anschließend über die Wiederherstellung im CAD-Drawer wieder sichtbar gemacht.
- Der Wechsel MLightCAD → bestehender Viewer → MLightCAD behielt dieselbe lokale `File`-Referenz und verarbeitete sie in jeder Pipeline neu. Der bestehende Viewer meldete 237 Features und 13 gerenderte Layer; MLightCAD anschließend wieder 47 Layer und 7 oberste Szenenobjekte.

Verschachtelte Texte, HATCH-Referenztreue und die vollständige Mehrpunkt-/Zoomdriftprüfung waren nicht Bestandteil dieses Teilstands und bleiben vor einem Produktiveinsatz offen.

Weitere bekannte Testdateien waren auf diesem Rechner nicht inhaltlich verfügbar: `büro.dwg` und `181013-15-002021.dwg` lagen nur als OneDrive-Onlineplatzhalter vor (`NotReadableError`; Cloud-Dateianbieter nicht aktiv), der Pfad zu `251068-11-002021a.dwg` war nicht verfügbar. Diese Umgebungsfehler sind keine Aussage über die Parserkompatibilität. Keine dieser Dateien wurde hochgeladen oder in das Repository aufgenommen.

## Reale DWG-Abnahme 0.1.1

Die folgenden lokal bereitgestellten Dateien wurden browserlokal mit dem Produktionsbuild erfolgreich verarbeitet:

- `büro.dwg`: 179 Objekte, 13 Layer
- `doheem.dwg`: 181 Objekte, 13 Layer
- `251068-11-002021a.dwg`: 1.016 Objekte, 39 Layer

Keine der DWG-Dateien wurde an einen externen Dienst übertragen oder in das Repository aufgenommen. Nicht unterstützte Inhalte wie Viewports, Multileader, externe Bilder und einzelne 3D-Z-Werte werden weiterhin als Hinweise gemeldet.

## Reale DWG-Abnahme 0.1.2

- `181013-15-002021.dwg`: 20.302 darstellbare Objekte, 86 Layer und 742 automatisch ausgeblendete räumliche Ausreißer
- gegenüber dem Import ohne LibreDWG-HATCH-Rohpfade werden 1.186 zusätzliche Schraffurobjekte dargestellt
- Startausschnitt liegt beim LUREF-Modell; Auswahl und Ausblenden eines Objekts beziehungsweise Layers wurden browserlokal geprüft

Die Datei blieb ausschließlich im lokalen Browser-Arbeitsspeicher und wurde weder veröffentlicht noch in Git aufgenommen.

## Mobile UI-Abnahme 0.1.3

- Bottom-Drawer bei 390 × 844 Pixel geöffnet, geschlossen und wieder geöffnet
- geschlossener Zustand ohne Seitenüberlauf; `site-info-banner`, Attribution und Wiederöffnungstaste überdecken sich nicht
- geöffneter Drawer liegt wie vorgesehen über dem Banner
- CAD-Textschalter mit `181013-15-002021.dwg` in beiden Zuständen geprüft
- DWG-Import mit und ohne erweiterte HATCH-Rohdaten geprüft; inkompatible Rohdaten lösen automatisch den kompatiblen Zweitversuch aus

## Mobile UI-Abnahme 0.1.4

- `doheem.dwg` mit 237 Objekten und 13 Ebenen im Produktionsbuild verarbeitet
- BF.lu-Logo, Geoportail-Link und fehlenden OpenLayers-Attributionsschalter geprüft
- gemeinsamen animierten Bedien- und Ebenen-Drawer bei 390 × 844 Pixel geprüft
- links ausklappendes CAD-Menü mit Text- und Wiederherstellungsaktion geprüft
- Wiederherstellung von 230 automatisch ausgeblendeten Objekten und anschließende Zählung von 17 über eine Ebene ausgeblendeten Objekten geprüft
