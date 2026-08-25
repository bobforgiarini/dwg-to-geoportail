# DWG to Geoportail

Mobile-first Webanwendung zum lokalen Anzeigen einer 2D-DWG mit absoluten LUREF-Koordinaten (`EPSG:2169`) über dem Geoportail-Orthofoto. Version 0.2.1 stellt zwei CAD-Viewer parallel bereit und stabilisiert deren gemeinsame Kartenbedienung.

## Viewer und Routen

| Route | Viewer | Zweck |
| --- | --- | --- |
| `/` | OpenLayers / `@flyfish-dev/cad-viewer` | etablierte, normalisierte 2D-Darstellung |
| `/mlightcad` | MLightCAD / Three.js | alternative direkte WebGL-Darstellung |

Der Umschalter im Kopfbereich verwendet die Browser-History. Die lokal ausgewählte `File`-Referenz bleibt beim Wechsel zwischen beiden Routen in einer gemeinsamen React-Sitzung erhalten und wird vom Ziel-Viewer neu verarbeitet. Sie geht bei einem Neuladen oder Schließen der Seite verloren. Die MLightCAD-Seite und ihre Bibliotheken werden erst beim Aufruf von `/mlightcad` geladen.

## Funktionen

- Geoportail `ortho_2025` per WMTS, mit `ortho_latest` per WMS als automatischem Fallback
- browserlokaler, abbrechbarer DWG-Import in Web Workern
- zwei unabhängig implementierte 2D-Viewer für den Vergleich realer Zeichnungen
- bestehende OpenLayers-Pipeline für Linien, Polylinien, Bögen, Kreise, Ellipsen, Splines, Punkte, Texte, Schraffuren und rekursive Blöcke
- automatische LUREF-Ausreißerfilterung im bestehenden Viewer
- MLightCAD als transparenter WebGL-Layer über einer nach `EPSG:2169` reprojizierten OpenLayers-Basiskarte
- hybride Kartensteuerung: Ohne fertig geladene DWG bedient OpenLayers Pan und Zoom; nach `ready` übernimmt MLightCAD die CAD- und Kartenbewegung
- Synchronisierung von CAD-Mittelpunkt und Metern pro Bildschirmpixel mit der Geoportail-Kamera, einschließlich expliziter Übergabe nach Standortzentrierung und „Zeichnung einpassen“
- MLightCAD-Bewegung ausdrücklich im `PAN`-Modus; Desktopsteuerung bleibt erhalten, der mobile Pinch-Zoom ist weniger empfindlich und kurze Taps wählen weiterhin über den mobilen Auswahl-Fallback aus
- eingebettete MLightCAD-Kommandozeile ausgeblendet, damit sie keine Karten- oder Touchbedienung abfängt
- CAD-Deckkraft in beiden Viewern von 0 bis 100 Prozent mit den Vorgaben Karte, Mix und CAD; im MLightCAD-Viewer betrifft sie ausschließlich die CAD-Zeichenfläche, deren unbelegte Pixel transparent bleiben
- DWG-Layer einzeln oder gemeinsam schalten
- CAD-Objekte auswählen, Objekt oder Layer ausblenden und verborgene Objekte wiederherstellen
- dieselben modalen „DWG & Darstellung“-, Objekt- und Layer-Drawer in beiden Viewern; Tipp außerhalb schließt den offenen Drawer
- dieselben gruppierten Kartenaktionen in beiden Viewern: Layer und CAD oben sowie Standort und Zeichnung einpassen unten über dem Site-Banner
- kompakter Objekt-Drawer; Deckkraft, Textschalter und Verborgen-Zähler liegen in beiden Viewern im gemeinsamen CAD-Drawer
- gemeinsamer kompakter DWG-Ladespinner mit 18 Pixel Durchmesser
- Live-Standort mit Genauigkeitskreis und pausierbarer Kartenfolge
- klickbare Satelliten-Statuskarte zum Ein- und Ausblenden der gemeinsamen Basiskarte sowie eigene GPS-Genauigkeitskarte
- drehbare Karte mit Nordausrichtung im bestehenden Viewer; im nordfixierten MLightCAD-Viewer ist kein redundanter Nordpfeil sichtbar
- mobile Oberfläche in Deutsch, Französisch und Englisch; offene MLightCAD-Hinweise wechseln ihre Sprache live mit
- kompakter `ML`-/`OL`-Viewerwechsel neben der Sprachauswahl und Version im App-Kopf
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

Der Build erzeugt `dist/` einschließlich der bisherigen Dateien unter `dist/wasm/` und der getrennten MLightCAD-Dateien unter `dist/mlightcad-workers/`. Eine reale DWG-Fixture ist nicht im Repository enthalten; die erwartete lokale Abnahme ist in [docs/testing.md](docs/testing.md) beschrieben.

## Grenzen von Version 0.2.1

- Beide Viewer erwarten 2D-Modellbereichsdaten in absoluten LUREF-Meterkoordinaten; es gibt keine automatische Georeferenzierung.
- XRefs, proprietäre benutzerdefinierte CAD-Objekte und 3D-Darstellung gehören nicht zum abgenommenen Funktionsumfang.
- MLightCAD kann Schraffuren abweichend darstellen; der Upstream-Fehler wird in [mlightcad/cad-viewer #230](https://github.com/mlightcad/cad-viewer/issues/230) verfolgt.
- Der MLightCAD-Textschalter erfasst `TEXT`, `MTEXT`, `ATTRIB` und `ATTDEF` einschließlich gerenderter Texte in verschachtelten Blöcken. Proprietäre Textobjekte können weiterhin vom Parser ausgelassen werden.
- Dateien über 10 MB werden gewarnt, können aber weiterhin lokal importiert und abgebrochen werden.
- MLightCAD lädt unterstützende CAD-/Schriftressourcen zur Laufzeit von der konfigurierten jsDelivr-Quelle; die DWG selbst wird nicht dorthin gesendet.

Weitere Informationen: [Architektur](docs/architecture.md), [Netlify](docs/netlify.md), [Tests](docs/testing.md) und [Release 0.2.1](docs/releases/0.2.1.md).

## Lizenz und Quellcode

Die Anwendung ist unter `AGPL-3.0-only` lizenziert. MLightCAD-Kernpakete stehen unter MIT; der verwendete LibreDWG-Konverter steht unter `GPL-3.0`. Bei öffentlichem Betrieb muss der vollständige, zur bereitgestellten Version passende Quellcode für alle Nutzer zugänglich bleiben. Details stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
