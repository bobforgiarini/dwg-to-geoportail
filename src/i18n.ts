import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  de: { translation: {
    appName: 'DWG → Geoportail',
    map: 'Karte', upload: 'DWG laden', replace: 'DWG ersetzen', remove: 'DWG entfernen', cancel: 'Abbrechen',
    layers: 'Layer', layersTitle: 'DWG-Layer', close: 'Schließen', showAll: 'Alle einblenden', hideAll: 'Alle ausblenden',
    locationStart: 'Standort starten', locationStop: 'Standort beenden', locationResume: 'Folgen fortsetzen', locationPaused: 'Standortfolge pausiert',
    fileLocal: 'Die DWG bleibt ausschließlich in dieser Browser-Sitzung auf deinem Gerät.',
    noDwg: 'Noch keine DWG geladen', chooseDwg: '2D-DWG auswählen', importing: 'DWG wird verarbeitet …', ready: 'DWG dargestellt',
    tooLarge: 'Die Datei ist größer als 10 MB. Der Import kann länger dauern, lässt sich aber abbrechen.',
    invalidFile: 'Bitte eine Datei mit der Endung .dwg auswählen.', importFailed: 'Die DWG konnte nicht verarbeitet werden.', importCancelled: 'Import abgebrochen.',
    mapFallback: 'WMTS war nicht erreichbar. WMS-Fallback wird verwendet.', locationDenied: 'Standortzugriff wurde abgelehnt.',
    locationUnavailable: 'Der Live-Standort ist in diesem Browser nicht verfügbar.', locationError: 'Der Standort konnte nicht bestimmt werden.',
    accuracy: 'Genauigkeit {{meters}} m', coordinates: 'LUREF {{x}} / {{y}}', fileSize: '{{size}} MB', featureCount: '{{count}} Objekte',
    warnings: 'Hinweise', warning3d: '3D-/Z-Werte wurden auf die 2D-Karte abgeflacht.', warningPaper: 'Papierlayouts wurden ignoriert.',
    warningUnsupported: 'Nicht unterstütztes Element: {{type}}', warningBlock: 'Ein Block konnte nicht vollständig aufgelöst werden.',
    warningGeneric: '{{warning}}', basemapWmts: 'Satellit (WMTS)', basemapWms: 'Satellit (WMS)', language: 'Sprache', alignNorth: 'Nach Norden ausrichten',
  }},
  fr: { translation: {
    appName: 'DWG → Geoportail',
    map: 'Carte', upload: 'Charger DWG', replace: 'Remplacer le DWG', remove: 'Retirer le DWG', cancel: 'Annuler',
    layers: 'Calques', layersTitle: 'Calques DWG', close: 'Fermer', showAll: 'Tout afficher', hideAll: 'Tout masquer',
    locationStart: 'Démarrer la position', locationStop: 'Arrêter la position', locationResume: 'Reprendre le suivi', locationPaused: 'Suivi de position en pause',
    fileLocal: 'Le DWG reste uniquement sur votre appareil pendant cette session du navigateur.',
    noDwg: 'Aucun DWG chargé', chooseDwg: 'Choisir un DWG 2D', importing: 'Traitement du DWG …', ready: 'DWG affiché',
    tooLarge: 'Le fichier dépasse 10 Mo. L’import peut durer plus longtemps, mais peut être annulé.',
    invalidFile: 'Veuillez choisir un fichier avec l’extension .dwg.', importFailed: 'Le DWG n’a pas pu être traité.', importCancelled: 'Import annulé.',
    mapFallback: 'WMTS était indisponible. Le service WMS de secours est utilisé.', locationDenied: 'L’accès à la position a été refusé.',
    locationUnavailable: 'La position en direct n’est pas disponible dans ce navigateur.', locationError: 'La position n’a pas pu être déterminée.',
    accuracy: 'Précision {{meters}} m', coordinates: 'LUREF {{x}} / {{y}}', fileSize: '{{size}} Mo', featureCount: '{{count}} objets',
    warnings: 'Remarques', warning3d: 'Les valeurs 3D/Z ont été aplaties sur la carte 2D.', warningPaper: 'Les présentations papier ont été ignorées.',
    warningUnsupported: 'Élément non pris en charge : {{type}}', warningBlock: 'Un bloc n’a pas pu être résolu complètement.',
    warningGeneric: '{{warning}}', basemapWmts: 'Satellite (WMTS)', basemapWms: 'Satellite (WMS)', language: 'Langue', alignNorth: 'Orienter vers le nord',
  }},
  en: { translation: {
    appName: 'DWG → Geoportail',
    map: 'Map', upload: 'Load DWG', replace: 'Replace DWG', remove: 'Remove DWG', cancel: 'Cancel',
    layers: 'Layers', layersTitle: 'DWG layers', close: 'Close', showAll: 'Show all', hideAll: 'Hide all',
    locationStart: 'Start location', locationStop: 'Stop location', locationResume: 'Resume following', locationPaused: 'Location following paused',
    fileLocal: 'The DWG remains on your device for this browser session only.',
    noDwg: 'No DWG loaded yet', chooseDwg: 'Choose a 2D DWG', importing: 'Processing DWG …', ready: 'DWG displayed',
    tooLarge: 'The file is larger than 10 MB. Import may take longer, but can still be cancelled.',
    invalidFile: 'Please choose a file with the .dwg extension.', importFailed: 'The DWG could not be processed.', importCancelled: 'Import cancelled.',
    mapFallback: 'WMTS was unavailable. The WMS fallback is now in use.', locationDenied: 'Location access was denied.',
    locationUnavailable: 'Live location is unavailable in this browser.', locationError: 'Your location could not be determined.',
    accuracy: 'Accuracy {{meters}} m', coordinates: 'LUREF {{x}} / {{y}}', fileSize: '{{size}} MB', featureCount: '{{count}} objects',
    warnings: 'Notes', warning3d: '3D/Z values were flattened onto the 2D map.', warningPaper: 'Paper layouts were ignored.',
    warningUnsupported: 'Unsupported entity: {{type}}', warningBlock: 'A block could not be resolved completely.',
    warningGeneric: '{{warning}}', basemapWmts: 'Satellite (WMTS)', basemapWms: 'Satellite (WMS)', language: 'Language', alignNorth: 'Align map to north',
  }},
} as const;

const browserLanguage = typeof navigator === 'undefined' ? 'de' : navigator.language.split('-')[0];

void i18n.use(initReactI18next).init({
  resources,
  lng: ['de', 'fr', 'en'].includes(browserLanguage) ? browserLanguage : 'de',
  fallbackLng: 'de',
  supportedLngs: ['de', 'fr', 'en'],
  interpolation: { escapeValue: false },
});

export default i18n;
