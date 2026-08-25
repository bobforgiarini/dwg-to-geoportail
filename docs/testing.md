# Test- und Abnahmeplan 0.2.0

## Automatisiert

`npm test` prüft weiterhin die bestehende OpenLayers-Pipeline und zusätzlich die parallele MLightCAD-Integration.

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

`npm run build` führt TypeScript und Vite aus. Der Produktionsbuild muss sowohl die vier bisherigen Dateien unter `dist/wasm/` als auch diese drei Dateien unter `dist/mlightcad-workers/` enthalten:

- `libredwg-parser-worker.js`
- `libredwg-web.wasm`
- `mtext-renderer-worker.js`

Releaseprüfung am 25. August 2026:

- `npm test`: 14 Testdateien und 39 Tests bestanden
- `npm run build`: TypeScript- und Vite-Produktionsbuild bestanden
- alle vier Dateien unter `dist/wasm/` und alle drei Dateien unter `dist/mlightcad-workers/` vorhanden
- Vite meldet einen Größenhinweis für den lazy geladenen MLightCAD-Chunk; dies ist eine Warnung, kein Buildfehler

## Manuell vor einem Produktiveinsatz

- `/` und `/mlightcad` direkt über HTTPS öffnen; der SPA-Fallback muss auch den Deep Link liefern
- eine DWG unter einer Route wählen und während sowie nach dem Import zu beiden Viewern wechseln
- prüfen, dass die lokale Datei beim Routenwechsel erhalten bleibt und nach einem Browser-Neuladen erneut gewählt werden muss
- gültige, ungültige und über 10 MB große DWG sowie Ersetzen, Entfernen und Abbrechen testen
- lokale, nur online verfügbare oder während des Lesens unzugängliche Dateien auf den lokalisierten Lesefehler prüfen
- WMTS absichtlich blockieren und den sichtbaren WMS-Fallback in beiden Viewern verifizieren
- verweigerte und erlaubte Standortberechtigung, pausierte Folge und Wiederaufnahme prüfen
- DE/FR/EN und Umlaute auf schmalem iPhone- und Android-Viewport kontrollieren
- wiederholte Viewer- und Dateiwechsel auf verwaiste Canvas-Elemente, weiterlaufende Worker und verlorene WebGL-Kontexte prüfen
- dünne CAD-Geometrie antippen; Auswahl darf einmal auslösen, Kartenpan und Pinch dürfen keine Auswahl erzeugen
- prüfen, dass MLightCAD in `PAN` startet, eine Touchbewegung den Kameramittelpunkt ändert und die eingebettete Kommandozeile nicht sichtbar oder bedienbar ist
- Layer- und „DWG & Darstellung“-Drawer getrennt öffnen; Inhalt antippen, Backdrop antippen und den jeweils erwarteten Offen-/Geschlossen-Zustand prüfen
- nach einer Auswahl den kompakten Objekt-Drawer sowie Objekt- und Layeraktionen prüfen
- beide Routen nebeneinander auf dieselben drei modalen Drawer und die Reihenfolge Standort → Einpassen → Layer → CAD prüfen
- „Zeichnung einpassen“ und Deckkraftvorgaben auch im OpenLayers-Viewer prüfen
- Deckkraft, Textschalter, Verborgen-Zähler und Wiederherstellung in beiden Viewern im CAD-Drawer prüfen
- den gemeinsamen Ladespinner während beider Importe mit 20 × 20 Pixel und 2-Pixel-Rand kontrollieren
- kompakte `ML`-/`OL`-Taste neben DE/FR/EN, Version im Kopf, nordfixierte `N`-Taste und Banner rechts mit exaktem Text prüfen
- einen sichtbaren MLightCAD-Hinweis öffnen und die Sprache wechseln; die Meldung muss ohne erneutes Auslösen live übersetzt werden
- im Browser-Netzwerkprotokoll bestätigen, dass keine Anfrage den DWG-Dateiinhalt überträgt
- Netlify-Produktionsbuild in mobilem Safari und Chrome abnehmen

## Erwartete reale DWG-Abnahme 0.2.0

Eine reale DWG-Fixture ist bewusst nicht im Repository enthalten und darf nicht an einen externen Dienst übertragen werden. Für jede lokal bereitgestellte 2D-DWG mit bekannten LUREF-Koordinaten werden folgende Punkte dokumentiert:

1. Referenz: Dateikennung oder lokaler Hash, DWG-Erzeuger/-Version, Referenzansicht und bekannte LUREF-Kontrollpunkte festhalten.
2. Bestehender Viewer: Datei unter `/` öffnen und Layer, darstellbare Objekte, Warnungen sowie Startausschnitt notieren.
3. MLightCAD: ohne neue Dateiauswahl zu `/mlightcad` wechseln; erfolgreicher Import, Modellbereich, Layernamen und plausible Ausdehnung prüfen. Abweichende Objektzahlen werden erklärt, nicht automatisch als Fehler gewertet.
4. Georeferenzierung: mehrere bekannte Kontrollpunkte bei eingepasster Ansicht und in mehreren Zoomstufen mit dem Geoportail-Orthofoto vergleichen. Sichtbare Verschiebung oder zoomabhängige Drift wird mit Meter- beziehungsweise Pixelabweichung protokolliert.
5. Darstellung: repräsentative Linien, Polylinien, Bögen, Kreise, Blöcke und Texte gegen die CAD-Referenz prüfen. HATCH-Abweichungen werden ausdrücklich dem offenen [Upstream-Thema #230](https://github.com/mlightcad/cad-viewer/issues/230) zugeordnet, sofern sie diesem Fehlerbild entsprechen.
6. Bedienung: Deckkraft bei 0, 60, 70 und 100 Prozent, einzelne und alle Layer, Auswahl, Objekt-/Layer-Ausblendung, Wiederherstellung und „Zeichnung einpassen“ prüfen.
7. Text: `TEXT`, `MTEXT`, `ATTRIB` und `ATTDEF` auf oberster Modellbereichsebene schalten. Text in verschachtelten Blöcken wird separat als bekannte Grenze protokolliert.
8. Lebenszyklus: laufenden Import abbrechen, Datei ersetzen, beide Routen mehrfach wechseln und anschließend prüfen, dass nur der aktuelle Canvas und Worker aktiv sind.

XRefs, proprietäre benutzerdefinierte Objekte und 3D-Inhalte sind keine positiven Abnahmekriterien für 0.2.0. Ihr Fehlen oder ihre abweichende Darstellung muss als bekannte Grenze festgehalten werden. Ein erfolgreicher automatisierter Testlauf allein gilt nicht als reale DWG-Abnahme.

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
