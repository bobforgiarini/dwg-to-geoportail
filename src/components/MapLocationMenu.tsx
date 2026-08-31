import {
  Check,
  Copy,
  ExternalLink,
  Eye,
  Map,
  MapPinned,
  Navigation,
} from 'lucide-react';
import {
  type CSSProperties,
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useTranslation } from 'react-i18next';
import type { LurefCoordinate } from '../types/models';
import {
  createMapLocationLinks,
  formatLurefCoordinate,
  type MapLocationLinks,
} from '../lib/mapLocationLinks';
import { BottomSheet } from './BottomSheet';
import styles from './MapLocationMenu.module.css';

export interface ScreenPoint {
  x: number;
  y: number;
}

export type MapLocationMenuPresentation = 'auto' | 'desktop' | 'mobile';

export interface MapLocationMenuProps {
  open: boolean;
  coordinate: LurefCoordinate | null;
  anchor?: ScreenPoint | null;
  presentation?: MapLocationMenuPresentation;
  onClose: () => void;
  onCoordinateCopied?: (value: string) => void;
  copyCoordinate?: (value: string) => Promise<void>;
}

interface Size {
  width: number;
  height: number;
}

interface ViewportSize {
  width: number;
  height: number;
}

type CopyStatus = 'idle' | 'copied' | 'failed';

const POPOVER_MARGIN = 8;

export function clampContextMenuPosition(
  anchor: ScreenPoint,
  menu: Size,
  viewport: ViewportSize,
  margin = POPOVER_MARGIN,
): ScreenPoint {
  const maximumX = Math.max(margin, viewport.width - menu.width - margin);
  const maximumY = Math.max(margin, viewport.height - menu.height - margin);
  return {
    x: Math.min(maximumX, Math.max(margin, anchor.x)),
    y: Math.min(maximumY, Math.max(margin, anchor.y)),
  };
}

export async function writeClipboardText(value: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  if (typeof document === 'undefined') throw new Error('CLIPBOARD_UNAVAILABLE');

  const temporary = document.createElement('textarea');
  temporary.value = value;
  temporary.readOnly = true;
  temporary.setAttribute('aria-hidden', 'true');
  temporary.style.position = 'fixed';
  temporary.style.opacity = '0';
  document.body.appendChild(temporary);
  temporary.select();
  const copied = typeof document.execCommand === 'function' && document.execCommand('copy');
  temporary.remove();
  if (!copied) throw new Error('CLIPBOARD_UNAVAILABLE');
}

function useAutomaticPresentation(): Exclude<MapLocationMenuPresentation, 'auto'> {
  const query = '(hover: hover) and (pointer: fine)';
  const read = () => typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia(query).matches;
  const [desktop, setDesktop] = useState(read);

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const media = window.matchMedia(query);
    const update = () => setDesktop(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, []);

  return desktop ? 'desktop' : 'mobile';
}

function LocationActions({
  coordinateText,
  links,
  copyStatus,
  onCopy,
  onOpenLink,
}: {
  coordinateText: string;
  links: MapLocationLinks;
  copyStatus: CopyStatus;
  onCopy: () => void;
  onOpenLink: () => void;
}) {
  const { t } = useTranslation();
  const externalLinks = [
    { href: links.geoportail, label: t('mapContext.geoportail'), icon: MapPinned },
    { href: links.googleMaps, label: t('mapContext.googleMaps'), icon: Map },
    { href: links.appleMaps, label: t('mapContext.appleMaps'), icon: Navigation },
  ];

  return (
    <div className={styles.actions} role="menu" aria-label={t('mapContext.title')}>
      <button
        type="button"
        className={`${styles.action} ${styles.coordinateAction}`}
        role="menuitem"
        onClick={onCopy}
        aria-label={t('mapContext.copyCoordinates', { coordinate: coordinateText })}
      >
        {copyStatus === 'copied' ? <Check size={18} aria-hidden="true" /> : <Copy size={18} aria-hidden="true" />}
        <span><small>LUREF</small><strong>{coordinateText}</strong></span>
      </button>
      <span className={styles.copyStatus} role="status" aria-live="polite">
        {copyStatus === 'copied' ? t('mapContext.copied') : copyStatus === 'failed' ? t('mapContext.copyFailed') : ''}
      </span>

      <div className={styles.separator} role="separator" />
      {externalLinks.map(({ href, label, icon: Icon }) => (
        <a
          key={href}
          className={styles.action}
          role="menuitem"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={onOpenLink}
        >
          <Icon size={18} aria-hidden="true" />
          <span>{label}</span>
          <ExternalLink className={styles.externalIcon} size={15} aria-hidden="true" />
        </a>
      ))}

      <div className={styles.separator} role="separator" />
      <a
        className={styles.action}
        role="menuitem"
        href={links.googleStreetView}
        target="_blank"
        rel="noopener noreferrer"
        onClick={onOpenLink}
      >
        <Eye size={18} aria-hidden="true" />
        <span>{t('mapContext.googleStreetView')}</span>
        <ExternalLink className={styles.externalIcon} size={15} aria-hidden="true" />
      </a>
    </div>
  );
}

