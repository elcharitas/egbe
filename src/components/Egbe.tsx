import { useEffect, useState } from 'react';
import {
  downloadRecovery,
  retryDeviceSave,
  useLearner,
} from '../client/learner-store';
import { Learning } from './Learning';
import { Resources } from './Resources';

type View = 'learning' | 'resources' | 'circle';
const views: { id: View; label: string; symbol: string }[] = [
  { id: 'learning', label: 'My learning', symbol: '◉' },
  { id: 'resources', label: 'Resources', symbol: '▤' },
  { id: 'circle', label: 'My circle', symbol: '◎' },
];

export function Egbe() {
  const [view, setView] = useState<View>('learning');
  const { learner, ready, status } = useLearner();
  useEffect(() => {
    function readView() {
      const hash = window.location.hash.slice(1);
      setView(views.find((item) => item.id === hash)?.id ?? 'learning');
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
          Light by design · no auto-downloads
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
          </div>
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
            <section className="card">
              <p className="eyebrow">LEARNING, TOGETHER</p>
              <h1>Your circle is coming next.</h1>
              <p>For now, keep a question in your practice notes.</p>
              <a href="#learning">Return to my learning →</a>
            </section>
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
