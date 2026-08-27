# Architektur 0.5.0

## Überblick

DWG to Geoportail ist eine statisch auslieferbare React-Single-Page-App ohne Backend, Upload-Endpunkt oder Dokumentdatenbank. Eine ausgewählte DWG bleibt im lokalen Browser und wird von genau einem aktiven CAD-Parser beziehungsweise Renderer verarbeitet.

| Route | CAD-Pipeline | Kartendarstellung |
| --- | --- | --- |
| `/` | MLightCAD, LibreDWG-Konverter und Three.js | transparenter CAD-WebGL-Canvas über OpenLayers in `EPSG:2169` |
| `/openlayers` | `@flyfish-dev/cad-viewer`, anwendungseigene Normalisierung und OpenLayers-Vektorfeatures | OpenLayers in `EPSG:3857` |

`RootApp` hält beide Routen im gemeinsamen `CadSessionProvider`. MLightCAD ist der Standard-Viewer und wird serverseitig beziehungsweise ohne Browserpfad als Ausgangszustand verwendet. Die frühere Route `/mlightcad` bleibt als kompatibler MLightCAD-Einstieg erhalten; `/openlayers` wählt ausschließlich die Legacy-Pipeline. Beide Viewer werden mit `React.lazy` als getrennte Routenmodule geladen. Immer nur ein CAD-Renderer ist gemountet; ein Viewerwechsel wartet auf den vollständigen Dispose-Pfad des vorherigen Renderers.

## Sitzung, Privatsphäre und Wiederanlauf

Die Sitzung hält ausschließlich im React-Arbeitsspeicher:

- die originale lokale Haupt-`File`-Referenz, lokal ergänzte XRef-Dateien und ihre Revision
- den aktiven Viewer
- den letzten `DwgPreflightReport`
- das `CadLoadProfile` mit ausgeblendeten Layern, Blöcken und Objektgruppen
- den gewählten Annotationsmaßstab und die Einstellung des Luxemburg-Filters
- globale CAD- und Füllungsdeckkraft sowie das Darstellungsprofil
- Text-, Objekt- und Zeichenreihenfolgezustände

Eine neue Datei setzt diese CAD-Zustände zurück. Beim Viewerwechsel bleibt das Profil erhalten, die Datei wird jedoch im Ziel-Viewer neu verarbeitet. Dadurch existieren nicht gleichzeitig zwei große CAD-Dokumente.

Vor einem Import schreibt `importRecovery` einen kleinen Marker mit Dateiname, Dateigröße und Startzeit in `localStorage`. Er enthält weder Dateibytes noch Geometrien. Nach Erfolg oder geordnetem Abbruch wird er gelöscht. Bleibt er nach einem harten Browser-/Tab-Abbruch zurück, empfiehlt die App beim nächsten Besuch eine vorbereitete Darstellung; die lokale Datei muss erneut ausgewählt werden.

Die DWG wird nicht in `localStorage`, IndexedDB, Netlify Blobs oder einer Datenbank gespeichert und nicht an Geoportail, jsDelivr oder einen Anwendungsserver übertragen.

## Adaptiver DWG-Preflight

Der Preflight dient als speichersparende Entscheidung vor dem teuren Aufbau von OpenLayers-Features beziehungsweise MLightCAD-Datenbank und Three.js-Szene:

1. Ein anwendungseigener, versionsgebundener Module-Worker liest und parst die Datei mit LibreDWG nativ.
2. Solange die native Struktur noch verfügbar ist, werden Annotationsmaßstäbe und externe Referenzen untersucht; lokal ergänzte XRefs werden sequenziell und zyklusgeschützt aufgelöst.
3. Aufgelöste Referenzen werden mit getrennten `XRefName|…`-Namensräumen in das Arbeitsmodell zusammengeführt.
4. Der konservative Luxemburg-Filter bewertet transformierte Ausdehnungen gegen das lokale, um 1.000 Meter erweiterte ACT-Grenzpolygon.
5. Noch im Worker erzeugt `analyzeCadDocument` einen kompakten Bericht über Layer, erreichbare Blockdefinitionen und -instanzen, rekursive Expansion, Objektarten und geschätzte Renderlast.
6. Liegt die Schätzung innerhalb des Gerätebudgets, läuft der Import automatisch vollständig weiter.
7. Bei erhöhter Last pausiert die Anwendung im Vorbereitungssheet.
8. Der Nutzer kann vollständig laden, das empfohlene Profil übernehmen, die Layer-/Blockauswahl anpassen oder abbrechen.
9. Layer-, Block- und Objektgruppenfilter werden noch im Worker auf die rohe `DwgDatabase` angewendet.
10. Erst die gefilterte Datenbank passiert die Structured-Clone-Grenze zum Hauptthread und geht in die renderer-spezifische Feature-, Datenbank- und Szenenerzeugung ein.

