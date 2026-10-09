export type ListenerErrorHandler = (error: unknown) => void;

/** The default for a listener that throws: the error surfaces as an unhandled rejection, and delivery continues. */
export const reportListenerError: ListenerErrorHandler = (error) => {
  void Promise.reject(error);
};

/** Calls every listener; one that throws is reported and does not stop the rest. */
export function callEach<Args extends unknown[]>(
  listeners: Iterable<(...args: Args) => void>,
  args: Args,
  onError: ListenerErrorHandler,
): void {
  for (const listener of [...listeners]) {
    try {
      listener(...args);
    } catch (error) {
      onError(error);
    }
  }
}
