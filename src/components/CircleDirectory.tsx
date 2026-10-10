import {
  chooseCircle,
  createStudyCircle,
  syncCircle,
  type CircleState,
} from '../client/circle-store';
import { updateLearner } from '../client/learner-store';
import type { Learner } from '../domain/learner';
import { WorkspaceNotice } from './WorkspaceNotice';

export function CircleDirectory({
  learner,
  circle,
  online,
}: {
  learner: Learner;
  circle: CircleState;
  online: boolean;
}) {
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">SHARED SPACES, STUDENT-LED</p>
          <h2>Find your study circle</h2>
          <p className="muted">
            A circle starts with a subject and something to study together.
          </p>
        </div>
      </div>
      <div className="circle-directory">
        {learner.circles.map((item) => (
          <article className="card circle-directory-card" key={item.id}>
            <span className="tag">Public demo circle</span>
            <h3>{item.title}</h3>
            <p>{item.description || 'Bring a material and a question.'}</p>
            <p className="small muted">
              {item.memberCount} joined · {item.materialCount} shared materials
              {item.joined && ' · You joined'}
            </p>
            <button
              className="secondary"
              disabled={circle.busy}
              onClick={() => {
                chooseCircle(item.id);
                window.location.hash = 'materials';
              }}
            >
              Open circle <span aria-hidden="true">→</span>
            </button>
          </article>
        ))}
      </div>
      {!learner.circles.length && !circle.busy && (
        <p className="card muted">
          {online
            ? 'Refresh to load the public circles.'
            : 'No circle directory saved yet. Reconnect to browse.'}
        </p>
      )}
      <form
        className="card create-circle-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!learner.participant && !(await syncCircle(true))) return;
          if (await createStudyCircle()) window.location.hash = 'materials';
        }}
      >
        <p className="eyebrow">MAKE ROOM FOR YOUR SUBJECT</p>
        <h3>Start a study circle</h3>
        <div className="goal-fields">
          <div>
            <label htmlFor="circle-title">Circle name</label>
            <input
              id="circle-title"
              maxLength={80}
              disabled={circle.busy}
              placeholder="e.g. Biology revision or Saturday book circle"
              value={learner.circleDraft.title}
              onChange={(event) => {
                const title = event.target.value;
                updateLearner((current) => ({
                  ...current,
                  circleDraft: { ...current.circleDraft, title, id: null },
                }));
              }}
            />
          </div>
          <div>
            <label htmlFor="circle-description">What will you study?</label>
            <input
              id="circle-description"
              maxLength={300}
              disabled={circle.busy}
              placeholder="A short invitation for other learners"
              value={learner.circleDraft.description}
              onChange={(event) => {
                const description = event.target.value;
                updateLearner((current) => ({
                  ...current,
                  circleDraft: {
                    ...current.circleDraft,
                    description,
                    id: null,
                  },
                }));
              }}
            />
          </div>
        </div>
        <p className="small muted">
          All demo circles are public. Join a circle first to get a generated
          demo name; no real name or ChatGPT account is required.
        </p>
        <button disabled={!online || circle.busy}>
          {circle.busy
            ? 'Connecting…'
            : learner.participant
              ? 'Create circle'
              : 'Join demo & create circle'}
        </button>
        <WorkspaceNotice circle={circle} online={online} />
      </form>
    </>
  );
}
