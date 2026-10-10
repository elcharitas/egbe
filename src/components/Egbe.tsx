import { useEffect, useState } from 'react';
import { chooseCircle, syncCircle, useCircle } from '../client/circle-store';
import { useConnectivity } from '../client/use-connectivity';
import {
  downloadRecovery,
  retryDeviceSave,
  useLearner,
} from '../client/learner-store';
import { Learning } from './Learning';
import { Resources } from './Resources';
import { AIHelp } from './AIHelp';
import { CircleDirectory } from './CircleDirectory';
import { Discussion } from './Discussion';
import { MaterialReader } from './MaterialReader';
import { MaterialShelf } from './MaterialShelf';
import { ContributionQueue } from './WorkspaceNotice';

type View =
  | 'materials'
  | 'study'
  | 'discussion'
  | 'circles'
  | 'account'
  | 'learning'
  | 'resources';
const primaryViews: { id: View; label: string; symbol: string }[] = [
  { id: 'materials', label: 'Materials', symbol: '▤' },
  { id: 'study', label: 'My study', symbol: '◉' },
  { id: 'discussion', label: 'Discussion', symbol: '◎' },
];
const otherViews: { id: View; label: string; symbol: string }[] = [
  { id: 'circles', label: 'Study circles', symbol: '◌' },
  { id: 'account', label: 'Help & account', symbol: '✳' },
  { id: 'learning', label: 'Earlier practice', symbol: '↶' },
  { id: 'resources', label: 'Starter links', symbol: '↗' },
];
const deviceSaveMessages = {
  damaged:
    'Egbe could not read your stored data. It has not been overwritten. ' +
    'Download it for recovery; clear Egbe site data only to start fresh.',
  unreadable:
    'Egbe cannot access your saved progress yet. Nothing was overwritten. ' +
    'Allow site storage, then retry opening it.',
  conflict:
    'Saved progress changed in another tab. It has not been overwritten. ' +
    'Download your in-page work before reloading the saved version.',
  unsaved:
    'Device storage is unavailable or full. Your latest work is only here. ' +
    'Free space or allow site storage, then retry.',
};

