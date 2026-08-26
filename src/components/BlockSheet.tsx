import { useId, useMemo, useState } from 'react';
import {
  Box,
  Boxes,
  ChevronDown,
  Eye,
  EyeOff,
  ExternalLink,
  Gauge,
  RefreshCw,
  Search,
  Type,
  type LucideIcon,
} from 'lucide-react';
import { BottomSheet } from './BottomSheet';
import styles from './BlockSheet.module.css';
import { useSheetContentPresence } from './useSheetContentPresence';

export type BlockSheetGroup = 'named' | 'system' | 'xref';
export type BlockSheetCost = 'low' | 'medium' | 'high';

export interface BlockSheetItem {
  id: string;
  name: string;
  group: BlockSheetGroup;
  visible: boolean;
  instanceCount: number;
  recursiveObjectCount: number;
  textCount: number;
  hatchCount: number;
  mainLayer?: string;
  cost: BlockSheetCost;
  requiresReload: boolean;
}

export interface BlockSheetLabels {
  ariaLabel: string;
  close: string;
  title: string;
  searchLabel: string;
  searchPlaceholder: string;
  showAll: string;
  hideAll: string;
  namedGroup: string;
  systemGroup: string;
  xrefGroup: string;
  noBlocks: string;
  noMatches: string;
  reloadRequired: string;
  applyChanges: string;
  visibleCount: (count: number) => string;
  hiddenCount: (count: number) => string;
  visibilitySummary: (visible: number, hidden: number) => string;
  groupCount: (visible: number, total: number) => string;
  instanceCount: (count: number) => string;
  objectCount: (count: number) => string;
  textCount: (count: number) => string;
  hatchCount: (count: number) => string;
  mainLayer: (name: string) => string;
  cost: Record<BlockSheetCost, string>;
  costLabel: (cost: string) => string;
  toggleBlock: (name: string, nextVisible: boolean) => string;
}

interface Props {
  open: boolean;
  blocks: BlockSheetItem[];
  labels: BlockSheetLabels;
  onClose: () => void;
  onSetVisible: (id: string, visible: boolean) => void;
  onSetAllVisible: (visible: boolean) => void;
  applyPending?: boolean;
  onApplyChanges?: () => void;
}

interface GroupDefinition {
  id: BlockSheetGroup;
  icon: LucideIcon;
  label: string;
}

const GROUP_ORDER: BlockSheetGroup[] = ['named', 'system', 'xref'];

function normaliseSearch(value: string) {
  return value.trim().toLocaleLowerCase();
}