Beide Routen verwenden für diesen Handshake dieselbe MLightCAD-/LibreDWG-0.7.10-Rohdatenpipeline. Der Legacy-Pfad normalisiert das gefilterte, strukturell kompatible Ergebnis anschließend mit `@flyfish-dev/cad-viewer`; der MLightCAD-Pfad baut daraus seine AcDb-Datenbank und Three.js-Szene. Die verwendeten 0.7.9-/0.7.10-Datenstrukturen sind für die konsumierten Layer-, Block-, Entity-, Header- und Objektfelder kompatibel. Nicht konvertierbare LibreDWG-Entitäten fließen als Proxy-/Unknown-Zahl in Bericht und Risikoschätzung ein.

Eine Dateigröße allein löst weder eine Sperre noch zwingend den Vorbereitungssheet aus. In die Risikobewertung fließen außerdem ein:

- direkte und rekursiv expandierte Entitäten
- INSERT-Multiplizität und maximale Blocktiefe
- Texte, Leader und MLeader
- Hatches und Solids
- Polylinienpunkte
- Bilder, OLE-/Proxy-Objekte, XRefs und 3D-Inhalte
- das anhand von Mobilgerät und `navigator.deviceMemory` geschätzte Budget

Fehlt `navigator.deviceMemory`, verwendet ein Mobilbrowser ein konservatives Budget. Das ist eine Empfehlung, keine Sperre. Auch bei hoher Risikostufe bleibt „Vollständig laden“ verfügbar.

`DwgPreflightReport` wird in Version 0.5.0 als Schema 2 erzeugt. Neben Dateimetadaten, DWG-Version, Layerstatistik, erreichbaren Blöcken, Objektzählungen, Risikogründen, Budget, Warnungen und dem empfohlenen Profil enthält er konkrete `DwgProfileEffect`-Einträge, `DwgProfileImpact`, Annotationsmaßstäbe, XRef-Status und den räumlichen Filterbericht. Echte Objektzahlen und gewichtete Performancekosten sind getrennte Größen. Schema-1-Berichte bleiben für ältere Sitzungsfixtures lesbar. Die App speichert den Bericht nur in der laufenden Sitzung.

## Empfohlenes und benutzerdefiniertes Ladeprofil

Das automatisch empfohlene Profil entfernt zunächst ausschließlich Inhalte, die in der Ausgangszeichnung bereits deaktiviert oder außerhalb des 2D-Modellbereichs liegen:

- ausgeschaltete, eingefrorene und No-Plot-Layer
- Papierbereiche
- nicht aufgelöste XRefs
- Bilder, OLE- und Proxy-Objekte
- 3D-Inhalte

Benannte fachliche Blöcke, Texte und Hatches werden nicht ungefragt entfernt. Der Vorbereitungssheet markiert teure Bereiche und zeigt die geschätzte Wirkung der Auswahl; der Nutzer entscheidet über zusätzliche Filter.

`filterCadDocument` wendet das Profil vor der Konvertierung an. Dabei gelten folgende Regeln:

- Layerfilter greifen auch innerhalb von Blockdefinitionen.
- Entitäten auf Layer `0` erben im INSERT-Kontext den wirksamen Elternlayer.
- abgewählte verschachtelte INSERTs werden aus ihren Eltern entfernt.
- weiterhin erreichbare Blockdefinitionen bleiben erhalten; nicht mehr referenzierte Definitionen werden verworfen.
- zyklische Blockgraphen werden mit Besuchspfad und Tiefenlimit beendet.
- Position, Rotation, Skalierung und Attribute verbleibender INSERTs bleiben unverändert.

Das Original wird niemals verändert. Version 0.5.0 besitzt keinen CAD-Editor und schreibt keine neue oder „optimierte“ DWG-Datei.

## Annotationsmaßstäbe und lokale XRefs

