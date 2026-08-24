# DWG to Geoportail

Mobile-first Webprototyp zum lokalen Anzeigen einer 2D-DWG mit absoluten LUREF-Koordinaten (`EPSG:2169`) über dem Geoportail-Orthofoto.

## Funktionen

- Geoportail `ortho_2025` per WMTS, mit `ortho_latest` per WMS als automatischem Fallback
- browserlokaler DWG-Import im LibreDWG-WASM-Worker
- 2D-Modellbereich mit Linien, Polylinien, Bögen, Kreisen, Ellipsen, Splines, Punkten, Texten, Schraffuren und rekursiven Blöcken
- sichtbare DWG-Layer einzeln oder gemeinsam schalten
- CAD-Objekte antippen, Elementtyp und Layer sehen sowie Objekt oder Layer ausblenden
- Bedien- und Ebenenbereich als wiederverwendbare, animierte mobile Bottom-Sheets
- kompakter Objekt-Drawer öffnet sich automatisch bei einer CAD-Auswahl
- ausklappbare CAD-Aktionen für Texte und die Wiederherstellung aller ausgeblendeten Objekte
- LUREF-Ausreißer automatisch ausblenden und jederzeit wiederherstellen
- CAD-Farben mit kontrastierendem Halo über dem Orthofoto
- Live-Standort mit Genauigkeitskreis und pausierbarer Kartenfolge
- vollständig mobile Oberfläche in Deutsch, Französisch und Englisch
- BF.lu-Logo, Geoportail-Hinweis und Versionsinformation über `site-info-banner`
- keine Übertragung, Speicherung, Datenbank oder Serverfunktion für DWG-Daten

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

Der Build erzeugt `dist/` einschließlich der benötigten Dateien unter `dist/wasm/`.

## Grenzen von Version 0.1.4

- nur DWG, 2D-Modellbereich und absolute LUREF-Meterkoordinaten
- keine Xrefs, Papierlayouts, 3D-Darstellung oder persistente Speicherung
- Dateien über 10 MB werden gewarnt, können aber importiert und abgebrochen werden
- Schraffuren ohne auswertbare Begrenzung sowie proprietäre Musterfüllungen werden ausgelassen und gemeldet

Weitere Informationen: [Architektur](docs/architecture.md), [Netlify](docs/netlify.md), [Tests](docs/testing.md) und [Release 0.1.4](docs/releases/0.1.4.md).

## Lizenz und Quellcode

Dieses Projekt ist unter `AGPL-3.0-only` lizenziert. Bei öffentlichem Betrieb muss der vollständige, zur bereitgestellten Version passende Quellcode für alle Nutzer zugänglich bleiben. Drittanbieterhinweise stehen in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
