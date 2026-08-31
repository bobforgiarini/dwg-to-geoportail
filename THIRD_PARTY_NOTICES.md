# Drittanbieterhinweise

Version 0.7.0 verwendet Open-Source-Bibliotheken aus `package-lock.json`. Die jeweiligen Pakete behalten ihre eigenen Lizenzbedingungen; die vollständigen installierten Fassungen sind für reproduzierbare Builds über `package-lock.json` festgelegt.

## Anwendungslizenz

DWG to Geoportail wird insgesamt unter `AGPL-3.0-only` verteilt; der vollständige Text steht in `LICENSE`. Bei jeder öffentlich bereitgestellten Version muss der zugehörige vollständige Quellcode erreichbar sein.

## site-info-banner 1.1.0

- Projekt: <https://github.com/bobforgiarini/site-info-banner>
- Lizenz: MIT
- Das unveränderte Release-Archiv liegt unter `vendor/site-info-banner-1.1.0.tgz`.
- Das Web Component steht unten rechts, zeigt exakt „Powered by bf.lu“ und „© Map: geoportail.lu“ und verlinkt Geoportail Luxembourg. Die Anwendungsversion steht separat im App-Kopf.

## MLightCAD-Kern

Die eingebundenen MLightCAD-Kernkomponenten stehen laut Paketmetadaten unter MIT:

- `@mlightcad/cad-simple-viewer` 1.6.3
- `@mlightcad/data-model` 1.14.2
- `@mlightcad/mtext-renderer` 0.12.4
- `@mlightcad/three-renderer` 1.6.3
- zugehörige transitive MLightCAD-Kernpakete wie `common`, `geometry-engine` und `graphic-interface`

Projektquellen: <https://github.com/mlightcad/cad-viewer> und <https://github.com/mlightcad/realdwg-web>.

Seit Version 0.7.0 ist MLightCAD der einzige CAD-Renderer. `@flyfish-dev/cad-viewer` und die frühere Flyfish-/OpenLayers-CAD-Pipeline gehören nicht mehr zum Laufzeit- oder Abhängigkeitsgraphen. OpenLayers selbst bleibt für die Kartenbasis unter seiner eigenen Paketlizenz enthalten.

## MLightCAD-LibreDWG-Pfad

- `@mlightcad/libredwg-converter` 3.14.2: GNU General Public License v3.0 (`GPL-3.0`)
- der direkt festgeschriebene Parser `@mlightcad/libredwg-web` 0.7.10: GNU General Public License v3.0 (`GPL-3.0`)
- Projektquellen: <https://github.com/mlightcad/realdwg-web> und <https://github.com/mlightcad/libredwg-web>
- Parser-Worker, öffentliche LibreDWG-API, zugehörige Emscripten-JavaScript-Laufzeit und WASM werden für die Browserausführung nach `/mlightcad-workers/0.3.0/` kopiert.

Die MIT-Lizenz des MLightCAD-Kerns ändert nicht die GPL-Bedingungen des für DWG aktivierten LibreDWG-Konverters. Die Anwendung bleibt als Gesamtprojekt unter `AGPL-3.0-only`; GPL-Komponenten behalten ihre jeweiligen Hinweise und Bedingungen.

Der Produktionsbuild transformiert weiterhin die Memory-Section der ausgelieferten `libredwg-web.wasm`-Datei reproduzierbar: Der deklarierte Initialspeicher wird auf 2.048 WASM-Seiten beziehungsweise 128 MiB begrenzt, während vorhandenes Maximum und Memory-Growth-Flags unverändert bleiben. Der anwendungseigene Transformationscode steht unter derselben `AGPL-3.0-only`-Lizenz wie die Anwendung; die transformierte LibreDWG-Binärdatei bleibt unter den GPL-Bedingungen ihres Ursprungspakets.

Diese Buildtransformation ist kein unabhängiger Ersatz-Parser und keine Änderung der LibreDWG-Lizenz. Sie wird mit einem Validierungstest abgesichert. Die bestehende Kompatibilitätskorrektur für fehlerhaft gepackte Windows-1252-`MULTILEADER`-Texte verarbeitet weiterhin ausschließlich das lokal zurückgegebene Parserergebnis im Anwendungscode.

## Geoportail Luxembourg Open Data

- Dienstübersicht: <https://data.public.lu/en/datasets/bd-l-ortho-webservices-wms-et-wmts/>
- Offizieller Open-Data-Endpunkt für WMTS `ortho_2025` und WMS `ortho_latest`: `https://wmts1.geoportail.lu/opendata/service`
- Die Oberfläche zeigt den Geoportail-Diensthinweis und Link im Site-Banner.

## ACT-Landesgrenze Luxemburg

- Datensatz: **Limites administratives du Grand-Duché de Luxembourg**
- Herausgeber: Administration du cadastre et de la topographie (ACT)
- Quelle: <https://data.public.lu/en/datasets/limites-administratives-du-grand-duche-de-luxembourg/>
- stabiles Ressourcen-Permalink: <https://data.public.lu/en/datasets/r/39af91a6-9ce4-4c18-8271-313b3ad7c7f5>
- Lizenz: CC0 1.0
- Quell-SHA-256: `86f02293e9e41d5874611a37fbd153e86a5e7b170e19a71fcfd7f3caefaad5b0`

Das Projekt liefert nicht die vollständige Quelldatei aus. `src/lib/cad/data/luxembourgBoundary.epsg2169.json` enthält die nationale Geometrie, transformiert nach `EPSG:2169` und mit fünf Metern Toleranz vereinfacht, einschließlich Herkunfts- und Buildmetadaten. Die Erzeugung ist in `docs/luxembourg-boundary-filter.md` dokumentiert. Der konfigurierte Laufzeit-Prüfbereich umfasst Luxemburg sowie einen exakt 1.000 Meter breiten Außenpuffer; daraus entsteht keine neue Einschränkung der CC0-Lizenz.

## Externe MLightCAD-Ressourcen

Der MLightCAD-Adapter verwendet zur Laufzeit `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/` als Basis für unterstützende CAD-/Schriftressourcen. Diese Anfrage betrifft keine ausgewählte DWG-Datei; die DWG bleibt im lokalen Browser-Arbeitsspeicher. Da die URL dem Branch `main` folgt, werden diese externen Laufzeitressourcen nicht durch `package-lock.json` festgeschrieben.

## Weitere Bibliotheken

React, Vite, OpenLayers, proj4, Three.js, lodash-es, lucide-react, i18next, Vitest und die Netlify-Vite-Integration werden entsprechend ihren jeweiligen Paketlizenzen verwendet. Die exakten Versionen und transitiven Abhängigkeiten sind in `package-lock.json` festgehalten.
