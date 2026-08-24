# Netlify-Konfiguration

## Git-basierte Bereitstellung

1. Dieses Repository in ein eigenes GitHub-Repository übertragen.
2. In Netlify **Add new project → Import an existing project** wählen.
3. Das GitHub-Repository verbinden.
4. Netlify liest automatisch `netlify.toml`:
   - Build: `npm run build`
   - Publish: `dist`
5. Kein Datenbankdienst, keine Functions und keine Umgebungsvariablen sind für 0.1.0 erforderlich.

Jeder Push auf den in Netlify gewählten Produktionsbranch kann dadurch automatisch gebaut und veröffentlicht werden.

## Statische Assets

Der Vite-Build kopiert diese Paketdateien nach `dist/wasm/`:

- `dwg-worker.js`
- `libredwg-web.js`
- `libredwg-web.wasm`
- `dwfv-render.wasm`

`netlify.toml` setzt lange Cache-Zeiten für `/wasm/*`, den korrekten WASM-Content-Type und einen SPA-Fallback auf `index.html`.

## Abnahme nach der Verknüpfung

- Build-Log und Vorhandensein der vier `/wasm/`-Assets prüfen.
- HTTPS-Seite unter iOS Safari und Android Chrome öffnen.
- Geoportail-Attribution, WMTS und WMS-Fallback prüfen.
- Standort erlauben, Live-Aktualisierung und Genauigkeitskreis kontrollieren.
- reale LUREF-DWG importieren und Lage sowie Layernamen abgleichen.
- öffentlich zugänglichen Link auf den exakt eingesetzten AGPL-Quellcode bereitstellen.

Codex hat für Version 0.1.0 weder ein Netlify-Projekt verknüpft noch einen Deploy ausgeführt.
