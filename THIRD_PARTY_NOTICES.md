# Drittanbieterhinweise

Version 0.2.1 verwendet Open-Source-Bibliotheken aus `package-lock.json`. Die jeweiligen Pakete behalten ihre eigenen Lizenzbedingungen; die vollständigen installierten Fassungen sind für reproduzierbare Builds über `package-lock.json` festgelegt.

## Anwendungslizenz

DWG to Geoportail wird insgesamt unter `AGPL-3.0-only` verteilt; der vollständige Text steht in `LICENSE`. Bei jeder öffentlich bereitgestellten Version muss der zugehörige vollständige Quellcode erreichbar sein.

## site-info-banner 1.1.0

- Projekt: <https://github.com/bobforgiarini/site-info-banner>
- Lizenz: MIT
- Das unveränderte Release-Archiv liegt unter `vendor/site-info-banner-1.1.0.tgz`.
- Das Web Component steht unten rechts, zeigt exakt „Powered by bf.lu“ und „© Map: geoportail.lu“ und verlinkt Geoportail Luxembourg. Die Anwendungsversion steht separat im App-Kopf.

## Bestehender CAD-Viewer

### @flyfish-dev/cad-viewer 0.8.0

- Projekt: <https://github.com/flyfish-dev/cad-viewer>
- Lizenz: GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)
- Enthält beziehungsweise verwendet LibreDWG-WebAssembly für die lokale DWG-Verarbeitung unter `/wasm/`.
- Lizenz- und NOTICE-Texte der installierten Version befinden sich im npm-Paket unter `node_modules/@flyfish-dev/cad-viewer/`.

## MLightCAD-Kern

Die eingebundenen MLightCAD-Kernkomponenten stehen laut Paketmetadaten unter MIT:

- `@mlightcad/cad-simple-viewer` 1.6.3
- `@mlightcad/data-model` 1.14.2
- `@mlightcad/mtext-renderer` 0.12.4
- `@mlightcad/three-renderer` 1.6.3
- zugehörige transitive MLightCAD-Kernpakete wie `common`, `geometry-engine` und `graphic-interface`

Projektquellen: <https://github.com/mlightcad/cad-viewer> und <https://github.com/mlightcad/realdwg-web>.

## MLightCAD-LibreDWG-Pfad

- `@mlightcad/libredwg-converter` 3.14.2: GNU General Public License v3.0 (`GPL-3.0`)
- der verwendete transitive Parser `@mlightcad/libredwg-web`: GNU General Public License v3.0 (`GPL-3.0`)
- Projektquellen: <https://github.com/mlightcad/realdwg-web> und <https://github.com/mlightcad/libredwg-web>
- Parser-Worker und WASM werden für die Browserausführung nach `/mlightcad-workers/` kopiert.

Die MIT-Lizenz des MLightCAD-Kerns ändert nicht die GPL-Bedingungen des für DWG aktivierten LibreDWG-Konverters. Die Anwendung bleibt als Gesamtprojekt unter `AGPL-3.0-only`; GPL-Komponenten behalten ihre jeweiligen Hinweise und Bedingungen.

## Geoportail Luxembourg Open Data

- Dienstübersicht: <https://data.public.lu/en/datasets/carte-de-base-webservices-wms-et-wmts/>
- Die Oberfläche zeigt den Geoportail-Diensthinweis und Link im Site-Banner.

## Externe MLightCAD-Ressourcen

Der MLightCAD-Adapter verwendet zur Laufzeit `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/` als Basis für unterstützende CAD-/Schriftressourcen. Diese Anfrage betrifft keine ausgewählte DWG-Datei; die DWG bleibt im lokalen Browser-Arbeitsspeicher. Da die URL dem Branch `main` folgt, werden diese externen Laufzeitressourcen nicht durch `package-lock.json` festgeschrieben.

## Weitere Bibliotheken

React, Vite, OpenLayers, proj4, Three.js, lodash-es, lucide-react, i18next, Vitest und die Netlify-Vite-Integration werden entsprechend ihren jeweiligen Paketlizenzen verwendet. Die exakten Versionen und transitiven Abhängigkeiten sind in `package-lock.json` festgehalten.
