import { memo, useCallback, useMemo, useRef, useState } from 'react';
import { Box, Eye, EyeOff, Gauge, RefreshCw, Search } from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import styles from './BlockSheet.module.css';
import { useSheetContentPresence } from './useSheetContentPresence';

export type LayerSheetCost = 'low' | 'medium' | 'high';

export interface LayerSheetItem {
  id: string;
  name: string;
  visible: boolean;
  objectCount: number;
  cost: LayerSheetCost;
  requiresReload: boolean;
}

export interface LayerSheetLabels {
  ariaLabel: string;
  close: string;
  title: string;
  searchLabel: string;
  searchPlaceholder: string;
  showAll: string;
  hideAll: string;
  noLayers: string;
  noMatches: string;
  reloadRequired: string;
  applyChanges: string;
  visibleCount: (count: number) => string;
  hiddenCount: (count: number) => string;
  visibilitySummary: (visible: number, hidden: number) => string;
  objectCount: (count: number) => string;
  cost: Record<LayerSheetCost, string>;
  costLabel: (cost: string) => string;
  toggleLayer: (name: string, nextVisible: boolean) => string;
}

interface Props {
  open: boolean;
  layers: LayerSheetItem[];
  labels: LayerSheetLabels;
  onClose: () => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onSetAllVisible: (visible: boolean) => void;
  applyPending?: boolean;
  onApplyChanges?: () => void;
}

interface LayerRowProps extends LayerSheetItem {
  labels: LayerSheetLabels;
  onSetVisible: (id: string, visible: boolean) => void;
}

const LayerRow = memo(function LayerRow({
  id,
  name,
  visible,
  objectCount,
  cost,
  requiresReload,
  labels,
  onSetVisible,
}: LayerRowProps) {
  return (
    <button
      type="button"
      className={styles.row}
      data-visible={visible}
      aria-pressed={visible}
      aria-label={labels.toggleLayer(name, !visible)}
      onClick={() => onSetVisible(id, !visible)}
    >
      <span className={styles.visibility} aria-hidden="true">
        {visible ? <Eye size={18} /> : <EyeOff size={18} />}
      </span>

      <span className={styles.rowContent}>
        <span className={styles.rowTitle} title={name}>{name}</span>
        <span className={styles.metrics}>
          <span><Box size={13} aria-hidden="true" />{labels.objectCount(objectCount)}</span>
        </span>
      </span>

      <span className={styles.indicators}>
        <span className={`${styles.cost} ${styles[cost]}`} title={labels.costLabel(labels.cost[cost])}>
          <Gauge size={13} aria-hidden="true" />{labels.cost[cost]}
        </span>
        {requiresReload && (
          <span className={styles.reload} title={labels.reloadRequired} aria-label={labels.reloadRequired}>
            <RefreshCw size={14} aria-hidden="true" />
          </span>
        )}
      </span>
    </button>
  );
});

function normaliseSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function LayerSheet({
  open,
  layers,
  labels,
  onClose,
  onSetVisible,
  onSetAllVisible,
  applyPending = false,
  onApplyChanges,
}: Props) {
  const [query, setQuery] = useState('');
  const onSetVisibleRef = useRef(onSetVisible);
  onSetVisibleRef.current = onSetVisible;
  const publishVisibility = useCallback((id: string, visible: boolean) => {
    onSetVisibleRef.current(id, visible);
  }, []);
  const contentPresent = useSheetContentPresence(open);
  const visibleCount = contentPresent ? layers.filter((layer) => layer.visible).length : 0;
  const hiddenCount = contentPresent ? layers.length - visibleCount : 0;
  const search = normaliseSearch(query);
  const filteredLayers = useMemo(() => {
    if (!contentPresent) return [];
    if (!search) return layers;
    return layers.filter((layer) => (
      layer.name.toLocaleLowerCase().includes(search)
      || layer.id.toLocaleLowerCase().includes(search)
    ));
  }, [contentPresent, layers, search]);

  return (
    <BottomSheet
      open={open}
      modal
      className={styles.sheet}
      ariaLabel={labels.ariaLabel}
      closeLabel={labels.close}
      onClose={onClose}
    >
      {contentPresent && <>
      <header className={`sheet-header ${styles.header}`}>
        <div>
          <h2>{labels.title}</h2>
          <span>{layers.length}</span>
        </div>
      </header>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span className="visually-hidden">{labels.searchLabel}</span>
          <Search size={17} aria-hidden="true" />
          <input
            type="search"
            value={query}
            placeholder={labels.searchPlaceholder}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <div
          className={styles.counts}
          role="status"
          aria-live="polite"
          aria-label={labels.visibilitySummary(visibleCount, hiddenCount)}
        >
          <span><Eye size={15} aria-hidden="true" />{labels.visibleCount(visibleCount)}</span>
          <span><EyeOff size={15} aria-hidden="true" />{labels.hiddenCount(hiddenCount)}</span>
        </div>
      </div>

      <div className={`sheet-actions ${styles.actions}`}>
        <button type="button" disabled={layers.length === 0 || hiddenCount === 0} onClick={() => onSetAllVisible(true)}>
          <Eye size={18} aria-hidden="true" />{labels.showAll}
        </button>
        <button type="button" disabled={layers.length === 0 || visibleCount === 0} onClick={() => onSetAllVisible(false)}>
          <EyeOff size={18} aria-hidden="true" />{labels.hideAll}
        </button>
      </div>

      <div className={styles.groups}>
        {layers.length === 0 && <p className={styles.empty}>{labels.noLayers}</p>}
        {layers.length > 0 && filteredLayers.length === 0 && <p className={styles.empty}>{labels.noMatches}</p>}

        {filteredLayers.length > 0 && (
          <div className={styles.rows}>
            {filteredLayers.map((layer) => (
              <LayerRow
                key={layer.id}
                {...layer}
                labels={labels}
                onSetVisible={publishVisibility}
              />
            ))}
          </div>
        )}
      </div>

      {onApplyChanges && (
        <footer className={styles.footer}>
          <button type="button" disabled={!applyPending} onClick={onApplyChanges}>
            <RefreshCw size={17} aria-hidden="true" />{labels.applyChanges}
          </button>
        </footer>
      )}
      </>}
    </BottomSheet>
  );
}
