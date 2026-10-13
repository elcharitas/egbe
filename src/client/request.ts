export async function requestFromWorker<Result>(
  request: (signal: AbortSignal) => Promise<Result>,
  timeoutMs = 15000,
) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  const timeout = setTimeout(interrupt, timeoutMs);
  window.addEventListener('offline', interrupt, { once: true });
  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'The connection was interrupted or took too long. ' +
          'Unsaved work remains only in this page. Keep it open and retry when connected.',
      );
    }
    if (error instanceof TypeError) {
      throw new Error(
        'The connection failed. Unsaved work remains only in this page. ' +
          'Keep it open and retry when connected.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    window.removeEventListener('offline', interrupt);
  }
}
