import type { DwgPreflightReport, DwgPreflightWarning } from '../cad/preflightTypes';

type MissedFontCounts = Record<string, number> | Readonly<Record<string, number>>;

/** Adds renderer-reported font substitutions without mutating the preflight report. */
export function appendFontSubstitutionWarnings(
  report: DwgPreflightReport,
  missedFonts: MissedFontCounts | null | undefined,
): DwgPreflightReport {
  if (!missedFonts) return report;

  const knownFonts = new Set(
    report.warnings
      .filter((warning) => warning.code === 'font-substitution')
      .map((warning) => warning.fontName?.trim().toLocaleLowerCase('en-US'))
      .filter((fontName): fontName is string => Boolean(fontName)),
  );
  const additions: DwgPreflightWarning[] = [];

  for (const [rawFontName, rawCount] of Object.entries(missedFonts)) {
    const fontName = rawFontName.trim();
    const canonicalName = fontName.toLocaleLowerCase('en-US');
    if (!fontName || knownFonts.has(canonicalName) || !Number.isFinite(rawCount) || rawCount <= 0) {
      continue;
    }
    knownFonts.add(canonicalName);
    additions.push({
      code: 'font-substitution',
      fontName,
      affectedCharacterCount: Math.trunc(rawCount),
    });
  }

  if (additions.length === 0) return report;
  return { ...report, warnings: [...report.warnings, ...additions] };
}
