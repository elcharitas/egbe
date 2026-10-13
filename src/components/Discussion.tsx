import {
  chooseCircle,
  deleteContribution,
  queueCheckIn,
  type CircleState,
} from '../client/circle-store';
import { updateLearner } from '../client/learner-store';
import type { Learner } from '../domain/learner';
import { WorkspaceNotice } from './WorkspaceNotice';
import { CustomSelect } from './CustomSelect';

export function Discussion({
  learner,
  circle,
  online,
}: {
  learner: Learner;
  circle: CircleState;
  online: boolean;
}) {
  const otherDraft =
    Boolean(learner.checkInDraft.trim()) &&
    learner.checkInCircleId !== learner.activeCircleId;
  const options = Array.from(
    new Map(
      [
        ...circle.materials,
        ...learner.materialOutbox.filter(
          (item) => item.circleId === learner.activeCircleId,
        ),
      ].map((material) => [material.id, material]),
    ).values(),
  );
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">STUDY IS A CONVERSATION</p>
          <h2>What are you making sense of?</h2>
          <p className="muted">
            Bring a question, share one useful idea, or support a peer.
          </p>
        </div>
        <span className="tag">Latest 50 check-ins · refresh to catch up</span>
      </div>
      <div className="discussion-layout">
        <section className="card compose-panel">
          <h3>Your check-in</h3>
          <p className="small muted">
            Circle name: {circle.alias ?? 'Join this circle to take part'}
          </p>
          {otherDraft && (
            <div className="notice">
              <p>
                This draft belongs to another circle. It has not been moved or
                erased.
              </p>
              <button
                className="secondary"
                disabled={circle.busy}
                onClick={() => chooseCircle(learner.checkInCircleId)}
              >
                Return to the draft’s circle
              </button>
            </div>
          )}
          <form
            onSubmit={async (event) => {
              event.preventDefault();
              await queueCheckIn();
            }}
          >
            <label htmlFor="check-in-topic">About</label>
            <CustomSelect
              id="check-in-topic"
              value={learner.checkInMaterialId ?? 'general'}
              disabled={otherDraft}
              onValueChange={(value) => {
                const materialId = value === 'general' ? null : value;
                updateLearner((current) => ({
                  ...current,
                  checkInMaterialId: materialId,
                  checkInCircleId: current.activeCircleId,
                }));
              }}
              options={[
                { value: 'general', label: 'General circle check-in' },
                ...options.map((material) => ({
                  value: material.id,
                  label: material.title,
                })),
                ...(learner.checkInMaterialId &&
                !options.some((item) => item.id === learner.checkInMaterialId)
                  ? [
                      {
                        value: learner.checkInMaterialId,
                        label: 'Material no longer available',
                      },
                    ]
                  : []),
              ]}
            />
            <label htmlFor="check-in-message">
              What did you learn, or where are you stuck?
            </label>
            <textarea
              id="check-in-message"
              rows={5}
              maxLength={600}
              value={learner.checkInDraft}
              readOnly={otherDraft}
              placeholder="I understood… I’m wondering… A small next step is…"
              onChange={(event) => {
                const checkInDraft = event.target.value;
                updateLearner((current) => ({
                  ...current,
                  checkInDraft,
                  checkInCircleId: current.activeCircleId,
                }));
              }}
            />
            <p className="small muted">
              {learner.checkInDraft.length}/600 · Draft stays here until you
              share. Account saving needs a connection.
            </p>
            <p className="small muted">
              Shared check-ins are visible to{' '}
              {circle.circle?.visibility === 'private'
                ? 'circle members'
                : 'signed-in readers'}{' '}
              until removed. Your private study notes are not included.
            </p>
            <button
              disabled={
                !online || circle.busy || !circle.circle?.joined || otherDraft
              }
            >
              Share check-in
            </button>
          </form>
          <WorkspaceNotice circle={circle} online={online} />
        </section>
        <section
          className="card discussion-feed"
          aria-label="Circle discussion"
        >
          <div className="feed-heading">
            <h3>From your circle</h3>
            <span className="small muted">
              {online ? 'No automatic polling' : 'Offline · loaded posts only'}
            </span>
          </div>
          {!circle.posts.length && (
            <div className="empty-discussion">
              <span className="shelf-symbol" aria-hidden="true">
                ◎
              </span>
              <h3>
                {online
                  ? 'Make room for the first question.'
                  : 'No discussion loaded for this visit.'}
              </h3>
              <p className="muted">
                {online
                  ? 'There is no sample peer activity. A real check-in starts the conversation.'
                  : 'Reconnect and refresh for circle posts. Keep unsaved work in this page.'}
              </p>
            </div>
          )}
          {circle.posts.map((post) => (
            <article className="shared-post" key={post.id}>
              <div className="post-byline">
                <span className="avatar" aria-hidden="true">
                  {post.alias.slice(-2).toUpperCase()}
                </span>
                <div>
                  <strong>
                    {post.alias}
                    {post.mine && ' (you)'}
                  </strong>
                  <p className="small muted">
                    <time dateTime={new Date(post.createdAt).toISOString()}>
                      {new Date(post.createdAt).toLocaleDateString('en', {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </time>
                    {' · '}
                    {post.materialId &&
                    circle.materials.some(
                      (material) => material.id === post.materialId,
                    ) ? (
                      <a
                        href="#study"
                        onClick={() => {
                          updateLearner((current) => ({
                            ...current,
                            selectedMaterialId: post.materialId,
                          }));
                        }}
                      >
                        {
                          circle.materials.find(
                            (material) => material.id === post.materialId,
                          )?.title
                        }
                      </a>
                    ) : post.materialId ? (
                      'Material removed or unavailable'
                    ) : (
                      'Circle check-in'
                    )}
                  </p>
                </div>
              </div>
              <p className="post-text">{post.message}</p>
              {post.mine && (
                <button
                  className="text-button"
                  disabled={!online || circle.busy}
                  onClick={() => {
                    if (window.confirm('Remove this circle check-in?'))
                      void deleteContribution(post.id, 'check-in');
                  }}
                >
                  Remove my check-in
                </button>
              )}
            </article>
          ))}
        </section>
      </div>
    </>
  );
}
