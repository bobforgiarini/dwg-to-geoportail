import { Boxes, Gauge, Layers3, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { CadLoadProfile, DwgPreflightReport } from '../lib/cad/preflightTypes';
import { BottomSheet } from './BottomSheet';
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
}: Props) {
  const { t } = useTranslation();
  const hiddenLayers = profile?.hiddenLayerIds.length ?? 0;
  const hiddenBlocks = profile?.hiddenBlockNames.length ?? 0;
  const estimated = report?.risk.estimatedRenderCost ?? 0;
  const budget = report?.risk.deviceBudget ?? 0;
  const hiddenLayerIds = new Set(profile?.hiddenLayerIds.map((id) => id.toLocaleLowerCase('en-US')) ?? []);
  const hiddenBlockNames = new Set(profile?.hiddenBlockNames.map((name) => name.toLocaleLowerCase('en-US')) ?? []);
  const removedLayerCost = report?.layers
    .filter((layer) => hiddenLayerIds.has(layer.id.toLocaleLowerCase('en-US')))
    .reduce((sum, layer) => sum + layer.expandedEntityCount, 0) ?? 0;
  const removedBlockCost = report?.blocks
    .filter((block) => hiddenBlockNames.has(block.name.toLocaleLowerCase('en-US')) || hiddenBlockNames.has(block.id.toLocaleLowerCase('en-US')))
    .reduce((sum, block) => sum + block.estimatedCost, 0) ?? 0;
  const hiddenCategories = new Set(profile?.hiddenEntityCategories ?? []);
  const counts = report?.entityCounts;
  const categoryCosts = [
    hiddenCategories.has('paper-space') ? (counts?.paperSpaceEntities ?? 0) : 0,
    hiddenCategories.has('image') ? (counts?.images ?? 0) * 13 : 0,
    hiddenCategories.has('ole') ? (counts?.oleObjects ?? 0) * 13 : 0,
    hiddenCategories.has('proxy') ? (counts?.proxyObjects ?? 0) * 5 : 0,
    hiddenCategories.has('3d') ? (counts?.threeDimensional ?? 0) * 17 : 0,
    hiddenCategories.has('text') ? (counts?.texts ?? 0) * 3 : 0,
    hiddenCategories.has('leader') ? ((counts?.leaders ?? 0) + (counts?.mleaders ?? 0)) * 4 : 0,
    hiddenCategories.has('hatch') ? (counts?.hatches ?? 0) * 9 : 0,
  ];
  // Layer, block and category groups can overlap. Subtracting only the largest
  // known group yields a conservative upper bound instead of double-counting.
  const removedCategoryCost = Math.max(0, ...categoryCosts);
  const filteredEstimate = Math.max(0, estimated - Math.max(removedLayerCost, removedBlockCost, removedCategoryCost));
  const high = report?.risk.level === 'high';

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
          <div><dt>{t('preparation.entities')}</dt><dd>{report.entityCounts.modelEntities.toLocaleString()}</dd></div>
          <div><dt>{t('preparation.blocks')}</dt><dd>{report.reachableBlockCount.toLocaleString()}</dd></div>
          <div><dt>{t('preparation.layers')}</dt><dd>{report.layers.length.toLocaleString()}</dd></div>
          <div><dt>{t('preparation.estimatedCost')}</dt><dd>≈ {estimated.toLocaleString()} → ≤ {filteredEstimate.toLocaleString()}</dd></div>
          <div><dt>{t('preparation.deviceBudget')}</dt><dd>{budget.toLocaleString()}</dd></div>
        </dl>
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
