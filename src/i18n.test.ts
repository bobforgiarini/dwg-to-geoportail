import { afterAll, describe, expect, it } from 'vitest';
import i18n from './i18n';

describe('translations', () => {
  afterAll(() => void i18n.changeLanguage('de'));
  it.each(['de', 'fr', 'en'])('contains the complete primary workflow in %s', async (language) => {
    await i18n.changeLanguage(language);
    for (const key of ['appName', 'upload', 'layersTitle', 'locationStart', 'fileLocal', 'warning3d', 'alignNorth']) {
      expect(i18n.t(key)).not.toBe(key);
      expect(i18n.t(key).length).toBeGreaterThan(3);
    }
    expect(i18n.t('appName')).not.toMatch(/BEST/i);
  });
});