Der Worker liest `SCALE`, `CONTEXTDATAMANAGER` und bekannte `*OBJECTCONTEXTDATA`-Strukturen vor der allgemeinen Konvertierung. Valide Papier-/Zeichnungseinheiten werden als `CadAnnotationScaleSelection` an die Oberfläche gemeldet. Der gespeicherte Maßstab ist die Vorgabe; eine manuelle Auswahl bleibt für den gesamten Import und für ergänzte XRefs fest. Pan und Zoom verändern sie nicht.

Die Zuordnung alternativer annotativer Darstellungen erfolgt ausschließlich bei eindeutigen Kontextinformationen. Ist die Eigentümer- oder Maßstabsbeziehung in der nativen Struktur nicht sicher ableitbar, arbeitet die Pipeline fail-open: Sie entfernt nichts und meldet die unvollständigen Kontextdaten. Damit wird keine gültige Geometrie heuristisch gelöscht, es können bei beschädigten Dateien aber weiterhin mehrere Darstellungen sichtbar bleiben. Leader-/MLeader-Führung und Text verwenden anschließend denselben Sichtbarkeitszustand.

`CadFileBundle` hält die Hauptdatei und ergänzte XRef-Dateien nur als Browser-`File`-Objekte. Die Auflösung normalisiert Pfade auf den DWG-Basisnamen. Eindeutige Treffer werden sequenziell im selben Worker geöffnet; mehrdeutige Treffer bleiben bis zu einer expliziten Auswahl offen. Attachments dürfen weitere lokale Referenzen verfolgen, Overlays nicht. Ein Besuchspfad beendet Zyklen, fehlende oder ungültige Dateien erzeugen Status und Warnungen. Beim Zusammenführen werden Tabellen- und Blocknamen mit `XRefName|…` getrennt; vorhandene INSERT-Transformationen bleiben maßgeblich. XCLIP, Proxy-/Custom-Objekte und vollständige AutoCAD-XRef-Parität werden nicht zugesichert.

## Luxemburg-Filter

Das generierte Asset `src/lib/cad/data/luxembourgBoundary.epsg2169.json` enthält ausschließlich die aus dem offiziellen ACT-Datensatz abgeleitete Landesgeometrie in `EPSG:2169`. Der Generator dokumentiert Quellhash, Projektion, Vereinfachungstoleranz von fünf Metern und den exakt 1.000 Meter großen Prüfbereich. Zur Laufzeit findet kein Datendownload statt.

Nach XRef-/Annotationsvorbereitung berechnet die Pipeline konservative transformierte AABBs für direkte Modellobjekte und rekursive INSERTs. Nur ein sicher vollständig außerhalb des Grenzpolygons samt Toleranz liegendes Objekt wird entfernt. Berührende, schneidende und nicht sicher bestimmbare Objekte bleiben vollständig erhalten. Anschließend werden nicht mehr erreichbare Blockdefinitionen entfernt. Der Filter ist bei einer neuen Haupt-DWG aktiviert und bleibt vom `CadLoadProfile` getrennt, sodass „Vollständig laden“ ihn nicht stillschweigend überschreibt. Details und Reproduktion stehen in [luxembourg-boundary-filter.md](luxembourg-boundary-filter.md).

## Darstellung und Zeichenreihenfolge

`CadAppearanceSettings` trennt das Profil von der globalen CAD-Deckkraft. `Original` verwendet unveränderte Farben und 100 Prozent Füllungsdeckkraft. `Karte` erhöht den Kontrast der Linien-/Textdarstellung und startet mit 35 Prozent für echte Fill-, HATCH- und SOLID-Materialien. Der Füllungsregler verändert weder leere WebGL-Pixel noch Orthofoto, Linien oder Texte. In OpenLayers wird die Füllfarbe im vorhandenen Style berechnet; in MLightCAD verwaltet ein eigener Materialcontroller ausschließlich erkannte Füllmaterialien und stellt deren Ursprungszustand beim Dispose wieder her. Die `Map`-, `View`- und CAD-Geometriestrukturen werden dafür nicht neu erzeugt.

Der sitzungsweite `CadObjectDrawOrder` führt geordnete `front`- und `back`-Schlüssel. Mehrteilige logische Objekte teilen einen stabilen `drawOrderGroupKey`; Unterobjekte wiederverwendeter Blockdefinitionen werden bewusst definitionsweit gruppiert. OpenLayers berechnet daraus einen `Style.zIndex` und ruft je Aktion genau einmal `cadLayer.changed()` auf. MLightCAD verwendet begrenzte Preview-Fragmente in festen Vorder-/Hintergrund-Tiers und entsorgt ersetzte Geometrien und Materialien. Die Budgets betragen je Aktion/gesamt 128/384 Fragmente auf Mobilgeräten und 256/512 auf Desktop. Eine Überschreitung verändert die Szene nicht und wird lokalisiert gemeldet. Während Pan oder Zoom findet keine Reihenfolgearbeit statt.

