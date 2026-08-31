import { act, renderHook } from '@testing-library/react';
import type { PropsWithChildren } from 'react';
import { describe, expect, it } from 'vitest';
import { CadSessionProvider, useCadSession } from './CadSessionContext';

function Wrapper({ children }: PropsWithChildren) {
  return <CadSessionProvider>{children}</CadSessionProvider>;
}

describe('CadSession visibility restoration', () => {
  it('restores objects, layers and blocks independently', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });

    act(() => {
      result.current.setLoadProfile({
        mode: 'filtered',
        hiddenLayerIds: ['ROAD'],
        hiddenBlockNames: ['TREE'],
        hiddenEntityCategories: ['image'],
      });
      result.current.setObjectHidden('object-42', true);
    });

    act(() => result.current.restoreHiddenLayers());
    expect(result.current.loadProfile).toEqual({
      mode: 'filtered',
      hiddenLayerIds: [],
      hiddenBlockNames: ['TREE'],
      hiddenEntityCategories: ['image'],
    });
    expect(result.current.hiddenObjectIds).toEqual(['object-42']);

    act(() => result.current.restoreHiddenBlocks());
    expect(result.current.loadProfile).toEqual({
      mode: 'filtered',
      hiddenLayerIds: [],
      hiddenBlockNames: [],
      hiddenEntityCategories: ['image'],
    });
    expect(result.current.hiddenObjectIds).toEqual(['object-42']);

    act(() => result.current.restoreHiddenObjects());
    expect(result.current.hiddenObjectIds).toEqual([]);
    expect(result.current.loadProfile.hiddenEntityCategories).toEqual(['image']);
  });

  it('returns the profile to full only when no other exclusions remain', () => {
    const { result } = renderHook(() => useCadSession(), { wrapper: Wrapper });

    act(() => result.current.setLayerProfileVisible('ROAD', false));
    expect(result.current.loadProfile.mode).toBe('filtered');
    act(() => result.current.restoreHiddenLayers());
    expect(result.current.loadProfile).toEqual({
      mode: 'full',
      hiddenLayerIds: [],
      hiddenBlockNames: [],
      hiddenEntityCategories: [],
    });

    act(() => result.current.setBlockProfileVisible('TREE', false));
    expect(result.current.loadProfile.mode).toBe('filtered');
    act(() => result.current.restoreHiddenBlocks());
    expect(result.current.loadProfile.mode).toBe('full');
  });
});
