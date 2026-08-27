import {
  Boxes,
  FilePlus2,
  FileText,
  Gauge,
  Languages,
  Layers3,
  Link2,
  MapPinned,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type {
  CadLoadProfile,
  DwgExternalReference,
  DwgPreflightReport,
  DwgProfileEffect,
} from '../lib/cad/preflightTypes';
import { BottomSheet } from './BottomSheet';
import { VirtualizedList } from './VirtualizedList';
import styles from './DwgPreparationSheet.module.css';

interface Props {
  open: boolean;
  report: DwgPreflightReport | null;
  profile: CadLoadProfile | null;
  onLoadFull: () => void;
  onLoadRecommended: () => void;
  onApplySelection: () => void;
  onEditLayers: () => void;
  onEditBlocks: () => void;
  onCancel: () => void;
  failed?: boolean;
  onTryFull?: () => void;
  onDesktopCheck?: () => void;
  spatialFilterEnabled?: boolean;
  onSpatialFilterChange?: (enabled: boolean) => void;
  annotationScaleId?: string | null;
  onAnnotationScaleChange?: (scaleId: string) => void;
  onAddXrefs?: () => void;
  onChooseXrefCandidate?: (xrefId: string, candidateFileId: string) => void;
}

function formatFileSize(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(timestamp: number | null, locale: string): string {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return '—';
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(new Date(timestamp));
}

function matchesPolicy(effect: DwgProfileEffect, policy: DwgProfileEffect['policy']): boolean {
  return effect.policy === policy && effect.kind !== 'boundary' && effect.kind !== 'xref';
}

function canonical(value: string): string {
  return value.trim().toLocaleLowerCase('en-US');
}

function effectSelection(
  effect: DwgProfileEffect,
  profile: CadLoadProfile | null,
  spatialEnabled: boolean,
): boolean {
  // Fixed model-space exclusions are not part of the optional recommended
  // profile and therefore cannot be re-enabled by "Vollständig laden".
  if (effect.policy === 'required' && effect.kind !== 'boundary') return true;
  if (!profile) return effect.kind === 'boundary' ? spatialEnabled : effect.selected;
  if (effect.kind === 'boundary') return spatialEnabled;
  if (effect.kind === 'layer') {
    const identities = new Set([
      canonical(effect.id.replace(/^layer:/, '')),
      canonical(effect.label),
    ]);
    return profile.hiddenLayerIds.some((id) => identities.has(canonical(id)));
  }
  if (effect.kind === 'block' || effect.kind === 'xref') {
    const identities = new Set([
      canonical(effect.id.replace(/^block:/, '')),
      canonical(effect.label),
    ]);
    return profile.hiddenBlockNames.some((name) => identities.has(canonical(name)));
  }
  if (effect.kind === 'category') {
    const category = effect.id.replace(/^category:/, '');
    return profile.hiddenEntityCategories.includes(category as CadLoadProfile['hiddenEntityCategories'][number]);
  }
  return effect.selected;
}

interface EffectListProps {
  effects: readonly DwgProfileEffect[];
  ariaLabel: string;
  objectLabel: (count: number) => string;
  costLabel: (cost: number) => string;
  reasonLabel: (effect: DwgProfileEffect) => string;
  selectedLabel: string;
  keptLabel: string;
}

function EffectList({
  effects,
  ariaLabel,
  objectLabel,
  costLabel,
  reasonLabel,
  selectedLabel,
  keptLabel,
}: EffectListProps) {
  return (
    <VirtualizedList
      className={styles.effectList}
      rowClassName={styles.effectRow}
      items={effects}
      itemKey={(effect) => effect.id}
      ariaLabel={ariaLabel}
      rowHeight={66}
      renderItem={(effect) => (
        <>
          <div className={styles.effectHeading}>
            <strong title={effect.label}>{effect.label}</strong>
            <span className={effect.selected ? styles.excluded : styles.kept}>
              {effect.selected ? selectedLabel : keptLabel}
            </span>
          </div>
          <div className={styles.effectMeta}>
            <span>{reasonLabel(effect)}</span>
            <span>{objectLabel(effect.affectedEntityCount)}</span>
            <span>{costLabel(effect.estimatedCost)}</span>
          </div>
        </>
      )}
    />
  );
}

interface XrefRowProps {
  xref: DwgExternalReference;
  onChooseXrefCandidate?: (xrefId: string, candidateFileId: string) => void;
  statusLabel: string;
  candidateLabel: string;
  chooseLabel: string;
  locale: string;
  kindLabel: string;
}

function XrefRow({ xref, onChooseXrefCandidate, statusLabel, candidateLabel, chooseLabel, locale, kindLabel }: XrefRowProps) {
  return (
    <div className={styles.xrefRow}>
      <Link2 size={16} aria-hidden="true" />
      <div className={styles.xrefDetails}>
        <strong>{xref.name}</strong>
        <span>{statusLabel} · {kindLabel}</span>
        {xref.sourcePath && <small title={xref.sourcePath}>{xref.sourcePath}</small>}
      </div>
      {xref.status === 'ambiguous' && xref.candidateFileIds.length > 0 && onChooseXrefCandidate && (
        <label className={styles.candidateSelect}>
          <span>{candidateLabel}</span>
          <select
            aria-label={`${chooseLabel}: ${xref.name}`}
            defaultValue=""
            onChange={(event) => {
              if (event.currentTarget.value) onChooseXrefCandidate(xref.id, event.currentTarget.value);
            }}
          >
            <option value="" disabled>{chooseLabel}</option>
            {xref.candidateFileIds.map((candidateId) => {
              const candidate = xref.candidateFiles?.find((file) => file.id === candidateId);
              const label = candidate
                ? `${candidate.name} · ${formatFileSize(candidate.size)} · ${formatDate(candidate.lastModified, locale)}`
                : candidateId;
              return <option key={candidateId} value={candidateId}>{label}</option>;
            })}
          </select>
        </label>
      )}
    </div>
  );
}

export function DwgPreparationSheet({
  open,
  report,
  profile,
  onLoadFull,
  onLoadRecommended,
  onApplySelection,
  onEditLayers,
  onEditBlocks,
  onCancel,
  failed = false,
  onTryFull,
  onDesktopCheck,
  spatialFilterEnabled,
  onSpatialFilterChange,
  annotationScaleId,
  onAnnotationScaleChange,
  onAddXrefs,
  onChooseXrefCandidate,
}: Props) {
  const { t, i18n } = useTranslation();
  const hiddenLayers = profile?.hiddenLayerIds.length ?? 0;
  const hiddenBlocks = profile?.hiddenBlockNames.length ?? 0;
  const estimated = report?.risk.estimatedRenderCost ?? 0;
  const budget = report?.risk.deviceBudget ?? 0;
  const impact = report?.impact;
  const spatialEnabled = spatialFilterEnabled ?? report?.spatialFilter?.enabled ?? true;
  const baseEffects = report?.effects ?? [];
  const liveEffects = baseEffects.map((effect) => ({
    ...effect,
    selected: effectSelection(effect, profile, spatialEnabled),
  }));
  const recommendedLayers = new Set(report?.recommendedProfile.hiddenLayerIds.map(canonical) ?? []);
  const recommendedBlocks = new Set(report?.recommendedProfile.hiddenBlockNames.map(canonical) ?? []);
  const liveEffectIds = new Set(liveEffects.map((effect) => canonical(effect.id)));
  const manualLayerEffects = (profile?.hiddenLayerIds ?? []).flatMap((layerId) => {
    const layer = report?.layers.find((candidate) => (
      canonical(candidate.id) === canonical(layerId) || canonical(candidate.name) === canonical(layerId)
    ));
    if (!layer || recommendedLayers.has(canonical(layerId)) || liveEffectIds.has(canonical(`layer:${layer.id}`))) return [];
    return [{
      id: `manual:layer:${layer.id}`,
      kind: 'layer' as const,
      policy: 'user' as const,
      reason: 'user-selection' as const,
      label: layer.name,
      affectedEntityCount: layer.expandedEntityCount,
      estimatedCost: layer.expandedEntityCount,
      selected: true,
    }];
  });
  const manualBlockEffects = (profile?.hiddenBlockNames ?? []).flatMap((blockName) => {
    const block = report?.blocks.find((candidate) => (
      canonical(candidate.id) === canonical(blockName) || canonical(candidate.name) === canonical(blockName)
    ));
    if (!block || recommendedBlocks.has(canonical(blockName)) || liveEffectIds.has(canonical(`block:${block.id}`))) return [];
    return [{
      id: `manual:block:${block.id}`,
      kind: block.kind === 'xref' ? 'xref' as const : 'block' as const,
      policy: 'user' as const,
      reason: block.kind === 'xref' ? 'unresolved-xref' as const : 'user-selection' as const,
      label: block.name,
      affectedEntityCount: block.expandedEntityCount,
      estimatedCost: block.estimatedCost,
      selected: true,
    }];
  });
  const effects = [...liveEffects, ...manualLayerEffects, ...manualBlockEffects];
  const fixedEffects = effects.filter((effect) => matchesPolicy(effect, 'required'));
  const recommendedEffects = effects.filter((effect) => matchesPolicy(effect, 'recommended'));
  const manualEffects = effects.filter((effect) => matchesPolicy(effect, 'user'));
  const boundaryEffects = effects.filter((effect) => effect.kind === 'boundary');
  const xrefEffects = effects.filter((effect) => effect.kind === 'xref');
  const annotation = report?.annotationScale;
  const selectedScale = annotationScaleId
    ?? annotation?.selectedScaleId
    ?? annotation?.savedScaleId
    ?? annotation?.availableScales.find((scale) => scale.isDefault)?.id
    ?? '';
  const high = report?.risk.level === 'high';
  const locale = i18n.resolvedLanguage || i18n.language || 'de';
  const effectListProps = {
    objectLabel: (count: number) => t('preparation.effectObjectCount', { count }),
    costLabel: (cost: number) => t('preparation.effectEstimatedCost', { cost: cost.toLocaleString(locale) }),
    reasonLabel: (effect: DwgProfileEffect) => t(`preparation.effectReason.${effect.reason}`),
    selectedLabel: t('preparation.effectExcluded'),
    keptLabel: t('preparation.effectKept'),
  };

  if (failed) {
    return (
      <BottomSheet
        open={open}
        modal
        className={styles.sheet}
        ariaLabel={t('preparation.failedTitle')}
        closeLabel={t('cancel')}
        onClose={onCancel}
      >
        <header className={`sheet-header ${styles.header}`}><div><h2>{t('preparation.failedTitle')}</h2></div></header>
        <div className={`${styles.risk} ${styles.high}`}>
          <TriangleAlert size={20} aria-hidden="true" />
          <div><strong>{t('preparation.failedHeading')}</strong><p>{t('preparation.failedExplanation')}</p></div>
        </div>
        <div className={styles.primaryActions}>
          <button type="button" className={styles.full} onClick={onTryFull}>{t('preparation.tryFull')}</button>
          <button type="button" onClick={onDesktopCheck}>{t('preparation.checkDesktop')}</button>
          <button type="button" className={styles.cancel} onClick={onCancel}>{t('cancel')}</button>
        </div>
        <p className={styles.localNote}>{t('preparation.safariCrashWarning')}</p>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      open={open}
      modal
      className={styles.sheet}
      ariaLabel={t('preparation.title')}
      closeLabel={t('cancel')}
      onClose={onCancel}
    >
      <header className={`sheet-header ${styles.header}`}>
        <div>
          <h2>{t('preparation.title')}</h2>
          <span>{report?.risk.level ? t(`preparation.risk.${report.risk.level}`) : ''}</span>
        </div>
      </header>

      <div className={`${styles.risk} ${high ? styles.high : styles.elevated}`}>
        {high ? <TriangleAlert size={20} aria-hidden="true" /> : <Gauge size={20} aria-hidden="true" />}
        <div>
          <strong>{t(high ? 'preparation.highTitle' : 'preparation.elevatedTitle')}</strong>
          <p>{t('preparation.explanation')}</p>
        </div>
      </div>

      {report && (
        <dl className={styles.metrics}>
          <div><dt>{t('preparation.entities')}</dt><dd>{report.entityCounts.modelEntities.toLocaleString(locale)}</dd></div>
          <div><dt>{t('preparation.blocks')}</dt><dd>{report.reachableBlockCount.toLocaleString(locale)}</dd></div>
          <div><dt>{t('preparation.layers')}</dt><dd>{report.layers.length.toLocaleString(locale)}</dd></div>
          <div>
            <dt>{t('preparation.impactEntities')}</dt>
            <dd>{impact
              ? `${impact.before.entityCount.toLocaleString(locale)} → ${impact.recommended.entityCount.toLocaleString(locale)}`
              : report.entityCounts.modelEntities.toLocaleString(locale)}</dd>
          </div>
          <div>
            <dt>{t('preparation.impactEstimatedCost')}</dt>
            <dd>≈ {impact
              ? `${impact.before.estimatedCost.toLocaleString(locale)} → ${impact.recommended.estimatedCost.toLocaleString(locale)}`
              : estimated.toLocaleString(locale)}</dd>
          </div>
          <div><dt>{t('preparation.deviceBudget')}</dt><dd>≈ {budget.toLocaleString(locale)}</dd></div>
        </dl>
      )}

      {report && (
        <section className={styles.section} aria-labelledby="preparation-files-title">
          <div className={styles.sectionHeading}>
            <FileText size={17} aria-hidden="true" />
            <h3 id="preparation-files-title">{t('preparation.filesTitle')}</h3>
          </div>
          <div className={styles.mainFile}>
            <strong>{report.file.name ?? t('preparation.unnamedFile')}</strong>
            <span>{formatFileSize(report.file.size)} · {formatDate(report.file.lastModified, locale)}</span>
          </div>
          {(report.externalReferences?.length ?? 0) > 0 ? (
            <div className={styles.xrefList}>
              {report.externalReferences?.map((xref) => (
                <XrefRow
                  key={xref.id}
                  xref={xref}
                  onChooseXrefCandidate={onChooseXrefCandidate}
                  statusLabel={t(`preparation.xrefs.status.${xref.status}`)}
                  candidateLabel={t('preparation.xrefs.candidate')}
                  chooseLabel={t('preparation.xrefs.chooseCandidate')}
                  locale={locale}
                  kindLabel={t(`preparation.xrefs.kind.${xref.kind}`)}
                />
              ))}
            </div>
          ) : <p className={styles.empty}>{t('preparation.xrefs.none')}</p>}
          {xrefEffects.length > 0 && (
            <EffectList effects={xrefEffects} ariaLabel={t('preparation.xrefs.effects')} {...effectListProps} />
          )}
          {onAddXrefs && (
            <button type="button" className={styles.inlineAction} onClick={onAddXrefs}>
              <FilePlus2 size={16} aria-hidden="true" />{t('preparation.xrefs.add')}
            </button>
          )}
        </section>
      )}

      {annotation && annotation.availableScales.length > 0 && (
        <section className={styles.section} aria-labelledby="preparation-scale-title">
          <div className={styles.sectionHeading}>
            <Languages size={17} aria-hidden="true" />
            <h3 id="preparation-scale-title">{t('preparation.annotationTitle')}</h3>
          </div>
          <label className={styles.field}>
            <span>{t('preparation.annotationScale')}</span>
            <select
              value={selectedScale}
              disabled={!onAnnotationScaleChange}
              onChange={(event) => onAnnotationScaleChange?.(event.currentTarget.value)}
            >
              {annotation.availableScales.map((scale) => (
                <option key={scale.id} value={scale.id}>
                  {scale.name}{scale.id === annotation.savedScaleId ? ` · ${t('preparation.annotationSaved')}` : ''}
                </option>
              ))}
            </select>
          </label>
          {annotation.failOpen && <p className={styles.warning}>{t('preparation.annotationFailOpen')}</p>}
        </section>
      )}

      {report?.spatialFilter && (
        <section className={styles.section} aria-labelledby="preparation-spatial-title">
          <div className={styles.sectionHeading}>
            <MapPinned size={17} aria-hidden="true" />
            <h3 id="preparation-spatial-title">{t('preparation.spatialTitle')}</h3>
          </div>
          <label className={styles.toggleRow}>
            <span>
              <strong>{t('preparation.spatialToggle')}</strong>
              <small>{t('preparation.spatialBuffer', { meters: report.spatialFilter.bufferMeters.toLocaleString(locale) })}</small>
            </span>
            <input
              type="checkbox"
              checked={spatialEnabled}
              disabled={!onSpatialFilterChange}
              onChange={(event) => onSpatialFilterChange?.(event.currentTarget.checked)}
            />
          </label>
          <div className={styles.compactMetrics}>
            <span>{t('preparation.spatialRetained', { count: report.spatialFilter.retainedRootEntityCount })}</span>
            <span>{t('preparation.spatialRemoved', { count: report.spatialFilter.removedRootEntityCount })}</span>
            <span>{t('preparation.spatialUnknown', { count: report.spatialFilter.unknownRootEntityCount })}</span>
          </div>
          {boundaryEffects.length > 0 && (
            <EffectList effects={boundaryEffects} ariaLabel={t('preparation.spatialEffects')} {...effectListProps} />
          )}
        </section>
      )}

      <section className={styles.section} aria-labelledby="preparation-fixed-title">
        <div className={styles.sectionHeading}>
          <ShieldCheck size={17} aria-hidden="true" />
          <h3 id="preparation-fixed-title">{t('preparation.fixedTitle')}</h3>
          <span className={styles.sectionCount}>{fixedEffects.length}</span>
        </div>
        {fixedEffects.length > 0 ? (
          <EffectList effects={fixedEffects} ariaLabel={t('preparation.fixedTitle')} {...effectListProps} />
        ) : <p className={styles.empty}>{t('preparation.noEffects')}</p>}
      </section>

      <section className={styles.section} aria-labelledby="preparation-recommended-title">
        <div className={styles.sectionHeading}>
          <Gauge size={17} aria-hidden="true" />
          <h3 id="preparation-recommended-title">{t('preparation.recommendedTitle')}</h3>
          <span className={styles.sectionCount}>{recommendedEffects.length}</span>
        </div>
        {recommendedEffects.length > 0 ? (
          <EffectList effects={recommendedEffects} ariaLabel={t('preparation.recommendedTitle')} {...effectListProps} />
        ) : <p className={styles.empty}>{t('preparation.noEffects')}</p>}
      </section>

      <section className={styles.section} aria-labelledby="preparation-manual-title">
        <div className={styles.sectionHeading}>
          <SlidersHorizontal size={17} aria-hidden="true" />
          <h3 id="preparation-manual-title">{t('preparation.manualTitle')}</h3>
          <span className={styles.sectionCount}>{manualEffects.length}</span>
        </div>
        {manualEffects.length > 0 && (
          <EffectList effects={manualEffects} ariaLabel={t('preparation.manualTitle')} {...effectListProps} />
        )}
        <div className={styles.selectionActions}>
          <button type="button" onClick={onEditLayers}>
            <Layers3 size={18} aria-hidden="true" />
            <span>{t('preparation.chooseLayers')}</span>
            <small>{t('preparation.hiddenCount', { count: hiddenLayers })}</small>
          </button>
          <button type="button" onClick={onEditBlocks}>
            <Boxes size={18} aria-hidden="true" />
            <span>{t('preparation.chooseBlocks')}</span>
            <small>{t('preparation.hiddenCount', { count: hiddenBlocks })}</small>
          </button>
        </div>
      </section>

      <div className={styles.primaryActions}>
        <button type="button" className={styles.recommended} onClick={onLoadRecommended}>
          <ShieldCheck size={18} aria-hidden="true" />{t('preparation.loadRecommended')}
        </button>
        {(hiddenLayers > 0 || hiddenBlocks > 0) && (
          <button type="button" onClick={onApplySelection}>{t('preparation.loadSelection')}</button>
        )}
        <button type="button" className={styles.full} onClick={onLoadFull}>{t('preparation.loadFull')}</button>
        <button type="button" className={styles.cancel} onClick={onCancel}>{t('cancel')}</button>
      </div>

      <p className={styles.localNote}>{t('preparation.fullWarning')}</p>
    </BottomSheet>
  );
}