## Layer-, Block-Drawer und Sichtbarkeitsmodell

Beide Viewer verwenden `LayerSheet` und `BlockSheet` auf Basis derselben `BottomSheet`-Komponente und desselben kompakten Drawer-Layouts. Griff, Animation, Außenklick, Escape-Verhalten, Suchfeld, Aktionszeile, Typografie und Touchziele bleiben dadurch identisch; es gibt keine Kreuz-Schaltfläche im Drawer-Kopf.

Der Layer-Drawer zeigt:

- Suche nach Layername oder interner Kennung
- Zähler für sichtbare und ausgeblendete Layer
- „Alle anzeigen“ und „Alle ausblenden“
- Objektzahl pro Layer
- eine aus Objektzahl und Gerätebudget abgeleitete Belastungseinstufung `niedrig`, `mittel` oder `hoch`
- einen Neuladehinweis für Layer, die durch das aktuelle Ladeprofil nicht im aufgebauten Modell vorhanden sind

Sichtbarkeitsänderungen an bereits aufgebauten Layern wirken unmittelbar. Ist ein Layer im Worker vor dem Szenen- beziehungsweise Featureaufbau gefiltert worden, kennzeichnet der Drawer den nötigen CAD-Neuaufbau. „Änderungen anwenden“ sammelt diese strukturellen Änderungen und startet genau einen kontrollierten Neuaufbau aus der weiterhin lokalen Originaldatei.

Der Block-Drawer zeigt:

- Suche sowie sichtbare und ausgeblendete Zähler
- „Alle anzeigen“ und „Alle ausblenden“
- erreichbare benannte Blöcke zuerst
- gruppierte, einklappbare Systemblöcke wie `*U`, `*D` und `*A`
- getrennt gekennzeichnete XRefs
- Instanzen, rekursive Objektzahl, enthaltene Texte/Hatches, Hauptlayer und geschätzte Belastung

Ein direkt im Modellbereich eingesetzter Block kann nach dem Laden unmittelbar in der Szene beziehungsweise im Featurestil geschaltet werden. Das Ausschalten eines verschachtelten oder bereits aus dem Modell gefilterten Blocks ändert die Struktur; „Änderungen anwenden“ verarbeitet deshalb nur das CAD-Dokument neu. Karte, GPS, Kartenmittelpunkt, Zoom, Deckkraft und geöffneter Drawer bleiben dabei erhalten.

OpenLayers-Features tragen ihren rekursiven `blockPath`. Der Objekt-Drawer zeigt diesen Pfad und kann Objekt, wirksamen Layer oder Block ausblenden. Layer-, Block-, Text- und Objektzustände werden sitzungsweit geteilt, auch wenn die konkrete Entitäts-ID beider Parser nicht zwingend identisch ist.

### Drawer-Lebenszyklus und Layer-Hotpath

Layer- und Block-Drawer verwenden denselben verzögerten Inhaltslebenszyklus. Beim Öffnen ist der Inhalt unmittelbar vorhanden. Beim Schließen bleiben Zeilen und Bedienelemente für die 300-ms-Exit-Animation gemountet; erst danach werden sie entfernt. Ein erneutes Öffnen innerhalb dieses Zeitfensters verwirft die ausstehende Entfernung. Damit bleibt die Schließanimation vollständig, während dauerhaft geschlossene Drawer weder Zähler und Filter noch lange Zeilenlisten berechnen oder rendern.

Für den geladenen Layer-Drawer werden Preflight- und Renderer-Daten nicht mehr durch eine lineare Suche pro Preflight-Layer verbunden. Kanonische Layer-ID und Layername werden einmal in einer `Map`, verborgene Identitäten einmal in einem `Set` indiziert. Danach wird jede Layerliste nur noch linear durchlaufen. Die Zusammenführung sinkt damit für `L` Layer von `O(L²)` auf `O(L)`; unterschiedliche ID-/Namensdarstellungen und die höhere Objektzahl aus Preflight oder Renderer bleiben erhalten.

