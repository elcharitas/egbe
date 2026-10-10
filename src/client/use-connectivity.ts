import { useEffect, useState } from 'react';

export function useConnectivity() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    // Retire Egbe's earlier offline shell, without touching stored learner
    // data. This version never stores account work in browser persistence.
    async function retireOfflineShell() {
      if ('serviceWorker' in navigator) {
        for (const registration of await navigator.serviceWorker.getRegistrations()) {
          const script = registration.active?.scriptURL;
          if (script === new URL('/sw.js', location.origin).href) {
            await registration.unregister();
          }
        }
      }
      if ('caches' in window) {
        for (const name of await caches.keys()) {
          if (name.startsWith('egbe-shell-')) await caches.delete(name);
        }
      }
    }
    void retireOfflineShell().catch(() => {
      // Account responses are no-store and are never handled by the old shell.
    });
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return { online };
}
