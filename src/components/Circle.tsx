import {
  cancelWaitingCheckIn,
  deleteSharedCheckIn,
  queueCheckIn,
  reopenCircleSession,
  syncCircle,
  type CircleState,
} from '../client/circle-store';
import { updateLearner } from '../client/learner-store';
import { directions } from '../domain/catalog';
import type { Learner } from '../domain/learner';

interface CircleProps {
  learner: Learner;
  online: boolean;
  circle: CircleState;
}

export function Circle({ learner, online, circle }: CircleProps) {
  return (
    <>
      <p className="eyebrow">SMALL STEPS ARE BETTER TOGETHER</p>
      <h1>A circle to come back to.</h1>
      <p className="intro">
        Share something you tried, ask for help, or encourage another learner.
        Nobody needs a perfect update.
      </p>
      <div className="notice">
        <strong>Public demo circle · not a private group</strong>
        <p className="small">
          Real check-ins are visible to anyone joining this demonstration. Use
          no personal or sensitive information. There is no moderation or
          private messaging. A browser cookie owns your posts; losing it means
          losing the ability to remove them. Shared posts remain on the server
          until removed. Goals and notes are never shared.
        </p>
        <details>
          <summary>What happens when I remove a post?</summary>
          <p className="small">
            Its text is scrubbed and it leaves the feed. A minimal record of its
            ID, owner, topic, and time remains to prevent old retries from
            recreating it. This demo has no automatic data expiry.
          </p>
        </details>
      </div>
      {!learner.participant ? (
        <section className="card">
          <h2>Come as you are. No profile needed.</h2>
          <p>
            Join with a generated demo name, not your real name. You can keep
            learning privately without joining.
          </p>
          <button
            disabled={!online || circle.busy}
            onClick={() => void syncCircle(true)}
          >
            {circle.busy ? 'Opening circle…' : 'Join the demo circle'}
          </button>
          {!online && (
            <p className="small">You need internet for your first join.</p>
          )}
          <CircleNotice circle={circle} online={online} />
        </section>
      ) : (
        <div className="circle-grid">
          <section className="card">
            <p className="eyebrow">YOUR CHECK-IN</p>
            <h2>A little progress, a little support.</h2>
            <p className="small muted">
              Demo identity:{' '}
              {circle.alias ?? `Learner ${learner.participant.slice(0, 6)}`}
              {' · '}
              {directions[learner.direction].title}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                queueCheckIn();
              }}
            >
              <label htmlFor="check-in-message">
                What did you try? What’s next, or where are you stuck?
              </label>
              <textarea
                id="check-in-message"
                maxLength={600}
                rows={5}
                value={learner.checkInDraft}
                aria-describedby="check-in-help"
                onChange={(event) => {
                  const checkInDraft = event.target.value;
                  updateLearner((current) => ({ ...current, checkInDraft }));
                }}
                placeholder="I tried… Next I’ll… I could use help with…"
              />
              <p id="check-in-help" className="small muted">
                {learner.checkInDraft.length}/600
                {' · Draft stays on this device. '}
                Offline check-ins wait here until you reconnect.
              </p>
              <button type="submit">
                {online ? 'Share my check-in' : 'Save check-in to share later'}
              </button>
            </form>
            <CircleNotice circle={circle} online={online} />
            {learner.outbox.length > 0 && (
              <div className="waiting-list">
                <h3>Waiting for confirmation ({learner.outbox.length})</h3>
                <p className="small muted">
                  Not yet marked shared on this device. If a reply was lost, the
                  server may already have it. Cancelling stops local retries;
                  remove any confirmed post after reconnecting.
                </p>
                {learner.outbox.map((entry) => (
                  <article key={entry.id} className="waiting-post">
                    <p className="post-text">{entry.message}</p>
                    <button
                      className="secondary"
                      disabled={circle.busy}
                      onClick={() => cancelWaitingCheckIn(entry.id)}
                    >
                      Cancel waiting check-in
                    </button>
                  </article>
                ))}
              </div>
            )}
          </section>
          <section className="card circle-feed" aria-label="Circle check-ins">
            <div className="feed-heading">
              <div>
                <p className="eyebrow">FROM YOUR CIRCLE</p>
                <h2>How we’re getting on</h2>
              </div>
              <button
                className="secondary"
                disabled={!online || circle.busy}
                onClick={() => void syncCircle()}
              >
                {circle.busy ? 'Connecting…' : 'Refresh & sync'}
              </button>
            </div>
            <p className="small muted">
              Latest 50 check-ins. Refresh when you want to catch up; no
              polling.
              {!online && ' Offline: showing only posts loaded in this visit.'}
            </p>
            {!circle.loaded && <p>Connect and refresh to see the circle.</p>}
            {circle.loaded && circle.posts.length === 0 && (
              <div className="empty-circle">
                <span className="circle-art" aria-hidden="true">
                  ◎
                </span>
                <h3>A quiet circle, ready for a first step.</h3>
                <p>
                  Be the first to share what you tried. These are real posts,
                  not sample activity.
                </p>
              </div>
            )}
            {circle.posts.map((post) => (
              <article key={post.id} className="shared-post">
                <div className="post-byline">
                  <span className="avatar" aria-hidden="true">
                    {post.alias.slice(-2).toUpperCase()}
                  </span>
                  <div>
                    <strong>
                      {post.alias}
                      {post.mine ? ' (you)' : ''}
                    </strong>
                    <p className="small muted">
                      {directions[post.direction].title}
                      {' · '}
                      <time dateTime={new Date(post.createdAt).toISOString()}>
                        {new Date(post.createdAt).toLocaleDateString('en', {
                          month: 'short',
                          day: 'numeric',
                        })}
                      </time>
                    </p>
                  </div>
                </div>
                <p className="post-text">{post.message}</p>
                {post.mine && (
                  <button
                    className="secondary"
                    disabled={!online || circle.busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove your check-in from this public circle?',
                        )
                      ) {
                        void deleteSharedCheckIn(post.id);
                      }
                    }}
                  >
                    Remove my check-in
                  </button>
                )}
              </article>
            ))}
          </section>
        </div>
      )}
    </>
  );
}

function CircleNotice({
  circle,
  online,
}: Pick<CircleProps, 'circle' | 'online'>) {
  return (
    <div className="circle-notice">
      {circle.feedback && (
        <p className="notice" role="status">
          {circle.feedback}
        </p>
      )}
      {circle.error && (
        <div className="notice error" role="alert">
          <p>{circle.error}</p>
          <p className="small">
            Your draft and unconfirmed check-ins stay on this device.
          </p>
          <details>
            <summary>Lost your circle session?</summary>
            <p className="small">
              Copy and cancel waiting check-ins before reopening a changed
              session. Your private learning is not affected.
            </p>
            <button
              className="secondary"
              disabled={!online || circle.busy}
              onClick={reopenCircleSession}
            >
              Reopen circle session
            </button>
          </details>
        </div>
      )}
    </div>
  );
}
