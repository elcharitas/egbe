import { useEffect, useState } from 'react';
import {
  BookIcon,
  CommentDiscussionIcon,
  FileDirectoryIcon,
  LockIcon,
  PeopleIcon,
} from '@primer/octicons-react';
import {
  acceptCircleInvitation,
  chooseCircle,
  makeCircleInvitation,
  syncCircle,
  useCircle,
} from '../client/circle-store';
import {
  downloadRecovery,
  retryAccountSave,
  useLearner,
} from '../client/learner-store';
import { useAccount } from '../client/use-account';
import { useConnectivity } from '../client/use-connectivity';
import { CircleDirectory } from './CircleDirectory';
import { Discussion } from './Discussion';
import { Learning } from './Learning';
import { MaterialReader } from './MaterialReader';
import { MaterialShelf } from './MaterialShelf';
import { Resources } from './Resources';
import { ContributionQueue, WorkspaceNotice } from './WorkspaceNotice';

type View =
  'circle' | 'materials' | 'study' | 'circles' | 'learning' | 'resources';
const tabs = [
  { id: 'circle', label: 'Circle', icon: CommentDiscussionIcon },
  { id: 'materials', label: 'Materials', icon: FileDirectoryIcon },
  { id: 'study', label: 'Study', icon: BookIcon },
] as const;

