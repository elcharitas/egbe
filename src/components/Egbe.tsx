import { useEffect, useState } from 'react';
import { useCircle } from '../client/circle-store';
import { useConnectivity } from '../client/use-connectivity';
import {
  downloadRecovery,
  retryDeviceSave,
  useLearner,
} from '../client/learner-store';
import { Learning } from './Learning';
import { Resources } from './Resources';
import { Circle } from './Circle';

type View = 'learning' | 'resources' | 'circle';
const views: { id: View; label: string; symbol: string }[] = [
  { id: 'learning', label: 'My learning', symbol: '◉' },
  { id: 'resources', label: 'Resources', symbol: '▤' },
  { id: 'circle', label: 'My circle', symbol: '◎' },
];

export function Egbe() {
  const [view, setView] = useState<View>('learning');
  const { learner, ready, status } = useLearner();
  const { online, offlineReady, offlineError } = useConnectivity();
  const circle = useCircle(
    ready && (view === 'circle' || learner.outbox.length > 0),
    online,
    learner.participant,
  );
  useEffect(() => {
    function readView() {
      const hash = window.location.hash.slice(1);
      const destination = views.find((item) => item.id === hash);
      if (destination) setView(destination.id);
    }
    readView();
    window.addEventListener('hashchange', readView);
    return () => window.removeEventListener('hashchange', readView);
  }, []);

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="wordmark" href="#learning" aria-label="Egbe home">
          egbe<span aria-hidden="true">●</span>
        </a>
        <span className="brand-caption">Learn a little. Go together.</span>
        <span className="connection-pill">
          {online ? 'Connection available' : 'Offline'}
          {' · '}
          {offlineReady ? 'Ready offline' : 'Offline access not ready'}
        </span>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          <p className="eyebrow">YOUR LEARNING SPACE</p>
          <nav aria-label="Main navigation">
            {views.map((item) => (
              <a
                key={item.id}
                href={`#${item.id}`}
                aria-current={view === item.id ? 'page' : undefined}
                className={view === item.id ? 'active' : ''}
              >
                <span aria-hidden="true">{item.symbol}</span>
                {item.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-note">
            <span className="circle-art" aria-hidden="true">
              ◎
            </span>
            <strong>You don’t have to learn alone.</strong>
            <p className="small">
              A small step is easier with a circle behind you.
            </p>
          </div>
          <p className="small muted">
            Egbe · Study Circle
            <br />
            Invention sprint preview
          </p>
        </aside>
        <main id="main" tabIndex={-1}>
          <div className="save-status" role="status">
            {!ready && status === 'saved'
              ? 'Opening your learning space…'
              : status === 'saved'
                ? '✓ Learning changes saved on this device'
                : 'Your changes are not safely saved'}
            {learner.outbox.length > 0 && (
              <span>
                {' '}
                · {learner.outbox.length} check-in(s) waiting for confirmation
              </span>
            )}
          </div>
          <details className="offline-details">
            <summary>What can I do offline?</summary>
            <p className="small">
              {offlineReady
                ? 'This learning space is ready for offline reloads.'
                : 'First load this app online and wait for “Ready offline”.'}{' '}
              Then keep notes, change your goal, explore the guidance, and save
              links without internet. After joining online, check-ins can wait
              here and sync when you return or reconnect.
            </p>
            <p className="small">
              External lessons still need internet and are never downloaded
              automatically. Only your on-device view of the circle feed is
              temporary. Shared posts stay on the server until you remove them.
              Browser eviction or clearing site data removes offline access and
              local progress. Use one learning tab at a time.
            </p>
            {offlineError && <p className="small error">{offlineError}</p>}
          </details>
          {status !== 'saved' && (
            <div className="notice error" role="alert">
              <strong>Keep this page open.</strong>
              <p>
                {status === 'damaged'
                  ? 'Egbe could not read your stored data. It has not been overwritten. Download it for recovery; clear Egbe site data only if you want to start fresh.'
                  : status === 'unreadable'
                    ? 'Egbe cannot access your saved progress yet. Nothing has been overwritten. Allow site storage, then retry opening it.'
                    : status === 'conflict'
                      ? 'Saved progress changed in another tab. It has not been overwritten. Download your in-page work before reloading to open the saved version.'
                      : 'Device storage is unavailable or full. Your latest work is only in this page. Free space or allow site storage, then retry.'}
              </p>
              <button className="secondary" onClick={downloadRecovery}>
                Download recovery data
              </button>
              {(status === 'unsaved' || status === 'unreadable') && (
                <button className="secondary" onClick={retryDeviceSave}>
                  {status === 'unreadable'
                    ? 'Retry opening saved progress'
                    : 'Retry device save'}
                </button>
              )}
            </div>
          )}
          {ready && view === 'learning' && <Learning learner={learner} />}
          {ready && view === 'resources' && <Resources learner={learner} />}
          {ready && view === 'circle' && (
            <Circle learner={learner} online={online} circle={circle} />
          )}
          <footer>
            Private learning stays in this browser, not in an account. Clearing
            site data removes it. English-only preview.
          </footer>
        </main>
      </div>
    </div>
  );
}
