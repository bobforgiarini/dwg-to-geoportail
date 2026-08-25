# Netlify-Konfiguration 0.2.1

## Bereitstellungsstatus

Für Version 0.2.1 wird kein manueller Netlify-Deploy ausgeführt. Das vorhandene Git-basierte Netlify-Projekt übernimmt Build und Veröffentlichung automatisch nach dem Push auf `main`.

Die Anwendung benötigt keine Netlify Function, kein Upload-Ziel, keine Dokumentdatenbank und keine Umgebungsvariable. DWG-Dateien werden ausschließlich vom Browser des Nutzers verarbeitet.

## Build und Publish-Verzeichnis

`netlify.toml` definiert:

- Build: `npm run build`
- Publish: `dist`
- SPA-Fallback: alle unbekannten Serverpfade liefern `/index.html`

Der Fallback ist erforderlich, damit neben `/` auch ein direkter Aufruf von `/mlightcad` funktioniert. Bei einer Git-basierten Bereitstellung liest Netlify diese Werte automatisch. Für eine manuelle Bereitstellung muss zuerst lokal der Produktionsbuild erstellt und anschließend ausschließlich das vollständige Verzeichnis `dist/` veröffentlicht werden.

## Statische Viewerdateien

Die bestehende Pipeline erzeugt unter `dist/wasm/`:

- `dwg-worker.js`
- `libredwg-web.js`
- `libredwg-web.wasm`
- `dwfv-render.wasm`

Die MLightCAD-Pipeline erzeugt getrennt unter `dist/mlightcad-workers/`:

- `libredwg-parser-worker.js`
- `libredwg-web.wasm`
- `mtext-renderer-worker.js`

`netlify.toml` setzt für `*.wasm` in beiden Verzeichnissen den Content-Type `application/wasm`. Das Cache-Verhalten ist absichtlich unterschiedlich:

- `/wasm/*`: `public, max-age=31536000, immutable`
- `/mlightcad-workers/*`: `public, max-age=0, must-revalidate`

Die absoluten Laufzeitpfade `/wasm/` und `/mlightcad-workers/` setzen voraus, dass die Anwendung am Ursprung der Netlify-Site veröffentlicht wird.

### Cache-Verhalten bei Updates

Die MLightCAD-Dateien werden bei jeder Verwendung revalidiert. Ein neuer Deploy kann deshalb aktualisierte Inhalte unter denselben `/mlightcad-workers/`-URLs bereitstellen, ohne dass ein einjähriger Immutable-Browsercache die vorherige Fassung festhält.

Die ältere `/wasm/`-Pipeline behält ihr langfristiges Immutable-Caching. Sollen deren unversionierte Dateien später inhaltlich geändert werden, müssen die Assetpfade beziehungsweise Dateinamen versioniert oder die Cache-Regeln vorab geändert werden.

Die MLightCAD-Seite selbst ist ein lazy geladener JavaScript-Chunk. Erst ein Aufruf von `/mlightcad` lädt diesen Chunk und die darin referenzierten MLightCAD-/Three.js-Bibliotheken.

## Externe Laufzeitanfragen

- Geoportail liefert WMTS-/WMS-Kartenbilder.
- MLightCAD verwendet die konfigurierte Quelle `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/` für unterstützende CAD-/Schriftressourcen.
- Die Anwendung besitzt keinen Endpunkt, der eine ausgewählte DWG empfängt. Die Datei wird weder an Netlify noch an diese externen Quellen übertragen.

Ein vollständig netzunabhängiger Betrieb ist mit der aktuellen externen MLightCAD-Ressourcenquelle nicht zugesichert. Die URL folgt außerdem dem Branch `main`; `package-lock.json` fixiert ihren Inhalt daher nicht. Für eine vollständig reproduzierbare Bereitstellung müssten diese Ressourcen separat versioniert und unter einer festen Basis-URL bereitgestellt werden.

## Abnahme nach einer Bereitstellung

- Build-Log und alle Dateien unter `/wasm/` sowie `/mlightcad-workers/` prüfen.
- `/`, `/mlightcad` und einen direkten Browser-Neuladevorgang auf `/mlightcad` testen.
- In den Browser-Werkzeugen erfolgreiche Worker- und WASM-Antworten mit korrektem Content-Type prüfen.
- für `/mlightcad-workers/*` `max-age=0, must-revalidate` und für `/wasm/*` den langfristigen Immutable-Header prüfen.
- OpenLayers- und MLightCAD-Chunktrennung kontrollieren: der initiale Aufruf von `/` soll den MLightCAD-Viewer nicht aktivieren.
- Geoportail-WMTS und den sichtbaren WMS-Fallback prüfen.
- reale LUREF-DWG ausschließlich lokal in beiden Viewern abnehmen; Lage, Layer, Auswahl, Deckkraft und bekannte Einschränkungen dokumentieren.
- HTTPS-Standortfunktion in iOS Safari und Android Chrome testen.
- öffentlich zugänglichen Link auf den exakt eingesetzten `AGPL-3.0-only`-Quellcode bereitstellen.
