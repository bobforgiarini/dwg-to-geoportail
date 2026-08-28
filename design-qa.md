# Design QA – Version 0.5.2

## Vergleichsgrundlage

### Source visual truth

- Maßstabsdubletten: `C:\Users\bfo\AppData\Local\Temp\codex-clipboard-ef8670b4-4f06-4658-9037-94d70108cdd0.png`
- bisheriges Mittelpunkt-Symbol: `C:\Users\bfo\AppData\Local\Temp\codex-clipboard-f0c319e0-cc89-4c91-a4eb-02c41616a375.png`
- konkurrierende Ladeaktionen: `C:\Users\bfo\AppData\Local\Temp\codex-clipboard-72f7e41c-b03e-490a-a11f-3c3a6d2126bc.png`
- redundanter Luxemburg-Abschnitt: `C:\Users\bfo\AppData\Local\Temp\codex-clipboard-9eb5c1d5-a337-49e5-9bd7-cca6404bfd65.png`
- missverständliche Kennzahlen: `C:\Users\bfo\AppData\Local\Temp\codex-clipboard-a4a4ce75-c5fd-4d22-ba5b-0ff22833735a.png`

### Implementierung

- Karten-Gesamtansicht Desktop: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\implementation-desktop.png`
- Karten-Gesamtansicht Mobil: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\implementation-mobile.png`
- Vorbereitung Auswahl und Aktionen: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\implementation-preparation.png`
- Vorbereitung Kopf und Kennzahlen: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\implementation-preparation-top.png`
- Vorbereitung Luxemburg-Filter und Ausschlüsse: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\implementation-preparation-middle.png`
- reale Junglinster-DWG mit Maßstab `1/500 Best`: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\implementation-scale-1-500.png`

### Direkte Vergleichsbilder

