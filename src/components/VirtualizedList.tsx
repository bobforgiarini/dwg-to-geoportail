import { useMemo, useState, type CSSProperties, type ReactNode, type UIEvent } from 'react';

interface Props<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderItem: (item: T) => ReactNode;
  ariaLabel: string;
  className?: string;
  rowClassName?: string;
  rowHeight?: number;
  viewportHeight?: number;
  virtualizeAbove?: number;
}

/**
 * A deliberately small fixed-row virtual list for import reports. It keeps
 * hundreds of preflight effects out of the React tree without introducing a
 * runtime dependency or measuring DOM nodes while the bottom sheet animates.
 */
export function VirtualizedList<T>({
  items,
  itemKey,
  renderItem,
  ariaLabel,
  className = '',
  rowClassName = '',
  rowHeight = 64,
  viewportHeight = 272,
  virtualizeAbove = 24,
}: Props<T>) {
  const [scrollTop, setScrollTop] = useState(0);
  const virtualized = items.length > virtualizeAbove;
  const viewport = Math.min(viewportHeight, items.length * rowHeight);
  const overscan = 3;
  const start = virtualized ? Math.max(0, Math.floor(scrollTop / rowHeight) - overscan) : 0;
  const end = virtualized
    ? Math.min(items.length, start + Math.ceil(viewport / rowHeight) + overscan * 2)
    : items.length;
  const visibleItems = useMemo(() => items.slice(start, end), [end, items, start]);

  const handleScroll = (event: UIEvent<HTMLDivElement>) => {
    setScrollTop(event.currentTarget.scrollTop);
  };

  if (!virtualized) {
    return (
      <div className={className} role="list" aria-label={ariaLabel}>
        {visibleItems.map((item) => (
          <div className={rowClassName} role="listitem" key={itemKey(item)}>{renderItem(item)}</div>
        ))}
      </div>
    );
  }

  return (
    <div
      className={className}
      role="list"
      aria-label={ariaLabel}
      onScroll={handleScroll}
      style={{ height: viewport, overflowY: 'auto' }}
    >
      <div style={{ height: items.length * rowHeight, position: 'relative' }}>
        {visibleItems.map((item, offset) => {
          const style: CSSProperties = {
            height: rowHeight,
            left: 0,
            position: 'absolute',
            right: 0,
            top: (start + offset) * rowHeight,
          };
          return (
            <div className={rowClassName} role="listitem" style={style} key={itemKey(item)}>
              {renderItem(item)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
