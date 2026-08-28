import { cleanup, fireEvent, render, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { BottomSheet } from './BottomSheet';
import { CadControlSheet } from './CadControlSheet';
import { LayerSheet } from './LayerSheet';
import { createLayerSheetLabels } from './layerSheetModel';
import { LoadingSpinner } from './LoadingSpinner';
import { MapActionControls } from './MapActionControls';
import { MapCenterCrosshair } from './MapCenterCrosshair';
import { MapStatusBadges } from './MapStatusBadges';
import { SelectionPanel } from './SelectionPanel';

describe('shared map UI', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('de');
  });

  afterEach(cleanup);

  it('groups layer and CAD actions separately from location and fit actions', () => {
    const onLocation = vi.fn();
    const onFitDrawing = vi.fn();
    const onOpenLayers = vi.fn();
    const onOpenBlocks = vi.fn();
    const onToggleCadControls = vi.fn();
    const onToggleMeasurement = vi.fn();
    const { container, getByRole } = render(
      <MapActionControls
        locationMode="paused"
        fitDisabled={false}
        layerCount={12}
        blockCount={4}
        blocksOpen={false}
        cadControlsOpen
        measurementActive={false}
        hiddenObjectCount={3}
        onLocation={onLocation}
        onFitDrawing={onFitDrawing}
        onOpenLayers={onOpenLayers}
        onOpenBlocks={onOpenBlocks}
        onToggleCadControls={onToggleCadControls}
        onToggleMeasurement={onToggleMeasurement}
      />,
    );

    const top = container.querySelector('.map-action-group-top') as HTMLElement;
    const bottom = container.querySelector('.map-action-group-bottom') as HTMLElement;
    expect(within(top).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      i18n.t('layers'),
      i18n.t('blocksTitle'),
      i18n.t('openCadControls'),
    ]);
    expect(within(bottom).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual([
      i18n.t('measurementOpen'),
      i18n.t('locationResume'),
      i18n.t('fitDrawing'),
    ]);

    fireEvent.click(getByRole('button', { name: i18n.t('measurementOpen') }));
    fireEvent.click(getByRole('button', { name: i18n.t('locationResume') }));
    fireEvent.click(getByRole('button', { name: i18n.t('fitDrawing') }));
    fireEvent.click(getByRole('button', { name: i18n.t('layers') }));
    fireEvent.click(getByRole('button', { name: i18n.t('blocksTitle') }));
    fireEvent.click(getByRole('button', { name: i18n.t('openCadControls') }));
    expect(onLocation).toHaveBeenCalledOnce();
    expect(onFitDrawing).toHaveBeenCalledOnce();
    expect(onOpenLayers).toHaveBeenCalledOnce();
    expect(onOpenBlocks).toHaveBeenCalledOnce();
    expect(onToggleCadControls).toHaveBeenCalledOnce();
    expect(onToggleMeasurement).toHaveBeenCalledOnce();
  });

  it('toggles the basemap and presents LUREF coordinates and GPS accuracy', () => {
    const onToggleBasemap = vi.fn();
    const onToggleCadastre = vi.fn();
    const { getByRole, getByText, rerender } = render(
      <MapStatusBadges
        basemapHealth={{ mode: 'wmts', status: 'ready', generation: 0, transitionReason: 'tile-loaded' }}
        basemapVisible
        cadastreVisible={false}
        coordinate={[80_218.123, 87_074.509]}
        accuracy={7.6}
        onToggleBasemap={onToggleBasemap}
        onToggleCadastre={onToggleCadastre}
      />,
    );

    const toggle = getByRole('button', { name: i18n.t('basemapToggle') });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    expect(toggle).toHaveAttribute('title', i18n.t('hideBasemap'));
    expect(getByText(i18n.t('basemapWmts'))).toBeInTheDocument();
    expect(getByText('LUREF 80218.12 / 87074.51')).toBeInTheDocument();
    expect(getByText('GPS ±8 m')).toBeInTheDocument();
    fireEvent.click(toggle);
    expect(onToggleBasemap).toHaveBeenCalledOnce();
    const cadastre = getByRole('button', { name: i18n.t('cadastreToggle') });
    expect(cadastre).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(cadastre);
    expect(onToggleCadastre).toHaveBeenCalledOnce();

    rerender(
      <MapStatusBadges
        basemapHealth={{ mode: 'wms', status: 'ready', generation: 1, transitionReason: 'tile-loaded' }}
        basemapVisible={false}
        cadastreVisible
        coordinate={null}
        accuracy={null}
        onToggleBasemap={onToggleBasemap}
        onToggleCadastre={onToggleCadastre}
      />,
    );
    expect(getByRole('button', { name: i18n.t('basemapToggle') })).toHaveAttribute('aria-pressed', 'false');
    expect(getByRole('button', { name: i18n.t('basemapToggle') })).toHaveAttribute('title', i18n.t('showBasemap'));
    expect(getByText(i18n.t('basemapOff'))).toBeInTheDocument();
    expect(getByText(i18n.t('cadastreOn'))).toBeInTheDocument();
  });

  it('renders the fixed map-center crosshair as a non-interactive overlay', () => {
    const { container } = render(<MapCenterCrosshair />);
    const overlay = container.querySelector('.map-viewport-overlay');
    const crosshair = container.querySelector('.map-center-crosshair');
    expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(crosshair?.querySelector('svg')).toBeInTheDocument();
    expect(crosshair?.querySelector('circle')).not.toBeInTheDocument();
    expect(crosshair?.querySelectorAll('path')).toHaveLength(2);
  });

  it('offers preparation settings without rendering the removed appearance profile', () => {
    const onOpenPreparation = vi.fn();
    const { getByRole, queryByText } = render(
      <CadControlSheet
        open
        file={new File([new Uint8Array(12)], 'drawing.dwg')}
        entityCount={7}
        loading={false}
        loadingTitle=""
        progressLabel=""
        message={null}
        opacity={70}
        preparationAvailable
        cadTextVisible
        hiddenObjectCount={0}
        controlsDisabled={false}
        onClose={vi.fn()}
        onDismissMessage={vi.fn()}
        onChooseFile={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onOpacityChange={vi.fn()}
        onOpenPreparation={onOpenPreparation}
        onToggleTexts={vi.fn()}
        onRestoreHidden={vi.fn()}
      />,
    );
    fireEvent.click(getByRole('button', { name: i18n.t('openPreparation') }));
    expect(onOpenPreparation).toHaveBeenCalledOnce();
    expect(queryByText(i18n.t('appearance.title'))).not.toBeInTheDocument();
  });

  it('uses the fixed span spinner in the accessible CAD loading row', () => {
    const { container, getByRole } = render(
      <CadControlSheet
        open
        file={null}
        entityCount={0}
        loading
        loadingTitle="DWG wird verarbeitet"
        progressLabel="CAD wird aufgebaut · 42%"
        message={null}
        opacity={70}
        cadTextVisible
        hiddenObjectCount={0}
        controlsDisabled
        onClose={vi.fn()}
        onDismissMessage={vi.fn()}
        onChooseFile={vi.fn()}
        onRemoveFile={vi.fn()}
        onCancel={vi.fn()}
        onOpacityChange={vi.fn()}
        onToggleTexts={vi.fn()}
        onRestoreHidden={vi.fn()}
      />,
    );

    const status = getByRole('status');
    const spinner = status.querySelector('.loading-spinner') as HTMLElement;
    expect(spinner.tagName).toBe('SPAN');
    expect(spinner).toHaveClass('loading-spinner');
    expect(container.querySelector('.compact-sheet-header button')).not.toBeInTheDocument();
    expect(getByRole('dialog').querySelectorAll('.sheet-handle-button')).toHaveLength(1);
  });

  it('uses only the shared handle to close the layer drawer', () => {
    const { getByRole } = render(
      <LayerSheet
        open
        layers={[{ id: 'A', name: 'Layer A', visible: true, objectCount: 4, cost: 'low', requiresReload: false }]}
        labels={createLayerSheetLabels(i18n.t)}
        onClose={vi.fn()}
        onSetVisible={vi.fn()}
        onSetAllVisible={vi.fn()}
      />,
    );

    const dialog = getByRole('dialog', { name: i18n.t('layersTitle') });
    expect(within(dialog).getAllByRole('button', { name: i18n.t('close') })).toHaveLength(1);
    expect(dialog.querySelector('.sheet-header button')).not.toBeInTheDocument();
  });

  it('uses only the shared handle to close the object drawer', () => {
    const onClose = vi.fn();
    const onBringToFront = vi.fn();
    const onSendToBack = vi.fn();
    const { getByRole } = render(
      <BottomSheet open modal ariaLabel={i18n.t('objectDetails')} closeLabel={i18n.t('close')} onClose={onClose}>
        <SelectionPanel
          selection={{ featureId: '1', objectKey: '::1', drawOrderGroupKey: '::1', layerId: 'A', cadType: 'LINE', label: '', blockPath: [] }}
          layerName="Layer A"
          onHideObject={vi.fn()}
          onHideLayer={vi.fn()}
          onBringToFront={onBringToFront}
          onSendToBack={onSendToBack}
        />
      </BottomSheet>,
    );

    const dialog = getByRole('dialog', { name: i18n.t('objectDetails') });
    expect(within(dialog).getAllByRole('button', { name: i18n.t('close') })).toHaveLength(1);
    expect(dialog.querySelector('.selection-panel header button')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('bringToFront') }));
    fireEvent.click(within(dialog).getByRole('button', { name: i18n.t('sendToBack') }));
    expect(onBringToFront).toHaveBeenCalledOnce();
    expect(onSendToBack).toHaveBeenCalledOnce();
  });

  it('renders the reusable spinner as a non-announced span', () => {
    const { getByTestId } = render(<LoadingSpinner data-testid="loading-spinner" />);
    const spinner = getByTestId('loading-spinner');
    expect(spinner.tagName).toBe('SPAN');
    expect(spinner).toHaveAttribute('aria-hidden', 'true');
  });
});
