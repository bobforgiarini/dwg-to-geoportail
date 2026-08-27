import { describe, expect, it } from 'vitest';
import {
  cadObjectDrawOrderZIndex,
  createCadDrawOrderGroupKey,
  moveCadObjectDrawOrder,
} from './drawOrder';

describe('CAD object draw order', () => {
  it('moves the latest object to the outermost front or back tier', () => {
    let order = { front: [] as string[], back: [] as string[] };
    order = moveCadObjectDrawOrder(order, '::A', 'front');
    order = moveCadObjectDrawOrder(order, '::B', 'front');
    order = moveCadObjectDrawOrder(order, '::C', 'back');
    order = moveCadObjectDrawOrder(order, '::D', 'back');

    expect(cadObjectDrawOrderZIndex(order, '::B')).toBeGreaterThan(cadObjectDrawOrderZIndex(order, '::A'));
    expect(cadObjectDrawOrderZIndex(order, '::D')).toBeLessThan(cadObjectDrawOrderZIndex(order, '::C'));

    order = moveCadObjectDrawOrder(order, '::A', 'back');
    expect(order.front).toEqual(['::B']);
    expect(order.back).toEqual(['::C', '::D', '::A']);
  });

  it('shares a block-definition child across outer INSERT paths', () => {
    expect(createCadDrawOrderGroupKey('42', ['SITE-A', 'SYMBOL']))
      .toBe(createCadDrawOrderGroupKey('42', ['SITE-B', 'SYMBOL']));
    expect(createCadDrawOrderGroupKey('42', [])).toBe('::42');
  });
});
