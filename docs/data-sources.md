# Datenquellen 0.5.1

Die Anwendung verarbeitet ausgewählte Haupt-DWGs und lokale XRefs ausschließlich im Browser. Diese Dateien sind Nutzerdaten und keine Datenquelle des Projekts: Sie werden weder hochgeladen noch im Repository, in einer Datenbank, in IndexedDB oder in Netlify-Speicher abgelegt.

## Geoportail Luxembourg

Die Hintergrundkarte stammt aus den offiziellen Open-Data-Kartendiensten von Geoportail Luxembourg:

- Übersicht: <https://data.public.lu/en/datasets/bd-l-ortho-webservices-wms-et-wmts/>
- Dienstendpunkt: `https://wmts1.geoportail.lu/opendata/service`
- bevorzugt: WMTS-Layer `ortho_2025` mit Matrix-Set `GLOBAL_WEBMERCATOR_4_V3`
- Fallback: WMS-Layer `ortho_latest`
- optionale transparente Kataster-Overlays: WMTS-Layer `parcels` und `parcels_labels`, Format `image/png`, Matrix-Set `GLOBAL_WEBMERCATOR_4_V3`

Der optionale Katasterdienst mit Parzellengrenzen und -nummern ist im offiziellen Datensatz **Plan cadastral numérisé (PCN) – Webservices WMS et WMTS** dokumentiert:

- Datensatz: <https://data.public.lu/fr/datasets/plan-cadastral-numerise-pcn-webservices-wms-et-wmts/>
- Dienstendpunkt: `https://wmts1.geoportail.lu/opendata/service`

OpenLayers lädt Kartenbilder direkt vom Geoportail-Dienst. Es werden keine DWG-Bytes in Kartenanfragen eingebettet. Der Diensthinweis „© Map: geoportail.lu“ bleibt im Site-Banner sichtbar.

## Landesgrenze Luxemburg

Der räumliche CAD-Filter basiert auf dem offiziellen Datensatz **Limites administratives du Grand-Duché de Luxembourg** der Administration du cadastre et de la topographie (ACT):

- Datensatz: <https://data.public.lu/en/datasets/limites-administratives-du-grand-duche-de-luxembourg/>
- stabiles Ressourcen-Permalink: <https://data.public.lu/en/datasets/r/39af91a6-9ce4-4c18-8271-313b3ad7c7f5>
- verwendete Quelldatei: `limadmin.geojson`, abgerufen am 27. August 2026
- SHA-256 der Quelldatei: `86f02293e9e41d5874611a37fbd153e86a5e7b170e19a71fcfd7f3caefaad5b0`
- Lizenz: CC0 1.0

Die Quelldatei selbst wird nicht ausgeliefert. Das eingecheckte Asset `src/lib/cad/data/luxembourgBoundary.epsg2169.json` enthält nur die Landesgeometrie `pays`, transformiert nach LUREF `EPSG:2169` und mit fünf Metern Toleranz vereinfacht. Es dokumentiert außerdem den für die Laufzeit verwendeten Puffer von exakt 1.000 Metern. Der Browser lädt zur Filterung keine Grenzdaten aus dem Netz.

Der reproduzierbare, netzwerkfreie Erzeugungsschritt ist in [luxembourg-boundary-filter.md](luxembourg-boundary-filter.md) beschrieben.

## MLightCAD-Unterstützungsdaten

MLightCAD lädt unterstützende CAD- und Schriftressourcen von:

`https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/`

Die Anfrage enthält keine ausgewählte DWG oder abgeleitete Geometrie. Da die URL auf den Branch `main` verweist, sind diese externen Ressourcen nicht durch `package-lock.json` festgeschrieben. Fehlende CAD-Schriften können vom Renderer ersetzt werden. Nach dem Renderstart übernimmt die App dessen `missedFonts` bestmöglich in den Importbericht; nicht erkannte oder bereits vom Parser ausgelassene Verwendungen können darin fehlen.

## Reproduzierbarkeit und Datenschutz

- npm-Bibliotheken und transitive Abhängigkeiten sind über `package-lock.json` festgelegt.
- Der ACT-Ausschnitt ist lokal, gehasht und reproduzierbar erzeugt.
- Geoportail und jsDelivr erhalten ausschließlich die für Karte beziehungsweise unterstützende Renderer-Assets nötigen Anfragen.
- Haupt-DWG, XRefs, Preflight-Bericht und abgeleitete CAD-Geometrie verbleiben in der aktuellen Browser-Sitzung.

Lizenzdetails stehen in [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md).