export function Egbe() {
  const [view, setView] = useState<View>('materials');
  const [invite, setInvite] = useState<string | null>(null);
  const [invitationLink, setInvitationLink] = useState('');
  const auth = useAccount();
  const { learner, ready, status, error, committing } = useLearner(
    auth.account?.accountId ?? null,
  );
  const { online } = useConnectivity();
  const circle = useCircle(ready, online, learner.activeCircleId);
  const currentCircle =
    circle.circle ??
    learner.circles.find((item) => item.id === learner.activeCircleId);
  const inCircle = tabs.some((tab) => tab.id === view);
  const waiting = learner.outbox.length + learner.materialOutbox.length;

  useEffect(() => {
    function readView(event?: HashChangeEvent) {
      const hash = new URL(event?.newURL ?? location.href).hash.slice(1);
      setInvite(/^invite=[0-9a-f]{64}$/.test(hash) ? hash.slice(7) : null);
      const destination =
        hash === 'discussion' ? 'circle' : hash === 'account' ? 'study' : hash;
      if (
        [
          'circle',
          'materials',
          'study',
          'circles',
          'learning',
          'resources',
        ].includes(destination)
      ) {
        setView(destination as View);
      }
      if (
        event &&
        destination !== 'main' &&
        !destination.startsWith('study-')
      ) {
        requestAnimationFrame(() => document.getElementById('main')?.focus());
      }
    }
    readView();
    window.addEventListener('hashchange', readView);
    return () => window.removeEventListener('hashchange', readView);
  }, []);
  useEffect(() => {
    setInvitationLink('');
  }, [learner.activeCircleId]);

  return (
    <div className="app-shell circle-workspace">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <a className="wordmark" href="#materials" aria-label="Egbe home">
          egbe
        </a>
        {auth.account?.signedIn && (
          <>
            <div className="circle-picker">
              <label className="sr-only" htmlFor="active-circle">
                Current circle
              </label>
              <select
                id="active-circle"
                value={learner.activeCircleId}
                disabled={!ready || circle.busy || committing}
                onChange={(event) => chooseCircle(event.target.value)}
              >
                {!learner.circles.some(
                  (item) => item.id === learner.activeCircleId,
                ) && (
                  <option value={learner.activeCircleId}>Study circle</option>
                )}
                {learner.circles.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.title}
                    {item.visibility === 'private' ? ' · Private' : ''}
                  </option>
                ))}
              </select>
            </div>
            <a className="browse-circles" href="#circles">
              <PeopleIcon /> Browse circles
            </a>
            <div className="account-actions">
              <span className="small">
                {auth.account.displayName ?? 'Your account'}
              </span>
              <button
                className="secondary"
                disabled={!online || auth.busy || circle.busy || committing}
                onClick={() => {
                  void auth.logout();
                }}
              >
                Sign out
              </button>
            </div>
          </>
        )}
      </header>
      <main id="main" tabIndex={-1}>
        {!auth.account?.signedIn ? (
          <section className="card account-gate">
            <h1>Your materials. Your study circle.</h1>
            <p>
              Sign in to keep your goals, notes, and drafts in your account.
              Start a private circle with classmates, or join a public one.
            </p>
            {invite && (
              <p>
                You have an invitation to a private circle. Sign in first, then
                choose whether to join.
              </p>
            )}
            <button
              disabled={!online || auth.busy || !auth.account?.configured}
              onClick={() => {
                void auth.login(invite);
              }}
            >
              {auth.busy ? 'Checking account…' : 'Continue with Google'}
            </button>
            {!auth.busy && !auth.account?.configured && (
              <p className="notice">
                Google sign-in needs to be connected by the site owner before
                this instance can accept accounts.
              </p>
            )}
            <button
              className="text-button"
              disabled={!online || auth.busy}
              onClick={() => {
                void auth.refresh();
              }}
            >
              Retry account check
            </button>
            <p className="small muted">
              No localStorage or device-saved study copies. An HttpOnly cookie
              keeps you signed in; Google tokens are not stored.
            </p>
          </section>
        ) : (
          <>
            <div className="workspace-status">
              <span className="save-status" role="status">
                {status === 'saved'
                  ? 'Saved to your account'
                  : status === 'saving'
                    ? 'Saving to your account…'
                    : status === 'loading'
                      ? 'Opening account work…'
                      : error
                        ? 'Account save needs attention'
                        : 'Unsaved changes'}
                {waiting > 0 && ` · ${waiting} waiting to share`}
              </span>
              <button
                className="secondary"
                disabled={!ready || !online || circle.busy || committing}
                onClick={() => {
                  void syncCircle();
                }}
              >
                {circle.busy ? 'Connecting…' : 'Refresh & sync'}
              </button>
            </div>
            {(!online ||
              Boolean(error) ||
              status === 'conflict' ||
              status === 'error') && (
              <div className="notice" role="alert">
                <strong>Keep this page open until saving is confirmed.</strong>
                <p>
                  {error ||
                    'Unsaved edits remain only in this page. Reloading or signing out can lose them.'}
                </p>
                <div className="actions">
                  {ready && (
                    <button className="secondary" onClick={downloadRecovery}>
                      Export in-page work
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={!online || status === 'conflict'}
                    onClick={async () => {
                      if (await retryAccountSave()) void syncCircle();
                    }}
                  >
                    Retry account save
                  </button>
                  {status === 'conflict' && (
                    <span className="small">
                      Export this page, then reload to open the newer account
                      version.
                    </span>
                  )}
                </div>
              </div>
            )}
            {invite && (
              <section className="card invite-panel">
                <h2>
                  <LockIcon /> Private circle invitation
                </h2>
                <p>
                  Joining makes this circle’s materials and discussion available
                  to your account. The invitation does not publish your private
                  notes.
                </p>
                <button
                  disabled={!ready || !online || circle.busy || committing}
                  onClick={async () => {
                    if (await acceptCircleInvitation(invite))
                      location.hash = 'materials';
                  }}
                >
                  Join invited circle
                </button>
                <WorkspaceNotice circle={circle} online={online} />
              </section>
            )}
            <div className="workspace-heading">
              <div>
                <h1>
                  {inCircle
                    ? (currentCircle?.title ?? 'Study circle')
                    : view === 'circles'
                      ? 'Study circles'
                      : view === 'learning'
                        ? 'Earlier practice'
                        : 'Starter resources'}
                </h1>
                {inCircle && (
                  <p className="muted">
                    {currentCircle?.description ??
                      'Bring a material, explore an idea, ask a peer.'}
                  </p>
                )}
              </div>
              {inCircle && currentCircle && (
                <div className="circle-membership">
                  <span className="tag">
                    {currentCircle.visibility === 'private' ? (
                      <LockIcon />
                    ) : (
                      <PeopleIcon />
                    )}
                    {currentCircle.visibility === 'private'
                      ? 'Private · members only'
                      : 'Public · signed-in readers'}
                  </span>
                  <span className="small muted">
                    {currentCircle.memberCount} joined ·{' '}
                    {currentCircle.materialCount} materials
                  </span>
                  {currentCircle.joined ? (
                    <span className="small">{circle.alias} · You joined</span>
                  ) : (
                    <button
                      disabled={!online || circle.busy || committing}
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
            <nav className="circle-tabs" aria-label="Study workspace">
              {tabs.map(({ id, label, icon: Icon }) => (
                <a
                  key={id}
                  href={`#${id}`}
                  className={view === id ? 'active' : ''}
                  aria-current={view === id ? 'page' : undefined}
                >
                  <Icon /> {label}
                </a>
              ))}
            </nav>
            {currentCircle?.visibility === 'private' && currentCircle.mine && (
              <details className="invite-panel">
                <summary>Invite classmates</summary>
                <p className="small">
                  Anyone with this link and a Google account can join. Replacing
                  it stops new joins with the old link; it does not remove
                  existing members.
                </p>
                <button
                  className="secondary"
                  disabled={!online || circle.busy || committing}
                  onClick={async () => {
                    const link = await makeCircleInvitation(currentCircle.id);
                    if (link) setInvitationLink(link);
                  }}
                >
                  Create / replace invitation
                </button>
                {invitationLink && (
                  <>
                    <label htmlFor="invitation-link">
                      Invitation link — share only with classmates
                    </label>
                    <input
                      id="invitation-link"
                      readOnly
                      value={invitationLink}
                      onFocus={(event) => event.target.select()}
                    />
                  </>
                )}
                <WorkspaceNotice circle={circle} online={online} />
              </details>
            )}
            <fieldset className="workspace-content" disabled={committing}>
              <legend className="sr-only">Learning workspace</legend>
              {ready && view === 'materials' && (
                <MaterialShelf
                  learner={learner}
                  circle={circle}
                  online={online}
                />
              )}
              {ready && view === 'study' && (
                <MaterialReader
                  accountId={auth.account.accountId}
                  learner={learner}
                  circle={circle}
                  online={online}
                />
              )}
              {ready && view === 'circle' && (
                <Discussion learner={learner} circle={circle} online={online} />
              )}
              {ready && view === 'circles' && (
                <CircleDirectory
                  learner={learner}
                  circle={circle}
                  online={online}
                />
              )}
              {ready && view === 'learning' && <Learning learner={learner} />}
              {ready && view === 'resources' && <Resources learner={learner} />}
              {ready && (
                <ContributionQueue learner={learner} busy={circle.busy} />
              )}
            </fieldset>
            <footer className="workspace-footer">
              <details className="workspace-disclosure">
                <summary>Privacy & connection limits</summary>
                <p className="small">
                  Your goals, notes, drafts, and saved copies live in D1 under
                  your account. They are not included in check-ins unless you
                  explicitly prepare and share text. Private circles are visible
                  only to members; public circles are visible to any signed-in
                  learner. Circles are unmoderated. Removing a contribution
                  scrubs its text but retains a retry marker.
                </p>
                <p className="small">
                  No study work is persisted in this browser. Keep the page open
                  during a failed save. Unsaved edits do not survive a reload.
                  External lesson links are never downloaded by Egbe.
                </p>
              </details>
              <details className="earlier-tools">
                <summary>Earlier practice & starter links</summary>
                <a href="#learning">Earlier practice</a>
                <a href="#resources">Starter links</a>
                {auth.account.hasEarlierCircleSession && (
                  <div>
                    <p className="small">
                      Connect earlier circle contributions using this browser’s
                      old demo cookie. This does not read or upload old local
                      study data.
                    </p>
                    <button
                      className="secondary"
                      disabled={
                        !online || auth.busy || circle.busy || committing
                      }
                      onClick={() => {
                        if (
                          window.confirm(
                            'Connect this browser’s earlier circle ownership to the signed-in account?',
                          )
                        ) {
                          void auth.connectEarlierOwnership();
                        }
                      }}
                    >
                      Connect earlier circle ownership
                    </button>
                  </div>
                )}
              </details>
              <span className="small muted">
                Proof of concept · English only
              </span>
            </footer>
          </>
        )}
        {auth.error && (
          <p className="notice error" role="alert">
            {auth.error}
          </p>
        )}
        {auth.feedback && (
          <p className="feedback" role="status">
            {auth.feedback}
          </p>
        )}
      </main>
    </div>
  );
}