Die abgeleitete Layerliste, die daraus erzeugten Drawer-Einträge und die übersetzten Beschriftungen sind memoisiert. Jede Layerzeile ist als eigene React-Komponente memoisiert und erhält einen stabilen Sichtbarkeits-Callback. Eine einzelne Layer-Umschaltung rendert dadurch nur die geänderte Zeile neu und nicht alle unveränderten Zeilen einer großen Zeichnung.

## Bestehende OpenLayers-Pipeline

Der Legacy-Pfad übernimmt die bereits im gemeinsamen Module-Worker gefilterte `DwgDatabase`, normalisiert sie mit `normalizeDwgDatabase` und übergibt sie anschließend an `convertCadDocument`. Die Konvertierung löst INSERTs rekursiv auf, transformiert LUREF-Geometrien von `EPSG:2169` nach `EPSG:3857` und erzeugt stabile OpenLayers-Feature-Metadaten einschließlich `layerId`, CAD-Typ und `blockPath`.

Unterstützt werden unter anderem Linien, Polylinien mit Bulge-Bögen, Kreise, Bögen, Ellipsen, Splines als Approximation, Punkte, Texte, Solid-/Hatch-Umrisse und rekursive Blöcke. Nicht rekonstruierbare Schraffuren, Papierbereiche, Z-/3D-Inhalte, fehlende oder zyklische Blöcke und unbekannte Typen werden als Hinweise gemeldet.

## MLightCAD-Pipeline und Kamerabrücke

`MlightCadCanvas` erzeugt für die aktuelle Dateirevision einen `MlightCadViewerAdapter`. Der Adapter prüft die statischen Worker, liest die Datei mit genau einem abbrechbaren Parser-Worker, wendet Preflight und Ladeprofil an und öffnet anschließend ausschließlich den 2D-Modellbereich. Three.js rendert auf einem Canvas mit `clearAlpha = 0`; CAD-Deckkraft verändert nur CAD-Pixel und dunkelt die Karte nicht ab.

MLightCAD und die OpenLayers-Karte darunter arbeiten beide in den absoluten LUREF-WCS-Koordinaten `EPSG:2169`. Wie im flüssigen Stand 0.2.4 überträgt die Kamerabrücke Mittelpunkt und Meter-pro-CSS-Pixel-Auflösung ohne Projektion oder asynchrone Zwischenstufe direkt auf die Kartenansicht. Jede MLightCAD-Kamerameldung wird im selben Bewegungszyklus mit `renderSync()` dargestellt. Dadurch bleiben CAD-Canvas und Orthofoto auch bei schnellem Pan und Zoom bildgleich gekoppelt. Die Geoportail-Quelle selbst bleibt in `EPSG:3857`; OpenLayers übernimmt deren Kachelreprojektion in die LUREF-View.

Version 0.5.0 verändert diesen Kamera-Vertrag aus 0.2.4 ausdrücklich nicht: CAD-Mittelpunkt, Auflösung und OpenLayers-Darstellung bleiben für jede Kamerameldung synchron. Entkoppelt ist nur die React-Koordinatenanzeige. Sie ersetzt bei weiteren Kamerameldungen ihren ausstehenden Timer und veröffentlicht den letzten Mittelpunkt 100 ms nachlaufend. Eine Pan-Geste aktualisiert somit weiterhin die Karte in jedem Schritt, rendert aber nicht in jedem Schritt den vollständigen React-Seitenbaum. Annotationen, XRefs, Grenzprüfung, Darstellung und Zeichenreihenfolge führen im Kamera-Hotpath keine Arbeit aus.

Das synchrone `renderSync()` kann programmgesteuert ein OpenLayers-`moveend` auslösen. Solange MLightCAD die Navigation steuert, beendet der OpenLayers-Listener dieses Ereignis deshalb vor dem Seiten-Callback; die nachlaufende CAD-Koordinate ist in diesem Zustand die einzige Koordinatenmeldung an die React-Seite. Ohne aktives MLightCAD-Dokument bleibt der Listener unverändert zuständig für manuelle OpenLayers-Bewegungen.

GPS wird zuerst nach LUREF transformiert. Marker, Genauigkeitskreis und eine autoritative CAD-Zentrierung verwenden anschließend dieselben Meterkoordinaten wie Zeichnung und Karte.

Ohne bereites CAD-Dokument bedient OpenLayers die Karte. Nach `ready` übernimmt MLightCAD Pan und Zoom. Die MLightCAD-Ansicht bleibt nordfixiert; der drehbare Legacy-Viewer behält seinen Nordpfeil.

