import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import type { DistanceMeasurementState } from '../types/models';
import { DistanceMeasurementSheet } from './DistanceMeasurementSheet';

function renderSheet(
  measurement: DistanceMeasurementState,
  overrides: Partial<React.ComponentProps<typeof DistanceMeasurementSheet>> = {},
) {
  const props: React.ComponentProps<typeof DistanceMeasurementSheet> = {
    open: true,
    measurement,
    onClose: vi.fn(),
    onSetPoint: vi.fn(),
    onRestart: vi.fn(),
    onSnapEnabledChange: vi.fn(),
    ...overrides,
  };
  return { props, ...render(<DistanceMeasurementSheet {...props} />) };
}

describe('DistanceMeasurementSheet', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
  });

  afterEach(cleanup);

  it('keeps the sheet non-modal so the map remains touchable outside it', () => {
    renderSheet({ phase: 'placing-first', snapEnabled: true });
    const sheet = screen.getByRole('region', { name: i18n.t('measurementTitle') });

    expect(sheet).not.toHaveAttribute('aria-modal');
    expect(sheet.closest('.sheet-shell')).toHaveClass('sheet-dock');
  });

  it('sets the first and second point through one primary action', () => {
    const onSetPoint = vi.fn();
    const firstPoint = { coordinate: [80_000, 70_000] as const, source: 'aim' as const };
    const { rerender, props } = renderSheet(
      { phase: 'placing-first', snapEnabled: true },
      { onSetPoint },
    );

    fireEvent.click(screen.getByRole('button', { name: i18n.t('measurementSetFirstPoint') }));
    expect(onSetPoint).toHaveBeenCalledOnce();

    rerender(
      <DistanceMeasurementSheet
        {...props}
        measurement={{ phase: 'placing-second', snapEnabled: true, firstPoint }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: i18n.t('measurementSetSecondPoint') }));
    expect(onSetPoint).toHaveBeenCalledTimes(2);
  });

  it('shows a localized three-decimal result and restarts explicitly', () => {
    const onRestart = vi.fn();
    renderSheet(
      {
        phase: 'complete',
        snapEnabled: true,
        firstPoint: { coordinate: [80_000, 70_000], source: 'aim' },
        secondPoint: { coordinate: [80_003, 70_004], source: 'cad-snap', snapKind: 'endpoint' },
      },
      { onRestart },
    );

    expect(screen.getByText('5,000 m')).toBeInTheDocument();
    expect(screen.getByText('80000,000 / 70000,000')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: i18n.t('measurementNew') }));
    expect(onRestart).toHaveBeenCalledOnce();
  });

  it('toggles CAD snapping and reports the current snap candidate', () => {
    const onSnapEnabledChange = vi.fn();
    renderSheet(
      { phase: 'placing-first', snapEnabled: true },
      { snapKind: 'intersection', onSnapEnabledChange },
    );

    const snapButton = screen.getByRole('button', { name: i18n.t('measurementCadSnap') });
    expect(snapButton).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(i18n.t('measurementSnapFound', {
      kind: i18n.t('measurementSnapIntersection'),
    }))).toBeInTheDocument();

    fireEvent.click(snapButton);
    expect(onSnapEnabledChange).toHaveBeenCalledWith(false);
  });

  it('uses the shared handle to close the compact sheet', () => {
    const onClose = vi.fn();
    renderSheet({ phase: 'placing-first', snapEnabled: true }, { onClose });

    fireEvent.click(screen.getByRole('button', { name: i18n.t('measurementClose') }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
