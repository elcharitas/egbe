import { useEffect, useRef, useState } from 'react';
import {
  chooseCircle,
  loadMaterial,
  removeAccountCopy,
  saveMaterialToAccount,
  type CircleState,
} from '../client/circle-store';
import { updateLearner } from '../client/learner-store';
import {
  emptyMaterialWork,
  studyStages,
  type Learner,
  type MaterialWork,
} from '../domain/learner';
import { WorkspaceNotice } from './WorkspaceNotice';
import { StudyAssistant } from './StudyAssistant';

const stageGuidance = {
  read: {
    title: 'Read for one useful idea',
    prompt:
      'Choose a paragraph, section, or diagram. What is the main idea? Note unfamiliar words or questions.',
  },
  explain: {
    title: 'Explain it in your own words',
    prompt:
      'Write a short explanation or try an example. Which part can you explain confidently, and which part is still unclear?',
  },
  discuss: {
    title: 'Bring a question back to the circle',
    prompt:
      'Share what you understood and one question. You can also respond to another learner in the discussion.',
  },
};

export function MaterialReader({
  accountId,
  learner,
  circle,
  online,
}: {
  accountId: string | null;
  learner: Learner;
  circle: CircleState;
  online: boolean;
}) {
  const id = learner.selectedMaterialId;
  const work = id
    ? (learner.materialWork[id] ?? emptyMaterialWork())
    : emptyMaterialWork();
  const material = circle.material?.id === id ? circle.material : null;
  const heading = useRef<HTMLHeadingElement>(null);
  const [feedback, setFeedback] = useState('');
  useEffect(() => {
    if (id) void loadMaterial(id);
  }, [id, online]);

  function changeWork(change: (current: MaterialWork) => MaterialWork) {
    if (!id) return false;
    return updateLearner((current) => ({
      ...current,
      materialWork: {
        ...current.materialWork,
        [id]: change(
          current.materialWork[id] ?? emptyMaterialWork(current.activeCircleId),
        ),
      },
    }));
  }

  function completeStage() {
    const completed = [...new Set([...work.completed, work.stage])];
    const next = studyStages.find((stage) => !completed.includes(stage));
    const saved = changeWork((current) => ({
      ...current,
      completed,
      stage: next ?? 'discuss',
    }));
    setFeedback(
      saved
        ? next
          ? 'Step explored. Check the account-save status above.'
          : 'You explored all three steps. Your notes are kept.'
        : 'Your work is in this page. Check the account-save notice.',
    );
    requestAnimationFrame(() => heading.current?.focus());
  }

  if (!id)
    return (
      <section className="card empty-shelf">
        <span className="shelf-symbol" aria-hidden="true">
          ◉
        </span>
        <h2>Choose something to study.</h2>
        <p className="muted">
          Open a circle material, then make one small step your own.
        </p>
        <a className="button" href="#materials">
          Browse materials →
        </a>
        {Object.entries(learner.materialWork).length > 0 && (
          <div className="private-work-list">
            <h3>Your private study work</h3>
            {Object.entries(learner.materialWork)
              .reverse()
              .map(([materialId, savedWork]) => (
                <button
                  key={materialId}
                  className="secondary"
                  disabled={circle.busy}
                  onClick={() => {
                    if (savedWork.circleId !== learner.activeCircleId)
                      chooseCircle(savedWork.circleId);
                    updateLearner((current) => ({
                      ...current,
                      selectedMaterialId: materialId,
                    }));
                  }}
                >
                  {learner.savedMaterials.find((item) => item.id === materialId)
                    ?.title ??
                    (savedWork.goal || 'Private notes for a material')}
                </button>
              ))}
          </div>
        )}
      </section>
    );

  const saved = learner.savedMaterials.some((item) => item.id === id);
  const waiting = learner.materialOutbox.some((item) => item.id === id);
  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR STUDY DESK</p>
          <h2>
            {material?.title ??
              (circle.reading ? 'Opening material…' : 'Your saved study work')}
          </h2>
          <p className="small muted">
            {material?.attribution ??
              'Your private goal and notes remain available below.'}
            {waiting && ' · Local material waiting to share'}
          </p>
        </div>
        <div className="actions">
          <a href="#materials">← Material shelf</a>
          <a href="#study-notes">Jump to my notes</a>
          <a href="#study-assistant">Ask the study assistant</a>
        </div>
      </div>
      <div className="study-layout">
        <article className="card reading-panel" aria-label="Material to read">
          <div className="reading-toolbar">
            <span className="tag">Student-provided · unverified</span>
            <div className="actions">
              {material && (
                <button
                  className="secondary"
                  disabled={!online || circle.busy}
                  onClick={() => {
                    void saveMaterialToAccount();
                  }}
                >
                  {saved
                    ? 'Update saved copy'
                    : material.text
                      ? 'Save text to my account'
                      : 'Save link details to my account'}
                </button>
              )}
              {saved && (
                <button
                  className="text-button"
                  disabled={!online || circle.busy}
                  onClick={() => {
                    void removeAccountCopy(id);
                  }}
                >
                  Remove account copy
                </button>
              )}
            </div>
          </div>
          {material?.sourceUrl && (
            <p className="small">
              <a href={material.sourceUrl} target="_blank" rel="noreferrer">
                Open original source ↗
                <span className="sr-only"> (new tab, needs internet)</span>
              </a>
              {' · '}The original is not downloaded by Egbe.
            </p>
          )}
          {material?.text ? (
            <div className="material-text">{material.text}</div>
          ) : (
            <div className="link-only-state">
              <h3>
                {circle.reading ? 'Loading the text…' : 'No text loaded here.'}
              </h3>
              <p className="muted">
                {material
                  ? 'This material is a source link. Open it online; saving its details does not download the article or PDF.'
                  : 'Reconnect to open this material or your saved account copy.'}
              </p>
            </div>
          )}
          <p className="small muted reading-limit">
            Saved copies belong to your account. Removing a circle material
            cannot recall copies already saved by other students.
          </p>
          <WorkspaceNotice circle={circle} online={online} />
        </article>
        <section
          className="card study-controls"
          aria-label="Private study work"
        >
          <p className="eyebrow">ONE SMALL STEP, AT YOUR PACE</p>
          <label htmlFor="study-goal">What do I want to understand?</label>
          <input
            id="study-goal"
            maxLength={120}
            value={work.goal}
            placeholder="e.g. Explain the main idea to a friend"
            onChange={(event) => {
              const goal = event.target.value;
              changeWork((current) => ({ ...current, goal }));
            }}
          />
          <label htmlFor="study-minutes">Time I can make today</label>
          <select
            id="study-minutes"
            value={work.minutes}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              changeWork((current) => ({ ...current, minutes }));
            }}
          >
            <option value={5}>About 5 minutes</option>
            <option value={10}>About 10 minutes</option>
            <option value={20}>About 20 minutes</option>
            <option value={30}>About 30 minutes</option>
          </select>
          <div className="study-stages" aria-label="Study steps">
            {studyStages.map((stage) => (
              <button
                key={stage}
                className={stage === work.stage ? 'active' : ''}
                aria-pressed={stage === work.stage}
                onClick={() => {
                  changeWork((current) => ({ ...current, stage }));
                  requestAnimationFrame(() => heading.current?.focus());
                }}
              >
                {work.completed.includes(stage) && (
                  <span aria-hidden="true">✓ </span>
                )}
                {stage === 'read'
                  ? 'Read'
                  : stage === 'explain'
                    ? 'Explain'
                    : 'Discuss'}
              </button>
            ))}
          </div>
          {feedback && (
            <p className="small" role="status">
              {feedback}
            </p>
          )}
          <h3 ref={heading} tabIndex={-1}>
            {stageGuidance[work.stage].title}
          </h3>
          <p className="small muted">{stageGuidance[work.stage].prompt}</p>
          <label htmlFor="study-notes">My private notes</label>
          <textarea
            id="study-notes"
            rows={4}
            maxLength={4000}
            value={work.notes}
            placeholder="What clicked? What do I want to ask?"
            onChange={(event) => {
              const notes = event.target.value;
              changeWork((current) => ({ ...current, notes }));
            }}
          />
          <p className="small muted">
            Private to your account, never posted automatically.
          </p>
          <p className="small muted">
            Your study question stays private. Preparing it for your circle
            opens an editable check-in, not a public post (up to 600
            characters).
          </p>
          <div className="actions">
            <button onClick={completeStage}>
              {work.completed.includes(work.stage)
                ? 'Keep exploring this step'
                : 'I explored this step'}
            </button>
            <button
              className="secondary"
              onClick={() => {
                if (learner.checkInDraft.trim()) {
                  window.location.hash = 'circle';
                  return;
                }
                const question = work.question.trim();
                if (question.length > 600) {
                  setFeedback('Shorten your question to 600 characters first.');
                  document.getElementById('study-question')?.focus();
                  return;
                }
                updateLearner((current) =>
                  current.checkInDraft.trim()
                    ? current
                    : {
                        ...current,
                        checkInDraft: question,
                        checkInMaterialId: id,
                        checkInCircleId: current.activeCircleId,
                      },
                );
                window.location.hash = 'circle';
              }}
            >
              {learner.checkInDraft.trim()
                ? 'Continue existing check-in'
                : 'Prepare check-in'}
            </button>
          </div>
          <a className="study-help-link" href="#circle">
            Open circle discussion →
          </a>
          <p className="small muted">
            Change your goal or revisit any step without losing notes.
          </p>
        </section>
        <StudyAssistant
          key={id}
          accountId={accountId}
          materialId={id}
          material={material}
          work={work}
          online={online}
          changeWork={changeWork}
        />
      </div>
    </>
  );
}
