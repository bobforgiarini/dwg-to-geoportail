import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { VirtualizedList } from './VirtualizedList';

describe('VirtualizedList', () => {
  afterEach(cleanup);

  it('keeps a bounded React tree and reveals rows while scrolling', () => {
    const items = Array.from({ length: 200 }, (_, index) => ({ id: `${index}`, label: `Effect ${index}` }));
    render(
      <VirtualizedList
        items={items}
        itemKey={(item) => item.id}
        renderItem={(item) => item.label}
        ariaLabel="Effects"
        rowHeight={50}
        viewportHeight={200}
        virtualizeAbove={10}
      />,
    );

    const list = screen.getByRole('list', { name: 'Effects' });
    expect(list.querySelectorAll('[role="listitem"]').length).toBeLessThan(20);
    expect(screen.getByText('Effect 0')).toBeInTheDocument();
    expect(screen.queryByText('Effect 150')).not.toBeInTheDocument();

    Object.defineProperty(list, 'scrollTop', { configurable: true, value: 7_500 });
    fireEvent.scroll(list);
    expect(screen.getByText('Effect 150')).toBeInTheDocument();
    expect(list.querySelectorAll('[role="listitem"]').length).toBeLessThan(20);
  });
});
