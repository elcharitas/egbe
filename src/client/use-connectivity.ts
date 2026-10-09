import { useEffect, useState } from 'react';

export function useConnectivity() {
  const [online, setOnline] = useState(true);
  const [offlineReady, setOfflineReady] = useState(false);
  const [offlineError, setOfflineError] = useState('');
  useEffect(() => {
    const updateConnection = () => setOnline(navigator.onLine);
    updateConnection();
    window.addEventListener('online', updateConnection);
    window.addEventListener('offline', updateConnection);

    let disposed = false;
    async function prepareOffline() {
      if (!import.meta.env.PROD) {
        setOfflineError(
          'Use the production preview to prepare offline access.',
        );
        return;
      }
      if (!('serviceWorker' in navigator)) {
        setOfflineError('This browser cannot prepare offline reloads.');
        return;
      }
      try {
        const registration = await navigator.serviceWorker.register('/sw.js');
        const ready = await Promise.race([
          navigator.serviceWorker.ready,
          new Promise<never>((_, reject) => {
            setTimeout(
              () => reject(new Error('Offline setup timed out.')),
              15000,
            );
          }),
        ]);
        const worker = ready.active ?? registration.active;
        if (!worker) throw new Error('Offline worker is not ready.');
        const channel = new MessageChannel();
        const timeout = setTimeout(() => {
          channel.port1.close();
          if (!disposed) {
            setOfflineError(
              'Offline readiness could not be checked. Reload online to retry.',
            );
          }
        }, 5000);
        channel.port1.onmessage = (event: MessageEvent<{ ready: boolean }>) => {
          clearTimeout(timeout);
          if (!disposed) setOfflineReady(event.data.ready);
          channel.port1.close();
        };
        worker.postMessage('offline-status', [channel.port2]);
      } catch {
        if (!disposed) {
          setOfflineError(
            'Offline setup did not finish. Reload when online to retry.',
          );
        }
      }
    }
    void prepareOffline();
    return () => {
      disposed = true;
      window.removeEventListener('online', updateConnection);
      window.removeEventListener('offline', updateConnection);
    };
  }, []);
  return { online, offlineReady, offlineError };
}
