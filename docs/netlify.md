# Netlify-Konfiguration 0.3.0

## Bereitstellung

Für Version 0.3.0 wird kein manueller Netlify-Deploy ausgeführt. Das vorhandene Git-basierte Netlify-Projekt übernimmt Build und Veröffentlichung erst nach einem späteren Push auf `main`.

Die Anwendung benötigt keine Netlify Function, kein Upload-Ziel, keine Dokumentdatenbank und keine Umgebungsvariable. DWG-Dateien werden ausschließlich im Browser des Nutzers verarbeitet.

## Build und Routing

`netlify.toml` definiert:

- Build: `npm run build`
- Publish-Verzeichnis: `dist`
- SPA-Fallback: unbekannte Pfade liefern `/index.html`

Der SPA-Fallback ist für den direkten Aufruf von `/mlightcad` erforderlich. Die MLightCAD-Seite bleibt ein lazy geladener Chunk; der Einstieg unter `/` soll ihn nicht vorab laden.

## Statische Viewerdateien

Der Build erzeugt die gemeinsame DWG-Laufzeit unter `dist/mlightcad-workers/0.3.0/`:

- `libredwg-parser-worker.js`
- `libredwg-web-api.js`
- `libredwg-web.js`
- `libredwg-web.wasm`
- `mtext-renderer-worker.js`

`libredwg-web-api.js` und die zugehörige Emscripten-Laufzeit `libredwg-web.js` liegen bewusst nebeneinander im versionierten Verzeichnis; der Build schreibt den relativen Paketimport reproduzierbar auf diese flache Release-Struktur um. `libredwg-web.wasm` wird beim Vite-Build auf 128 MiB deklarierten Anfangsspeicher gepatcht. Die WASM-Response muss `Content-Type: application/wasm` liefern. Beide Viewer verwenden diese Laufzeit; die frühere Flyfish-WASM-Kopie unter `/wasm/` wird nicht mehr gebaut oder angefordert.

## Versionierung und Cache

Version 0.3.0 ändert den Inhalt des LibreDWG-WASM. Deshalb verwenden Build und Laufzeit ausschließlich den neuen URL-Baum:

- `/mlightcad-workers/0.3.0/*`

`netlify.toml` darf diesen Verzeichnisbaum mit `public, max-age=31536000, immutable` ausliefern. Die Versionskomponente sorgt dafür, dass ein Browser mit einer früher gecachten 0.2.x-Datei den neuen 0.3.0-URL anfordert. Ein zukünftiger Release, der Worker oder WASM ändert, muss einen neuen Versionspfad erhalten; ein Überschreiben derselben immutable URL ist nicht zulässig.

## Externe Laufzeitanfragen

- Geoportail liefert WMTS- beziehungsweise WMS-Bilder vom offiziellen Open-Data-Endpunkt.
- Während eines funktionierenden WMS-Fallbacks führt die App kontrollierte WMTS-Recovery-Proben aus.
- MLightCAD lädt unterstützende CAD-/Schriftressourcen von `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/`.

Keine dieser Anfragen enthält die ausgewählte DWG. Es existiert kein App-Endpunkt für DWG-Bytes.

Ein vollständig netzunabhängiger Betrieb ist wegen Karte und externer MLightCAD-Ressourcen nicht zugesichert. Fällt Geoportail aus, bleibt CAD auf schwarzem Hintergrund bedienbar. Die jsDelivr-URL folgt weiterhin dem Branch `main` und ist dadurch nicht über `package-lock.json` inhaltsfixiert.

## Abnahme nach Git-Bereitstellung

- Build-Log auf erfolgreichen TypeScript-/Vite-Build prüfen.
- `/` und `/mlightcad` direkt per HTTPS öffnen und neu laden.
- alle Dateien unter `/mlightcad-workers/0.3.0/` mit korrektem Content-Type abrufen.
- für das WASM 128 MiB Anfangsspeicher und gültiges WebAssembly bestätigen.
- für den Releasepfad `public, max-age=31536000, immutable` prüfen und einen Browser mit einem alten 0.2.x-Cache ausdrücklich testen.
- WMTS `ortho_2025`, Retry, WMS `ortho_latest`, Offlinezustand und Rückwechsel nach zwei erfolgreichen WMTS-Proben prüfen.
- beide Viewer mit einer lokalen LUREF-DWG testen, ohne Dateiinhalte im Netzwerkprotokoll zu sehen.
- Recovery-Marker kontrollieren: nur Name, Größe und Startzeit, keine Dateidaten.
- adaptive Vorbereitung, Block-Drawer und Viewerwechsel auf echtem iOS Safari und Android Chrome abnehmen.
- öffentlich erreichbaren Link auf den exakt bereitgestellten `AGPL-3.0-only`-Quellstand anbieten.