## Adaptive MLightCAD-Canvas-Qualität

Die Qualitätswahl steuert ausschließlich die Pixeldichte des transparenten MLightCAD-WebGL-Canvas. Geometrie, Weltkoordinaten, Kameraauflösung und CAD-/Kartenkopplung bleiben identisch; geändert wird nur, wie viele physische WebGL-Pixel für einen CSS-Pixel gerendert werden.

| Modus | Effektive Pixeldichte | Verhalten |
| --- | --- | --- |
| `Auto` | 1× bis 2× | verwendet die native Gerätedichte bis höchstens 2× und reduziert abhängig von Gerätespeicher, Dateigröße vor dem Preflight sowie anschließend gemessener Risikostufe |
| `Scharf` | native Dichte bis 2,5× | priorisiert die CAD-Kantenschärfe, überschreitet aber auch auf einem DPR-3-Gerät nie 2,5× |
| `Speichersparend` | 1× | minimiert die WebGL-Framebufferfläche unabhängig von der nativen Gerätedichte |

Der Auto-Resolver beginnt nie unter 1× und verwendet folgende Schutzstufen:

- höchstens 2× bei unauffälligem Geräte- und Preflightzustand
- höchstens 1,5× bei erhöhter Preflight-Risikostufe
- 1× bei hoher Risikostufe oder höchstens 2 GiB gemeldetem Gerätespeicher
- vor vorliegendem Preflight höchstens 1,5× auf mobilen Geräten und 1× bei einer Datei über 10 MiB

Nach dem kompakten Preflight wird die Auto-Auflösung mit der tatsächlich gemessenen Risikostufe erneut bestimmt. Ein Wechsel der Qualitätsstufe setzt die Pixeldichte am bestehenden Three.js-Renderer und markiert die Ansicht für eine neue Darstellung; die DWG-Geometrie wird dafür nicht neu interpretiert.

Die OpenLayers-Basiskarte darunter gehört ausdrücklich nicht zu dieser Auswahl. Sie behält ihren unabhängigen Karten- und Kachelcache-Lebenszyklus und rendert auf mobilen beziehungsweise grob bedienten Geräten weiterhin mit DPR 1. Damit entsteht auf iPhones keine pauschale gemeinsame DPR-3-Fläche für Karte und CAD: `Auto` begrenzt den CAD-Canvas auf 2×, `Scharf` auf 2,5× und `Speichersparend` auf 1×, während die mobile Karte bei 1× bleibt.

## LibreDWG-Speicher und Lebenszyklus

Das verwendete LibreDWG-WASM wurde upstream mit `ALLOW_MEMORY_GROWTH` und hohem Anfangsspeicher ausgeliefert. `build/patchLibreDwgMemory.ts` ändert beim Vite-Build reproduzierbar nur den deklarierten Minimalwert der linearen WASM-Speichertabelle auf 2.048 Seiten beziehungsweise 128 MiB. Das vorhandene Maximum und kontrolliertes Wachstum bleiben erhalten. Ein Test validiert das erzeugte WebAssembly-Modul und verhindert, dass ein später geändertes oder inkompatibles Upstream-Binary unbemerkt ausgeliefert wird.

Die Quellpakete und Lizenzbedingungen werden dadurch nicht ersetzt; der Patch ist eine anwendungseigene Buildtransformation der ausgelieferten Binärdatei. Beide Viewer verwenden dieselbe versionsgebundene Laufzeit unter `/mlightcad-workers/0.3.0/`. Die frühere Flyfish-WASM-Kopie unter `/wasm/` ist seit dem gemeinsamen Preflight-Worker nicht mehr Teil des Builds. Ein neuer Releasepfad verhindert die Wiederverwendung eines alten immutable gecachten 0.2.x-WASM.

Bei Mobilgeräten werden Karten- und CAD-Pixelratio reduziert und der Kartenkachelcache begrenzt. Ein Viewerwechsel darf erst nach abgeschlossener Freigabe fortfahren. Dispose beendet Worker, Listener und Animationsschleifen, löst Dokument- und Dateireferenzen, leert Szene und Renderlisten, gibt Renderer und WebGL-Kontext frei und entfernt den Canvas. Zielzustand sind höchstens ein aktiver Parser-Worker und ein CAD-WebGL-Kontext.

