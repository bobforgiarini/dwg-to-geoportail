# Architektur 0.1.3

## Überblick

Die Anwendung ist eine statisch auslieferbare React-Single-Page-App. Sie besitzt weder Backend noch Datenbank. Eine ausgewählte DWG wird als `Uint8Array` an einen Web Worker übergeben, dort mit LibreDWG-WASM gelesen, als normalisiertes CAD-Dokument zurückgegeben und anschließend in OpenLayers-Features umgewandelt.

## Datenfluss

1. Der Nutzer wählt lokal eine `.dwg` aus.
2. `importDwg` startet einen neuen `DwgWorkerClient`; ein vorheriger Import wird beendet.
3. Der Worker lädt `/wasm/libredwg-web.wasm` und normalisiert die Zeichnung. Parser-Rohdaten bleiben im Arbeitsspeicher verfügbar, damit HATCH-Begrenzungspfade ausgewertet werden können.
4. `convertCadDocument` löst INSERT/Block-Verweise rekursiv bis maximal 32 Ebenen auf.
5. Geometrien werden zunächst im WCS der DWG als LUREF behandelt. Die LUREF-Ausdehnung wird vor der Transformation ermittelt; die dichteste plausible Modellgruppe bestimmt den Startausschnitt.
6. OpenLayers transformiert die Geometrien von `EPSG:2169` nach `EPSG:3857`.
7. Eine gemeinsame Vektorquelle rendert alle Features. Die Style-Funktion prüft `layerId`, automatisch erkannte Ausreißer und manuell ausgeblendete Objekt-IDs.
8. Beim Ersetzen oder Entfernen werden alte Features und Dateireferenzen verworfen.

DWG-Bytes und abgeleitete Geometrien leben nur im Arbeitsspeicher der laufenden Browser-Sitzung.

## Projektionen und Basiskarte

- DWG/WCS und Anzeige der Koordinaten: `EPSG:2169` (LUREF)
- Kartenansicht: `EPSG:3857`
- Standard: WMTS `ortho_2025`, Matrix-Set `GLOBAL_WEBMERCATOR_4_V3`
- Fallback: WMS `ortho_latest`

Die Proj4-Definition wurde aus der bestehenden Desktop-Integration übernommen. Die Haupt-Codebase wurde dabei ausschließlich gelesen.

## CAD-Unterstützung

Direkt umgesetzt sind Linien, Polylinien einschließlich Bulge-Bögen, Kreise, Bögen, Ellipsen, Splines als Stützpunktapproximation, Punkte, Texte, Solid/Hatch-Umrisse und rekursive Blöcke. HATCH-Begrenzungen werden sowohl aus dem normalisierten Dokument als auch aus LibreDWG-Rohpfaden gelesen; nicht rekonstruierbare Schraffuren werden gemeldet. Papierbereich wird verworfen. Z-Werte werden auf XY abgeflacht und gemeldet. Fehlende oder zyklische Blöcke sowie unbekannte Elementtypen erzeugen Hinweise.

Jedes Feature besitzt eine stabile Objekt-ID, einen CAD-Typ und eine `layerId`. Ein Kartentipp selektiert das oberste sichtbare CAD-Feature. Die Auswahl kann einzeln oder zusammen mit ihrem Layer ausgeblendet werden. Sobald nationale LUREF-Objekte vorhanden sind, werden Objekte mit Mittelpunkt außerhalb `[30000, 50000, 130000, 160000]` zunächst ausgeblendet; der Nutzer kann sie vollständig wiederherstellen.

Textfeatures tragen zusätzlich `isCadText`. Die gemeinsame Style-Funktion kann damit alle TEXT-/MTEXT-Features unabhängig von ihren Layern in einem Schritt ausblenden.

## Mobile Ebenen und Drawer

Der Datei-, Auswahl- und Hinweisbereich ist ein Bottom-Drawer. Im geschlossenen Zustand bleiben nur eine Wiederöffnungstaste und die Karte sichtbar. Der Layer-Dialog ist ein zweiter Bottom-Sheet-Drawer. Beide Drawer liegen bewusst über dem `site-info-banner`; im normalen geschlossenen Kartenmodus bleiben Banner, Attribution und Wiederöffnungstaste räumlich getrennt.

`site-info-banner` 1.1.0 wird als Web Component eingebunden. Das geprüfte Release-Archiv liegt versioniert unter `vendor/`, weil das Paket nicht im öffentlichen npm-Registry verfügbar ist. Netlify kann die Abhängigkeit dadurch ohne privaten GitHub-Zugriff reproduzierbar installieren.

## Standort

`watchPosition` liefert laufende WGS84-Positionen. OpenLayers transformiert sie nach Web Mercator. Marker und Genauigkeitskreis liegen in einer eigenen Vektorebene. Eine manuelle Kartenbewegung setzt den Follow-Zustand auf `paused`; der Nutzer kann folgen, stoppen oder wieder aufnehmen.

## Sicherheits- und Datenschutzgrenze

Es gibt keine Upload-URL, API, Function, Datenbank oder Browserpersistenz. Geoportail erhält ausschließlich normale Kartenkachel-Anfragen; DWG-Inhalte werden nicht an Geoportail oder Netlify gesendet.
