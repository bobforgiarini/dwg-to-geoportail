# Netlify-Konfiguration 0.7.0

## Bereitstellung

Version 0.7.0 wird über das vorhandene Git-basierte Netlify-Projekt gebaut und veröffentlicht, sobald der zugehörige Stand auf `main` liegt. Ein separater manueller Deploy ist nicht erforderlich.

Die Anwendung benötigt keine Netlify Function, kein Upload-Ziel, keine Dokumentdatenbank und keine Umgebungsvariable. DWG-Dateien werden ausschließlich im Browser des Nutzers verarbeitet.

Dateiauswahl und Desktop-Drag-and-drop sind reine Browser-Einstiege in denselben lokalen Importpfad. Auch eine gedroppte oder ersetzte DWG wird nicht an Netlify übertragen.

## Build und Routing

`netlify.toml` definiert:

- Build: `npm run build`
- Publish-Verzeichnis: `dist`
- permanenter Redirect: `/openlayers` liefert `301` auf `/`
- SPA-Fallback: unbekannte Pfade liefern `/index.html`

Der Redirect steht vor dem SPA-Fallback, damit alte gespeicherte Links nicht vom Client aufgelöst werden müssen. `/` startet den einzigen MLightCAD-CAD-Viewer. OpenLayers bleibt innerhalb dieser Seite ausschließlich die Kartenbasis.

## Statische Viewerdateien

Der Build erzeugt die gemeinsame DWG-Laufzeit unter `dist/mlightcad-workers/0.3.0/`:

- `libredwg-parser-worker.js`
- `libredwg-web-api.js`
- `libredwg-web.js`
- `libredwg-web.wasm`
- `mtext-renderer-worker.js`

`libredwg-web-api.js` und die zugehörige Emscripten-Laufzeit `libredwg-web.js` liegen bewusst nebeneinander im versionierten Verzeichnis; der Build schreibt den relativen Paketimport reproduzierbar auf diese flache Release-Struktur um. `libredwg-web.wasm` wird beim Vite-Build auf 128 MiB deklarierten Anfangsspeicher gepatcht. Die WASM-Response muss `Content-Type: application/wasm` liefern. Die API wird direkt aus dem festgeschriebenen Paket `@mlightcad/libredwg-web` 0.7.10 kopiert.

## App-Versionierung und Cache

Die App- und Kopfbereichsversion wird direkt aus `package.json` gelesen, damit UI, Paketmetadaten und Release-Dokumentation denselben Stand verwenden.

Version 0.7.0 ändert den Inhalt der bereits mit 0.3.0 eingeführten LibreDWG-Laufzeit nicht. Build und Laufzeit verwenden deshalb weiterhin den unveränderten URL-Baum:

- `/mlightcad-workers/0.3.0/*`

`netlify.toml` darf diesen Verzeichnisbaum mit `public, max-age=31536000, immutable` ausliefern. Die Versionskomponente sorgt dafür, dass ein Browser mit einer früher gecachten 0.2.x-Datei den neuen 0.3.0-URL anfordert. Die App-Version muss nicht ohne Inhaltsänderung auf den statischen Workerpfad übertragen werden. Ein zukünftiger Release, der Worker oder WASM ändert, muss dagegen einen neuen Versionspfad erhalten; ein Überschreiben derselben immutable URL ist nicht zulässig.

## Externe Laufzeitanfragen

- Geoportail liefert WMTS- beziehungsweise WMS-Bilder vom offiziellen Open-Data-Endpunkt.
- Während eines funktionierenden WMS-Fallbacks führt die App kontrollierte WMTS-Recovery-Proben aus.
- MLightCAD lädt unterstützende CAD-/Schriftressourcen von `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/`.
- Erst nach einer ausdrücklichen Positionsaktion öffnet der Browser optional Geoportail, Google Maps, Apple Maps oder Google Street View mit der gewählten Koordinate in einem neuen Tab.

Keine dieser Anfragen enthält die ausgewählte DWG. Die optionalen Kartenlinks übertragen ausschließlich die vom Nutzer gewählte Position an den jeweiligen Zielanbieter. Es existiert kein App-Endpunkt für DWG-Bytes.

Ein vollständig netzunabhängiger Betrieb ist wegen Karte und externer MLightCAD-Ressourcen nicht zugesichert. Fällt Geoportail aus, bleibt CAD auf schwarzem Hintergrund bedienbar. Die jsDelivr-URL folgt weiterhin dem Branch `main` und ist dadurch nicht über `package-lock.json` inhaltsfixiert.

## Abnahme nach Git-Bereitstellung

- Build-Log auf erfolgreichen TypeScript-/Vite-Build prüfen.
- `/` direkt per HTTPS öffnen und neu laden; `/openlayers` muss permanent auf `/` umleiten.
- die im Kopf angezeigte Version muss mit `package.json` übereinstimmen.
- alle Dateien unter `/mlightcad-workers/0.3.0/` mit korrektem Content-Type abrufen.
- für das WASM 128 MiB Anfangsspeicher und gültiges WebAssembly bestätigen.
- für den Releasepfad `public, max-age=31536000, immutable` prüfen und einen Browser mit einem alten 0.2.x-Cache ausdrücklich testen.
- WMTS `ortho_2025`, Retry, WMS `ortho_latest`, Offlinezustand und Rückwechsel nach zwei erfolgreichen WMTS-Proben prüfen.
- den Viewer mit einer lokalen LUREF-DWG testen, ohne Dateiinhalte im Netzwerkprotokoll zu sehen.
- Recovery-Marker kontrollieren: nur Name, Größe und Startzeit, keine Dateidaten.
- adaptive Vorbereitung sowie Layer-/Block-, Settings- und DWG-Drawer auf echtem iOS Safari und Android Chrome abnehmen; der Layer-Drawer muss Suche, Sichtbarkeitszähler, Objektzahlen, Belastungs-Badges und Neuladehinweise zeigen.
- Desktop-Drag-and-drop samt Replace-Bestätigung sowie Rechtsklick- und mobile Langdruck-Positionsaktionen über HTTPS prüfen.
- öffentlich erreichbaren Link auf den exakt bereitgestellten `AGPL-3.0-only`-Quellstand anbieten.
