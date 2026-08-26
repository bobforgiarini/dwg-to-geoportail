let disposalBarrier: Promise<void> = Promise.resolve();

/**
 * Serializes teardown across both CAD engines. A viewer switch may mount the
 * next route before an asynchronous WebGL/document destroy has completed.
 */
export function registerCadRuntimeDisposal(task: Promise<unknown>): void {
  const previous = disposalBarrier;
  disposalBarrier = Promise.allSettled([previous, task]).then(() => undefined);
}

export function awaitCadRuntimeDisposal(): Promise<void> {
  return disposalBarrier;
}