- Maßstab: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\comparison-scale.png`
- Mittelpunkt: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\comparison-crosshair.png`
- Vorbereitungsaktionen: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\comparison-preparation-actions.png`
- Vorbereitungszusammenfassung: `C:\Users\bfo\OneDrive - BEST\ANB - Innovation\Entwicklung Code\BEST Buddy\mobile\docs\qa\0.5.2\comparison-preparation-summary.png`

Jedes Vergleichsbild enthält Source und Implementierung in derselben visuellen Prüffläche. Dadurch wurden nicht nur getrennte Screenshots, sondern die relevanten Abweichungen direkt nebeneinander beurteilt.

## Normalisierung und geprüfte Zustände

- Desktop-Viewport: 1280 × 720 CSS-Pixel, Device Pixel Ratio 1.
- Mobile Viewport: 390 × 844 CSS-Pixel, Device Pixel Ratio 1.
- Desktop-Zustand: Route `/`, MLightCAD, reale private Junglinster-DWG vollständig browserlokal geladen, Satellit aktiv, ausgewählter Maßstab `1/1000 Best` beziehungsweise für den fokussierten Vergleich manuell `1/500 Best`.
- Maßstabs-Fokus: LUREF-Mittelpunkt `86200 / 86311.948`, damit dieselbe problematische Beschriftungszone bewertet wird.
- Vorbereitungszustand: `DwgPreparationSheet` mit realem Schema-2-Bericht, automatischer Empfehlung und anschließend manueller Auswahl.
- Mobile-Zustand: Route `/`, reale DWG geladen, Karte und CAD sichtbar, Drawer geschlossen, Mittelpunkt-Symbol frei sichtbar.
- Die Quellen sind annotierte Nutzerscreenshots und definieren Funktion, Informationshierarchie und Zielrichtung. Pixelidentische Übereinstimmung mit roten Anmerkungsrahmen war nicht das Ziel; geprüft wurde die darin verlangte resultierende Oberfläche.

## Full-view comparison evidence

`implementation-desktop.png` und `implementation-mobile.png` zeigen, dass Karte, CAD, Header, kompakte Kartenkarten, Steuerelemente und Site-Banner weiterhin korrekt gestapelt sind. Der 14-Pixel-Mittelpunkt liegt optisch leicht genug über der Zeichnung, blockiert keine Interaktion und markiert dieselbe Position wie die LUREF-Koordinatenanzeige. Auf dem mobilen Viewport entsteht weder horizontaler noch vertikaler Dokumentüberlauf.

`implementation-preparation.png` zeigt den vollständigen Vorbereitungssheet ohne konkurrierende goldene und neutrale Auswahlaktion. Die Informationsfolge ist nun: Risiko, verständliche Hauptkennzahlen, Dateikontext, Maßstab, Luxemburg-Filter, Empfehlungen, manuelle Auswahl und eine einzige kontextabhängige Hauptaktion.

## Focused region comparison evidence

- `comparison-scale.png`: Die problematische Junglinster-Zone zeigt bei manueller Auswahl `1/500 Best` nur noch eine passende physische Maßstabsdarstellung. Parallel sichtbare `@ 1`-/`@ 0.25`-Geschwister sind im gefilterten Modell nicht mehr vorhanden.
- `comparison-crosshair.png`: Das frühere kreisförmige Zielzeichen wurde durch genau zwei dünne rote Linien ersetzt. Es gibt keinen Ring, keinen Hintergrund und keinen zusätzlichen Mittelpunktpunkt.
- `comparison-preparation-actions.png`: Die zwei vorher gleichwertig wirkenden Aktionen sind zu einer goldenen Hauptaktion zusammengeführt. Unverändert heißt sie „Load recommended“; nach einer manuellen Änderung wird derselbe Button zu „Load selection“.
- `comparison-preparation-summary.png`: Der Luxemburg-Block enthält nur noch eine Überschrift, Toleranz, Schalter und eine Ergebniszeile. Die Kennzahlengruppe zeigt Originalobjekte und erwartete Objekte nach Empfehlung aus derselben Berechnungsbasis; Layer/Blöcke und geschätzte Last sind davon getrennt.

## Required fidelity surfaces

- Fonts and typography: bestehende Systemschrift, Gewichte und Größenhierarchie bleiben konsistent. Kennzahlen besitzen ein eindeutiges Label-Wert-Verhältnis und die Primäraktion bleibt typografisch dominant.
- Spacing and layout rhythm: Der Vorbereitungssheet nutzt die vorhandenen Radien und Abstände, entfernt jedoch eine komplette Aktionszeile und eine doppelte räumliche Effektkarte. Der mobile Kartenraum bleibt frei von zusätzlichem Layoutdruck.
- Colors and visual tokens: Navy, Weiß, Gold und neutrale Graustufen bleiben unverändert. Rot wird ausschließlich für das kleine fachlich verlangte Mittelpunktkreuz verwendet.
- Image quality and asset fidelity: Geoportail-Kartenbilder, CAD-Darstellung und bf.lu-Logo bleiben echte Assets beziehungsweise Dienste. Icons stammen weiterhin aus `lucide-react`; das Fadenkreuz verwendet das dortige `Plus`-Icon in einem nicht interaktiven DOM-Overlay und kein nachgebautes Bildasset.
- Copy and content: Kataster benennt den tatsächlich verwendeten Dienst als `(WMTS)`. Die Vorbereitung trennt echte Objektzahlen von geschätzter Belastung. Maßstabsquelle wird als Empfehlung aus Objektkontexten statt fälschlich als gespeicherter globaler Maßstab beschrieben.
- Responsiveness: 1280 × 720 und 390 × 844 wurden im gleichen realen Dateizustand geprüft. Bedienelemente und Drawer bleiben innerhalb des Viewports, das Kartenmittel bleibt exakt bei x=195/y=422 im mobilen Zustand.
- Accessibility: Karten-Toggles bleiben semantische Buttons mit `aria-pressed`; die Hauptaktion ist eindeutig und nicht doppelt; das dekorative Kreuz ist `aria-hidden` und `pointer-events: none`; bestehende Bottom-Sheet-Schließwege und Touchziele bleiben erhalten.

## Primary interactions tested

- reale 11,31-MB-Junglinster-DWG ausgewählt, Preflight abgeschlossen und MLightCAD-Dokument erfolgreich aufgebaut
- automatische Maßstabsempfehlung `1/1000 Best` geprüft
- manuell `1/500 Best` gewählt, Sheet-Aktion wechselte von „Load recommended“ auf „Load selection“, gefilterter Neuaufbau erfolgreich
- dieselbe reale Beschriftungszone bei LUREF `86200 / 86311.948` nach dem Neuaufbau visuell geprüft
- Satellitenanzeige blieb während Import, Maßstabswechsel und Drawerbedienung aktiv
- Katastertoggle wird als WMTS ausgewiesen; sein Zustand bleibt vom Orthofoto-Fallback unabhängig
- Desktop- und mobile Karteninteraktion bleiben durch das nicht interaktive Fadenkreuz unverändert
- frischer Browserlauf nach dem realen Import auf Konsolenfehler geprüft: keine Fehler

## Findings and comparison history

### Iteration 1

- [P1] Die erste physische Maßstab-Layerfilterung mutierte die LibreDWG-Entitätslisten direkt. Der Datenbestand sah reduziert aus, MLightCAD lief bei der anschließenden Konvertierung jedoch in einen rekursiven Stackoverflow.
- Fix: Die erkannten Geschwisterlayer werden seitdem nur als zusätzliche IDs in das bestehende `CadLoadProfile` übernommen. Der etablierte Modellfilter entfernt sie struktur-erhaltend aus Modell- und Blocktabellen.
- Post-fix evidence: erfolgreicher realer Import und `implementation-scale-1-500.png` ohne Konsolenfehler.

### Iteration 2

- [P1] Ohne globalen `CANNOSCALE` wurde zuvor der erste sortierte Maßstab gewählt. Dadurch erschien `1/500 Best`, obwohl die Objektkontexte überwiegend `1/1000 Best` referenzieren.
- Fix: Default-Kontextreferenzen werden gezählt; bei fehlendem globalem Maßstab gewinnt der dominante belastbare Objektkontext.
- Post-fix evidence: Vorbereitung zeigt `1/1000 Best · recommended from object contexts` als Vorgabe.

### Iteration 3

- [P2] Vorbereitung enthielt zwei konkurrierende Ladeaktionen, redundante räumliche Wirkung und unterschiedlich begründete Objektzahlen.
- Fix: eine dynamische Goldaktion, ein kompakter Luxemburgblock und eine Kennzahlengruppe aus konsistentem `DwgProfileImpact`.
- Post-fix evidence: `comparison-preparation-actions.png` und `comparison-preparation-summary.png`.

### Final pass

Keine verbleibenden P0-, P1- oder P2-Befunde in den beauftragten Flächen. Der Unterschied zur Source ist jeweils die ausdrücklich gewünschte Korrektur, nicht eine unbeabsichtigte Abweichung.

## Residual test gaps

- Der responsive Desktoplauf mit 390 × 844 CSS-Pixeln ersetzt keinen Speicherdruck- und Gestentest auf echter iPhone-Safari-Hardware.
- Andere DWGs können proprietäre oder anders benannte Maßstabvarianten verwenden. Diese bleiben bewusst fail-open und benötigen gegebenenfalls eine eigene belastbare Zuordnungsregel.
- Der Kataster-WMTS besitzt keinen eigenen WMS-Fallback; bei einem Ausfall dieses Dienstes bleibt das Orthofoto unabhängig davon bedienbar.

final result: passed
