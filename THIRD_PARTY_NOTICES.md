# Drittanbieterhinweise

Version 0.1.3 verwendet Open-Source-Bibliotheken aus `package-lock.json`. Besonders relevant für die Verteilung sind:

## site-info-banner 1.1.0

- Projekt: <https://github.com/bobforgiarini/site-info-banner>
- Lizenz: MIT
- Das unveränderte Release-Archiv liegt für reproduzierbare Builds unter `vendor/site-info-banner-1.1.0.tgz`.
- Das Web Component zeigt Copyright, Anwendungsversion und den Link zum veröffentlichten Quellcode.

## @flyfish-dev/cad-viewer 0.8.0

- Projekt: <https://github.com/flyfish-dev/cad-viewer>
- Lizenz: GNU Affero General Public License v3.0 only (`AGPL-3.0-only`)
- Enthält beziehungsweise verwendet LibreDWG-WebAssembly zur lokalen DWG-Verarbeitung.
- Die vollständigen Lizenz- und NOTICE-Texte der installierten Version befinden sich im npm-Paket unter `node_modules/@flyfish-dev/cad-viewer/`.

Da diese Anwendung den CAD-Viewer im Browser an Nutzer ausliefert, steht die gesamte Anwendung ebenfalls unter `AGPL-3.0-only`. Bei jeder bereitgestellten Version muss der zugehörige vollständige Quellcode erreichbar sein.

## Geoportail Luxembourg Open Data

- Dienstübersicht: <https://data.public.lu/en/datasets/carte-de-base-webservices-wms-et-wmts/>
- Die Kartenansicht zeigt die vom Dienst gelieferte Attribution unmittelbar in der Karte an.

## Weitere Bibliotheken

React, Vite, OpenLayers, proj4, lucide-react, i18next, Vitest und die Netlify-Vite-Integration werden entsprechend ihren jeweiligen Paketlizenzen verwendet. Die exakten Versionen und transitiven Abhängigkeiten sind in `package-lock.json` festgehalten.
