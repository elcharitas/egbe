import { useEffect, useState } from 'react';
import { chooseCircle, syncCircle, useCircle } from '../client/circle-store';
import { useConnectivity } from '../client/use-connectivity';
import {
  downloadRecovery,
  retryDeviceSave,
  useLearner,
} from '../client/learner-store';
import { CircleDirectory } from './CircleDirectory';
import { Discussion } from './Discussion';
import { Learning } from './Learning';
import { MaterialReader } from './MaterialReader';
import { MaterialShelf } from './MaterialShelf';
import { Resources } from './Resources';
import { ContributionQueue } from './WorkspaceNotice';

type View =
  'circle' | 'materials' | 'study' | 'circles' | 'learning' | 'resources';
const tabs: { id: View; label: string }[] = [
  { id: 'circle', label: 'Circle' },
  { id: 'materials', label: 'Materials' },
  { id: 'study', label: 'Study' },
];
const deviceSaveMessages = {
  damaged:
    'Stored data could not be read and has not been overwritten. ' +
    'Download it for recovery before clearing any site data.',
  unreadable:
    'Your saved progress cannot be opened yet. Nothing was overwritten. ' +
    'Allow site storage, then retry.',
  conflict:
    'Saved progress changed in another tab. Nothing was overwritten. ' +
    'Download your in-page work before reloading.',
  unsaved:
    'Device storage is unavailable or full. Your latest work is only here. ' +
    'Free space or allow site storage, then retry.',
};

function viewFromHash(hash: string): View | undefined {
  if (hash === 'discussion') return 'circle';
  if (hash === 'account') return 'study';
  if (
    [
      'circle',
      'materials',
      'study',
      'circles',
      'learning',
      'resources',
    ].includes(hash)
  ) {
    return hash as View;
  }
}