export function BlockSheet({ open, blocks, labels, onClose, onSetVisible, onSetAllVisible, applyPending = false, onApplyChanges }: Props) {
  const baseId = useId();
  const [query, setQuery] = useState('');
  const contentPresent = useSheetContentPresence(open);
  const [expanded, setExpanded] = useState<Record<BlockSheetGroup, boolean>>({
    named: true,
    system: false,
    xref: true,
  });

  const visibleCount = contentPresent ? blocks.filter((block) => block.visible).length : 0;
  const hiddenCount = contentPresent ? blocks.length - visibleCount : 0;
  const search = normaliseSearch(query);
  const filteredBlocks = useMemo(() => {
    if (!contentPresent) return [];
    if (!search) return blocks;
    return blocks.filter((block) => (
      block.name.toLocaleLowerCase().includes(search)
      || block.mainLayer?.toLocaleLowerCase().includes(search)
    ));
  }, [blocks, contentPresent, search]);

  const groupDefinitions: GroupDefinition[] = [
    { id: 'named', icon: Box, label: labels.namedGroup },
    { id: 'system', icon: Boxes, label: labels.systemGroup },
    { id: 'xref', icon: ExternalLink, label: labels.xrefGroup },
  ];

  const groups = contentPresent ? GROUP_ORDER.map((groupId) => ({
    definition: groupDefinitions.find(({ id }) => id === groupId)!,
    blocks: filteredBlocks.filter((block) => block.group === groupId),
    totalBlocks: blocks.filter((block) => block.group === groupId),
  })).filter(({ totalBlocks }) => totalBlocks.length > 0) : [];

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
          <span>{blocks.length}</span>
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
        <button type="button" disabled={blocks.length === 0 || hiddenCount === 0} onClick={() => onSetAllVisible(true)}>
          <Eye size={18} aria-hidden="true" />{labels.showAll}
        </button>
        <button type="button" disabled={blocks.length === 0 || visibleCount === 0} onClick={() => onSetAllVisible(false)}>
          <EyeOff size={18} aria-hidden="true" />{labels.hideAll}
        </button>
      </div>

      <div className={styles.groups}>
        {blocks.length === 0 && <p className={styles.empty}>{labels.noBlocks}</p>}
        {blocks.length > 0 && filteredBlocks.length === 0 && <p className={styles.empty}>{labels.noMatches}</p>}

        {groups.map(({ definition, blocks: groupBlocks, totalBlocks }) => {
          if (search && groupBlocks.length === 0) return null;
          const groupVisibleCount = totalBlocks.filter((block) => block.visible).length;
          const groupOpen = search.length > 0 || expanded[definition.id];
          const groupContentId = `${baseId}-${definition.id}`;
          const GroupIcon = definition.icon;

          return (
            <section className={styles.group} key={definition.id}>
              <h3>
                <button
                  type="button"
                  aria-expanded={groupOpen}
                  aria-controls={groupContentId}
                  onClick={() => setExpanded((current) => ({ ...current, [definition.id]: !current[definition.id] }))}
                >
                  <span className={styles.groupIcon}><GroupIcon size={17} aria-hidden="true" /></span>
                  <span className={styles.groupName}>{definition.label}</span>
                  <small>{labels.groupCount(groupVisibleCount, totalBlocks.length)}</small>
                  <ChevronDown className={styles.chevron} size={18} aria-hidden="true" />
                </button>
              </h3>

              <div id={groupContentId} className={styles.rows} hidden={!groupOpen}>
                {groupBlocks.map((block) => (
                  <button
                    type="button"
                    className={styles.row}
                    data-visible={block.visible}
                    key={block.id}
                    aria-pressed={block.visible}
                    aria-label={labels.toggleBlock(block.name, !block.visible)}
                    onClick={() => onSetVisible(block.id, !block.visible)}
                  >
                    <span className={styles.visibility} aria-hidden="true">
                      {block.visible ? <Eye size={18} /> : <EyeOff size={18} />}
                    </span>

                    <span className={styles.rowContent}>
                      <span className={styles.rowTitle} title={block.name}>{block.name}</span>
                      <span className={styles.metrics}>
                        <span><Boxes size={13} aria-hidden="true" />{labels.instanceCount(block.instanceCount)}</span>
                        <span><Box size={13} aria-hidden="true" />{labels.objectCount(block.recursiveObjectCount)}</span>
                        {block.textCount > 0 && <span><Type size={13} aria-hidden="true" />{labels.textCount(block.textCount)}</span>}
                        {block.hatchCount > 0 && <span>{labels.hatchCount(block.hatchCount)}</span>}
                      </span>
                      {block.mainLayer && <span className={styles.layer}>{labels.mainLayer(block.mainLayer)}</span>}
                    </span>

                    <span className={styles.indicators}>
                      <span className={`${styles.cost} ${styles[block.cost]}`} title={labels.costLabel(labels.cost[block.cost])}>
                        <Gauge size={13} aria-hidden="true" />{labels.cost[block.cost]}
                      </span>
                      {block.requiresReload && (
                        <span className={styles.reload} title={labels.reloadRequired} aria-label={labels.reloadRequired}>
                          <RefreshCw size={14} aria-hidden="true" />
                        </span>
                      )}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          );
        })}
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
