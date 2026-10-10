export async function requestFromWorker<Result>(
  request: (signal: AbortSignal) => Promise<Result>,
) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  const timeout = setTimeout(interrupt, 15000);
  window.addEventListener('offline', interrupt, { once: true });
  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'The connection was interrupted or took too long. ' +
          'Your private work and waiting contributions are kept. Try again when connected.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    window.removeEventListener('offline', interrupt);
  }
}