export function Egbe() {
  const [view, setView] = useState<View>('materials');
  const { learner, ready, status } = useLearner();
  const { online, offlineReady, offlineError } = useConnectivity();
  const circle = useCircle(ready, online, learner.activeCircleId);
  const waiting = learner.outbox.length + learner.materialOutbox.length;
  const currentCircle =
    circle.circle ??
    learner.circles.find((item) => item.id === learner.activeCircleId);
  const inCircle = tabs.some((tab) => tab.id === view);

  useEffect(() => {
    function readView(event?: HashChangeEvent) {
      const hash = new URL(event?.newURL ?? window.location.href).hash.slice(1);
      const destination = viewFromHash(hash);
      if (!destination) return;
      setView(destination);
      if (event) {
        requestAnimationFrame(() => document.getElementById('main')?.focus());
      }
    }
    readView();
    window.addEventListener('hashchange', readView);
    return () => window.removeEventListener('hashchange', readView);
  }, []);

  return (
    <div className="app-shell circle-workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="wordmark" href="#materials" aria-label="Egbe home">
          egbe<span aria-hidden="true">●</span>
        </a>
        <div className="circle-picker">
          <label className="sr-only" htmlFor="active-circle">
            Current circle
          </label>
          <select
            id="active-circle"
            value={learner.activeCircleId}
            disabled={!ready || circle.busy}
            onChange={(event) => chooseCircle(event.target.value)}
          >
            {!learner.circles.some(
              (item) => item.id === learner.activeCircleId,
            ) && (
              <option value={learner.activeCircleId}>
                {currentCircle?.title ?? 'Study circle'}
              </option>
            )}
            {learner.circles.map((item) => (
              <option key={item.id} value={item.id}>
                {item.title}
              </option>
            ))}
          </select>
        </div>
        <a className="browse-circles" href="#circles">
          Browse circles
        </a>
        <span className="connection-pill">
          {online ? 'Online' : 'Offline'} ·{' '}
          {offlineReady ? 'Ready offline' : 'Offline access not ready'}
        </span>
      </header>
      <main id="main" tabIndex={-1}>
        {status !== 'saved' && (
          <div className="notice error" role="alert">
            <strong>Keep this page open.</strong>
            <p>{deviceSaveMessages[status]}</p>
            <div className="actions">
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
          </div>
        )}
        <div className="workspace-heading">
          <div>
            <p className="eyebrow">
              {inCircle ? 'YOUR STUDY CIRCLE' : 'YOUR LEARNING SPACE'}
            </p>
            <h1>
              {inCircle
                ? (currentCircle?.title ?? 'Bring a material. Learn together.')
                : view === 'circles'
                  ? 'Find your circle.'
                  : view === 'learning'
                    ? 'Your earlier practice'
                    : 'Starter resources'}
            </h1>
            {inCircle && (
              <p className="muted">
                {currentCircle?.description ??
                  'Read a little, explain an idea, ask a peer.'}
              </p>
            )}
          </div>
          {inCircle && (
            <div className="circle-membership">
              {currentCircle && (
                <span className="small muted">
                  {currentCircle.memberCount} joined ·{' '}
                  {currentCircle.materialCount} materials
                  {!online && ' · Saved view'}
                </span>
              )}
              {currentCircle?.joined ? (
                <span className="tag">
                  You joined{circle.alias && ` · ${circle.alias}`}
                </span>
              ) : (
                <button
                  disabled={!online || circle.busy || !ready}
                  onClick={() => {
                    void syncCircle(true);
                  }}
                >
                  Join this circle
                </button>
              )}
            </div>
          )}
        </div>
        <div className="workspace-bar">
          <nav className="circle-tabs" aria-label="Study workspace">
            {tabs.map((tab) => (
              <a
                key={tab.id}
                href={`#${tab.id}`}
                className={view === tab.id ? 'active' : ''}
                aria-current={view === tab.id ? 'page' : undefined}
              >
                {tab.label}
              </a>
            ))}
          </nav>
          <div className="workspace-status">
            <span className="save-status" role="status">
              {!ready && status === 'saved'
                ? 'Opening saved work…'
                : status === 'saved'
                  ? 'Private work saved on this device'
                  : 'Device save needs attention'}
              {waiting > 0 && ` · ${waiting} waiting to share`}
            </span>
            <button
              className="secondary"
              disabled={!online || circle.busy || !ready}
              onClick={() => {
                void syncCircle();
              }}
            >
              {circle.busy ? 'Connecting…' : 'Refresh & sync'}
            </button>
          </div>
        </div>
        {ready && view === 'materials' && (
          <MaterialShelf learner={learner} circle={circle} online={online} />
        )}
        {ready && view === 'study' && (
          <MaterialReader learner={learner} circle={circle} online={online} />
        )}
        {ready && view === 'circle' && (
          <Discussion learner={learner} circle={circle} online={online} />
        )}
        {ready && view === 'circles' && (
          <CircleDirectory learner={learner} circle={circle} online={online} />
        )}
        {ready && view === 'learning' && <Learning learner={learner} />}
        {ready && view === 'resources' && <Resources learner={learner} />}
        {ready && <ContributionQueue learner={learner} busy={circle.busy} />}
        <footer className="workspace-footer">
          <details className="workspace-disclosure">
            <summary>Privacy & offline use</summary>
            <p className="small">
              Circles are public and unmoderated. Share only links or text you
              have permission to share, never personal information. Shared
              contributions remain public until removed. Removal scrubs text but
              retains a minimal retry record; there is no automatic expiry.
              Losing your browser cookie loses the ability to remove earlier
              contributions. Private goals and notes stay on this device.
            </p>
            <p className="small">
              {offlineReady
                ? 'The app is ready for offline reloads.'
                : 'Load online and wait for “Ready offline”.'}{' '}
              Save text explicitly to read it offline. Saving a link does not
              download its source. Notes and waiting contributions survive
              reloads; the on-device discussion view does not. Clearing site
              data or browser eviction removes local work. Use one learning tab
              at a time.
            </p>
            {offlineError && <p className="small error">{offlineError}</p>}
          </details>
          <details className="earlier-tools">
            <summary>Previous work & starter links</summary>
            <a href="#learning">Earlier practice</a>
            <a href="#resources">Starter links</a>
          </details>
          <span className="small muted">Public demo · English only</span>
        </footer>
      </main>
    </div>
  );
}
