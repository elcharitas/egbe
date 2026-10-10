import { cancelContribution, type CircleState } from '../client/circle-store';
import type { Learner } from '../domain/learner';

export function WorkspaceNotice({
  circle,
  online,
}: {
  circle: CircleState;
  online: boolean;
}) {
  return (
    <div className="workspace-notice">
      {circle.feedback && (
        <p className="feedback" role="status">
          {circle.feedback}
        </p>
      )}
      {circle.error && (
        <div className="notice error" role="alert">
          <p>{circle.error}</p>
          <p className="small">
            Account-confirmed work is kept in D1. Unsaved edits remain only in
            this page; keep it open and{' '}
            {online ? 'retry' : 'reconnect and retry'} before reloading.
          </p>
        </div>
      )}
    </div>
  );
}

export function ContributionQueue({
  learner,
  busy,
}: {
  learner: Learner;
  busy: boolean;
}) {
  const count = learner.outbox.length + learner.materialOutbox.length;
  if (!count) return null;
  return (
    <section
      className="pending-contributions"
      aria-label="Waiting contributions"
    >
      <h3>Waiting for confirmation ({count})</h3>
      <p className="small muted">
        A lost reply can mean the circle already has it. Cancelling stops
        account retries; remove any confirmed contribution after reconnecting.
      </p>
      {learner.materialOutbox.map((material) => (
        <article className="pending-item" key={material.id}>
          <div>
            <strong>{material.title}</strong>
            <p className="small muted">
              Material · saved here, not marked shared yet
            </p>
          </div>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => cancelContribution(material.id, 'material')}
          >
            Cancel waiting material
          </button>
        </article>
      ))}
      {learner.outbox.map((post) => (
        <article className="pending-item" key={post.id}>
          <p className="post-text">{post.message}</p>
          <button
            className="secondary"
            disabled={busy}
            onClick={() => cancelContribution(post.id, 'check-in')}
          >
            Cancel waiting check-in
          </button>
        </article>
      ))}
    </section>
  );
}
