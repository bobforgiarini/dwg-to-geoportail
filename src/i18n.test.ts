import { afterAll, describe, expect, it } from 'vitest';
import i18n, { resources } from './i18n';

function flatten(value: object, prefix = ''): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') result.set(path, child);
    if (child && typeof child === 'object') {
      for (const [nestedKey, nestedValue] of flatten(child, path)) result.set(nestedKey, nestedValue);
    }
  }
  return result;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/{{\s*([^},\s]+)[^}]*}}/g)].map((match) => match[1]).sort();
}

describe('translations', () => {
  afterAll(() => void i18n.changeLanguage('de'));
  it.each(['de', 'fr', 'en'])('contains the complete primary workflow in %s', async (language) => {
    await i18n.changeLanguage(language);
    for (const key of ['appName', 'upload', 'layersTitle', 'locationStart', 'fileLocal', 'warning3d', 'fontSubstitutionWarning', 'alignNorth', 'objectDetails', 'hideObject', 'hideLayer', 'bringToFront', 'sendToBack', 'drawOrderBudgetExceeded', 'showHidden', 'hideTexts', 'showTexts', 'cadVisibility', 'openDrawer', 'closeDrawer', 'switchToMlight', 'switchToLegacy', 'cadControlsTitle', 'openCadControls', 'dwgFile', 'cadDisplay', 'basemapOff', 'basemapToggle', 'hideBasemap', 'showBasemap', 'gpsAccuracy', 'measurementTitle', 'measurementOpen', 'measurementClose', 'measurementAimFirst', 'measurementAimSecond', 'measurementComplete', 'measurementSetFirstPoint', 'measurementSetSecondPoint', 'measurementNew', 'measurementDistance', 'measurementPointOne', 'measurementPointTwo', 'measurementCadSnap', 'measurementSnapFound', 'measurementSnapEndpoint', 'measurementSnapVertex', 'measurementSnapIntersection', 'measurementSnapMidpoint', 'measurementSnapCenter', 'measurementSnapNearest', 'appearance.title', 'appearance.fillOpacity', 'spatialFilter.title', 'spatialFilter.help', 'preparation.filesTitle', 'preparation.xrefs.add', 'preparation.xrefs.status.ambiguous', 'preparation.annotationTitle', 'preparation.annotationFailOpen', 'preparation.spatialTitle', 'preparation.effectReason.outside-luxembourg-buffer', 'preparation.effectEstimatedCost', 'mlightProgress.finalizing']) {
      expect(i18n.t(key)).not.toBe(key);
      expect(i18n.t(key).length).toBeGreaterThan(3);
    }
    expect(i18n.t('appName')).not.toMatch(/BEST/i);
  });

  it('keeps every nested key and interpolation placeholder in DE, FR and EN', () => {
    const translations = Object.fromEntries(Object.entries(resources).map(([language, resource]) => [
      language,
      flatten(resource.translation),
    ])) as Record<'de' | 'fr' | 'en', Map<string, string>>;
    const referenceKeys = [...translations.de.keys()].sort();

    for (const language of ['fr', 'en'] as const) {
      expect([...translations[language].keys()].sort()).toEqual(referenceKeys);
      for (const key of referenceKeys) {
        expect(placeholders(translations[language].get(key) ?? '')).toEqual(
          placeholders(translations.de.get(key) ?? ''),
        );
      }
    }
  });
});
