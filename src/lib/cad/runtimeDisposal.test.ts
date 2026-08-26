import { describe, expect, it } from 'vitest';
import { awaitCadRuntimeDisposal, registerCadRuntimeDisposal } from './runtimeDisposal';

describe('CAD runtime disposal barrier', () => {
  it('waits for registered teardown and continues after a failed cleanup', async () => {
    let release: (() => void) | undefined;
    const pending = new Promise<void>((resolve) => { release = resolve; });
    registerCadRuntimeDisposal(pending);
    let finished = false;
    const waiting = awaitCadRuntimeDisposal().then(() => { finished = true; });
    await Promise.resolve();
    expect(finished).toBe(false);
    release?.();
    await waiting;
    expect(finished).toBe(true);

    registerCadRuntimeDisposal(Promise.reject(new Error('cleanup failed')));
    await expect(awaitCadRuntimeDisposal()).resolves.toBeUndefined();
  });
});