function DesktopLocationPopover({
  open,
  anchor,
  onClose,
  children,
}: {
  open: boolean;
  anchor: ScreenPoint | null | undefined;
  onClose: () => void;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const popover = useRef<HTMLDivElement>(null);
  const initialAnchor = anchor ?? { x: POPOVER_MARGIN, y: POPOVER_MARGIN };
  const [position, setPosition] = useState(initialAnchor);

  useLayoutEffect(() => {
    if (!open || !popover.current) return;
    const menu = popover.current.getBoundingClientRect();
    const next = clampContextMenuPosition(
      anchor ?? { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      { width: menu.width, height: menu.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPosition((current) => current.x === next.x && current.y === next.y ? current : next);
  }, [anchor?.x, anchor?.y, open]);

  useEffect(() => {
    if (!open) return;
    const handlePointerDown = (event: PointerEvent) => {
      if (!popover.current?.contains(event.target as Node)) onClose();
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    popover.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;
  const style = { left: position.x, top: position.y } satisfies CSSProperties;
  return (
    <div
      ref={popover}
      className={styles.popover}
      style={style}
      aria-label={t('mapContext.title')}
      onContextMenu={(event) => event.preventDefault()}
    >
      {children}
    </div>
  );
}

export function MapLocationMenu({
  open,
  coordinate,
  anchor,
  presentation = 'auto',
  onClose,
  onCoordinateCopied,
  copyCoordinate = writeClipboardText,
}: MapLocationMenuProps) {
  const { t, i18n } = useTranslation();
  const automaticPresentation = useAutomaticPresentation();
  const resolvedPresentation = presentation === 'auto' ? automaticPresentation : presentation;
  const [copyStatus, setCopyStatus] = useState<CopyStatus>('idle');
  const coordinateText = useMemo(
    () => coordinate ? formatLurefCoordinate(coordinate) : '',
    [coordinate],
  );
  const links = useMemo(
    () => coordinate ? createMapLocationLinks(coordinate, i18n.resolvedLanguage) : null,
    [coordinate, i18n.resolvedLanguage],
  );

  useEffect(() => setCopyStatus('idle'), [coordinateText, open]);

  if (!coordinate || !links) return null;
  const copy = async () => {
    try {
      await copyCoordinate(coordinateText);
      setCopyStatus('copied');
      onCoordinateCopied?.(coordinateText);
    } catch {
      setCopyStatus('failed');
    }
  };
  const actions = (
    <LocationActions
      coordinateText={coordinateText}
      links={links}
      copyStatus={copyStatus}
      onCopy={() => void copy()}
      onOpenLink={onClose}
    />
  );

  if (resolvedPresentation === 'mobile') {
    return (
      <BottomSheet
        open={open}
        modal
        className={styles.sheet}
        ariaLabel={t('mapContext.title')}
        closeLabel={t('closeDrawer')}
        onClose={onClose}
      >
        {actions}
      </BottomSheet>
    );
  }

  return (
    <DesktopLocationPopover open={open} anchor={anchor} onClose={onClose}>
      {actions}
    </DesktopLocationPopover>
  );
}