export function Egbe() {
  const [view, setView] = useState<View>('materials');
  const { learner, ready, status } = useLearner();
  const { online, offlineReady, offlineError } = useConnectivity();
  const circle = useCircle(ready, online, learner.activeCircleId);
  const waiting = learner.outbox.length + learner.materialOutbox.length;
  const currentCircle =
    circle.circle ??
    learner.circles.find((item) => item.id === learner.activeCircleId);
  const inCircle = ['materials', 'study', 'discussion'].includes(view);

  useEffect(() => {
    function readView(event?: HashChangeEvent) {
      const hash = new URL(event?.newURL ?? window.location.href).hash.slice(1);
      const destination = [...primaryViews, ...otherViews].find(
        (item) => item.id === (hash === 'circle' ? 'discussion' : hash),
      );
      if (destination) {
        setView(destination.id);
        if (event) {
          requestAnimationFrame(() => document.getElementById('main')?.focus());
        }
      }
    }
    readView();
    window.addEventListener('hashchange', readView);
    return () => window.removeEventListener('hashchange', readView);
  }, []);

  return (
    <div className="app-shell student-workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="wordmark" href="#materials" aria-label="Egbe home">
          egbe<span aria-hidden="true">●</span>
        </a>
        <span className="brand-caption">Your materials. Your circle.</span>
        <span className="connection-pill">
          {online ? 'Connection available' : 'Offline'}
          {' · '}
          {offlineReady ? 'Ready offline' : 'Offline access not ready'}
        </span>
      </header>
      <div className="shell-body">
        <aside className="sidebar">
          <div className="circle-picker">
            <label htmlFor="active-circle">Current circle</label>
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
          <nav aria-label="Study workspace">
            {primaryViews.map((item) => (
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
          <p className="nav-caption">MORE FROM EGBE</p>
          <nav className="secondary-navigation" aria-label="More options">
            {otherViews.map((item) => (
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
            <strong>Bring something. Leave with a next step.</strong>
            <p className="small">Read a little, explain an idea, ask a peer.</p>
          </div>
          <p className="small muted">
            Public demo · English only
            <br />
            Low-data study spaces
          </p>
        </aside>
        <main id="main" tabIndex={-1}>
          <div className="workspace-status">
            <div className="save-status" role="status">
              {!ready && status === 'saved'
                ? 'Opening your saved workspace…'
                : status === 'saved'
                  ? '✓ Private work saved on this device'
                  : 'Your work is not safely saved'}
              {waiting > 0 && <span> · {waiting} contributions waiting</span>}
            </div>
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
          {inCircle && (
            <div className="workspace-heading">
              <div>
                <p className="eyebrow">PUBLIC STUDY CIRCLE</p>
                <h1>
                  {currentCircle?.title ??
                    'Study together, from your own materials.'}
                </h1>
                <p className="muted">
                  {currentCircle?.description ??
                    'Students bring the material. The circle brings the support.'}
                </p>
                {currentCircle && (
                  <p className="small muted">
                    {currentCircle.memberCount} joined ·{' '}
                    {circle.materials.length} materials loaded
                    {!online && ' · Saved view, may be out of date'}
                    {circle.alias && ` · Your demo name: ${circle.alias}`}
                  </p>
                )}
              </div>
              {!currentCircle?.joined && (
                <button
                  disabled={!online || circle.busy || !ready}
                  onClick={() => {
                    void syncCircle(true);
                  }}
                >
                  Join this circle
                </button>
              )}
              {currentCircle?.joined && (
                <span className="tag member-tag">You joined</span>
              )}
            </div>
          )}
          {view === 'circles' && <h1>Study circles</h1>}
          {view === 'account' && <h1>Help & account</h1>}
          <details className="workspace-disclosure">
            <summary>Public demo & offline details</summary>
            <p className="small">
              Anyone can read or join these circles. Share only public links or
              text you have permission to share, never personal information.
              Shared contributions persist until removed. Removal scrubs text
              but keeps a minimal retry record; there is no moderation or
              automatic expiry.
            </p>
            <p className="small">
              Circle ownership uses a browser cookie. Losing it loses the
              ability to remove earlier contributions. ChatGPT sign-in does not
              recover that ownership or sync private work.
            </p>
            <p className="small">
              {offlineReady
                ? 'The app shell is ready for offline reloads.'
                : 'Load online and wait for “Ready offline”.'}{' '}
              Explicitly save a material to read its text offline. A saved link
              does not download its source. Private notes and waiting
              contributions survive reloads. The discussion feed is only kept in
              memory for this visit. Clearing site data or browser eviction
              removes local work and offline copies. Use one learning tab at a
              time.
            </p>
            {offlineError && <p className="small error">{offlineError}</p>}
          </details>
          {ready && view === 'materials' && (
            <MaterialShelf learner={learner} circle={circle} online={online} />
          )}
          {ready && view === 'study' && (
            <MaterialReader learner={learner} circle={circle} online={online} />
          )}
          {ready && view === 'discussion' && (
            <Discussion learner={learner} circle={circle} online={online} />
          )}
          {ready && view === 'circles' && (
            <CircleDirectory
              learner={learner}
              circle={circle}
              online={online}
            />
          )}
          {ready && view === 'account' && (
            <AIHelp learner={learner} circle={circle} online={online} />
          )}
          {ready && view === 'learning' && <Learning learner={learner} />}
          {ready && view === 'resources' && <Resources learner={learner} />}
          {ready && <ContributionQueue learner={learner} busy={circle.busy} />}
          <footer>
            Your goal and notes stay in this browser. Students choose the
            material; sources and AI answers are not independently verified.
          </footer>
        </main>
      </div>
    </div>
  );
}
