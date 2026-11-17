export function withDeadline<T>(
  task: Promise<T>,
  milliseconds: number,
  signal?: AbortSignal,
  message = "The operation timed out."
): Promise<T> {
  return new Promise((resolve, reject) => {
    const finish = (action: () => void) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      action();
    };
    const abort = () =>
      finish(() =>
        reject(signal?.reason ?? new DOMException("Cancelled", "AbortError"))
      );
    const timer = setTimeout(
      () => finish(() => reject(new DOMException(message, "TimeoutError"))),
      milliseconds
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    task.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error))
    );
  });
}

export function abortableDelay(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const abort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, milliseconds);
    signal.addEventListener("abort", abort, { once: true });
    if (signal.aborted) abort();
  });
}