## Geoportail-Ausfallsicherheit

Beide Viewer teilen einen `BasemapHealthController` mit den Zuständen `loading`, `ready`, `retrying`, `offline` und `unavailable`. WMTS `ortho_2025` über `GLOBAL_WEBMERCATOR_4_V3` bleibt bevorzugt; WMS `ortho_latest` verwendet denselben offiziellen Open-Data-Endpunkt `https://wmts1.geoportail.lu/opendata/service`.

Der Controller veröffentlicht nur tatsächliche Zustandsänderungen. Weitere erfolgreiche Kacheln im bereits erreichten Zustand `ready` lösen daher keine erneute React-Aktualisierung aus.

Der Wechsel folgt einer kontrollierten Zustandsmaschine:

1. Der erste einzelne Kachelfehler löst keinen Moduswechsel aus.
2. Nach drei aufeinanderfolgenden WMTS-Fehlern wird die WMTS-Quelle einmal neu aufgebaut.
3. Acht Sekunden ohne erfolgreiche WMTS-Kachel schalten auf WMS.
4. WMS erhält ebenfalls einen Versuch; nach zehn Sekunden ohne Erfolg wird `unavailable` gemeldet.
5. Während WMS funktioniert, prüft die App WMTS periodisch ohne Cache. Erst zwei erfolgreiche Prüfungen in Folge wechseln zurück.
6. Offline-/Online-Ereignisse und verspätete Ereignisse alter Quellgenerationen werden gesondert behandelt.

Die Satelliten-Statuskarte zeigt den gemeinsamen Zustand. Auch bei `offline` oder `unavailable` bleiben CAD, Layer, Blöcke, Auswahl, GPS-Zustand und die bewusst schwarze Kartenfläche bedienbar.

## Statische und externe Ressourcen

- `/mlightcad-workers/0.3.0/`: gemeinsamer Preflight-Worker, MLightCAD-Parser-/MText-Ressourcen, LibreDWG-API samt Emscripten-Laufzeit und gepatchtes LibreDWG-WASM
- `src/lib/cad/data/luxembourgBoundary.epsg2169.json`: lokal generierte ACT-Landesgrenze in LUREF mit Herkunfts- und Buildmetadaten
- `https://cdn.jsdelivr.net/gh/mlightcad/cad-data@main/`: unterstützende MLightCAD-CAD-/Schriftressourcen
- Geoportail Open Data: WMTS-/WMS-Kartenbilder und WMTS-Recovery-Proben

Nur statische App- und Viewerdateien werden gebaut und auf Netlify ausgeliefert. Eine ausgewählte DWG verlässt das Gerät nicht.

## Bekannte Grenzen

- Beide Routen setzen absolute 2D-LUREF-Koordinaten voraus; es gibt keine automatische Georeferenzierung lokaler CAD-Koordinaten.
- Lokale XRefs werden bestmöglich zusammengeführt. XCLIP, Papierlayouts, proprietäre Custom-/Proxy-Entities, nicht lokal bereitgestellte Referenzen und 3D-Darstellung gehören nicht zum positiven Abnahmeumfang.
- Nicht eindeutige oder beschädigte Annotationskontexte bleiben fail-open unverändert; dadurch kann eine Zeichnung weiterhin mehrere Maßstabsdarstellungen enthalten.
- Nach dem Öffnen des MLightCAD-Dokuments übernimmt der Adapter die vom Renderer bereitgestellten `missedFonts`, fasst Vorkommen je Schrift zusammen und ergänzt lokalisierte Hinweise im Importbericht. Da diese Information erst nach dem Renderstart verfügbar ist und nur erkannte Renderer-Verwendungen umfasst, bleibt sie ausdrücklich bestmöglich.
- HATCH-Füllungen können von CAD-Referenzsoftware abweichen; siehe [mlightcad/cad-viewer #230](https://github.com/mlightcad/cad-viewer/issues/230).
- „Vollständig laden“ kann trotz Warnung den Speicherrahmen eines Geräts überschreiten. Besonders iOS Safari kann einen Tab hart beenden, bevor JavaScript noch einen Fehlerdialog anzeigen kann.
- Ein gefilterter Layer oder verschachtelter Block benötigt zum Wiedereinblenden einen erneuten CAD-Aufbau aus der lokal ausgewählten Originaldatei.
- Preflight-Schätzungen sind absichtlich konservative Näherungen und kein garantierter Speicher- oder Laufzeitwert.
