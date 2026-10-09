import { useRef, useState } from 'react';
import { updateLearner } from '../client/learner-store';
import { directions, resources, type Direction } from '../domain/catalog';
import { parseGoal, type Learner } from '../domain/learner';
import { ResourceCard } from './ResourceCard';

export function Learning({ learner }: { learner: Learner }) {
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalError, setGoalError] = useState('');
  const [stepFeedback, setStepFeedback] = useState('');
  const goalInput = useRef<HTMLInputElement>(null);
  const practiceHeading = useRef<HTMLHeadingElement>(null);
  const direction = learner.direction;
  const path = directions[direction];
  const goal = learner.goals[direction];
  const done = path.steps.filter((step) => learner.tasks[step.id]?.completed);
  const nextStep = path.steps.find(
    (step) => !learner.tasks[step.id]?.completed,
  );
  const step =
    path.steps.find((step) => step.id === learner.activeSteps[direction]) ??
    nextStep;
  const draft = learner.goalDrafts[direction];
  const progress = step ? learner.tasks[step.id] : undefined;
  const resource = resources.find(
    (resource) => resource.id === step?.resourceId,
  );

  function chooseDirection(next: Direction) {
    updateLearner((state) => ({ ...state, direction: next }));
    setEditingGoal(false);
    setGoalError('');
  }

  function saveGoal(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = parseGoal(direction, learner);
    if (!result.success) {
      setGoalError('Give your goal a few words (up to 120 characters).');
      goalInput.current?.focus();
      return;
    }
    updateLearner((state) => ({
      ...state,
      goals: { ...state.goals, [direction]: result.data },
    }));
    setGoalError('');
    setEditingGoal(false);
    requestAnimationFrame(() => practiceHeading.current?.focus());
  }

  function markStep() {
    if (!step) return;
    const completing = !learner.tasks[step.id]?.completed;
    const saved = updateLearner((state) => ({
      ...state,
      tasks: {
        ...state.tasks,
        [step.id]: {
          notes: state.tasks[step.id]?.notes ?? '',
          completed: completing,
        },
      },
      activeSteps: {
        ...state.activeSteps,
        [direction]: completing ? null : step.id,
      },
    }));
    setStepFeedback(
      saved
        ? completing
          ? 'Step explored and saved. Continue when you are ready.'
          : 'Step reopened. Your notes are still here.'
        : 'Progress changed in this page. Check the device-save notice.',
    );
    requestAnimationFrame(() => practiceHeading.current?.focus());
  }

  return (
    <>
      <p className="eyebrow">SMALL STEPS, AT YOUR PACE</p>
      <h1>
        {goal
          ? 'Pick up where you left off.'
          : 'A little learning goes a long way.'}
      </h1>
      <p className="intro">
        {goal
          ? 'A break does not erase your progress. ' +
            'One useful step is enough today.'
          : 'Choose something that matters to you. No account needed to begin.'}
      </p>
      <fieldset className="direction-picker">
        <legend>What would you like to work on?</legend>
        {(Object.keys(directions) as Direction[]).map((key) => (
          <label key={key} className={key === direction ? 'chosen' : ''}>
            <input
              type="radio"
              name="direction"
              value={key}
              checked={key === direction}
              onChange={() => chooseDirection(key)}
            />
            <span>
              <strong>{directions[key].title}</strong>
              <span className="small">{directions[key].description}</span>
            </span>
          </label>
        ))}
      </fieldset>

      {!goal || editingGoal ? (
        <form className="card goal-form" onSubmit={saveGoal}>
          <h2>
            {goal
              ? 'Make your goal fit your life.'
              : 'What would progress look like?'}
          </h2>
          <label htmlFor="goal-title">My goal</label>
          <input
            id="goal-title"
            ref={goalInput}
            maxLength={120}
            value={draft.title}
            onChange={(event) => {
              const title = event.target.value;
              updateLearner((state) => ({
                ...state,
                goalDrafts: {
                  ...state.goalDrafts,
                  [direction]: { ...draft, title },
                },
              }));
            }}
            aria-describedby={goalError ? 'goal-error' : 'goal-help'}
            aria-invalid={Boolean(goalError)}
          />
          <p id="goal-help" className="small muted">
            Use your own words. This is a direction, not a deadline.
          </p>
          <label htmlFor="goal-minutes">Time I can make for a session</label>
          <select
            id="goal-minutes"
            value={draft.minutes}
            onChange={(event) => {
              const minutes = Number(event.target.value);
              updateLearner((state) => ({
                ...state,
                goalDrafts: {
                  ...state.goalDrafts,
                  [direction]: { ...draft, minutes },
                },
              }));
            }}
          >
            <option value={5}>About 5 minutes</option>
            <option value={10}>About 10 minutes</option>
            <option value={20}>About 20 minutes</option>
            <option value={30}>About 30 minutes</option>
          </select>
          <p className="small muted">
            Split any step across sessions. Adjusting your goal keeps your notes
            and completed steps.
          </p>
          {goalError && (
            <p id="goal-error" role="alert">
              {goalError}
            </p>
          )}
          <div className="actions">
            <button type="submit">
              {goal ? 'Keep this goal' : 'Start my small steps'}{' '}
              <span aria-hidden="true">→</span>
            </button>
            {goal && (
              <button
                type="button"
                className="secondary"
                onClick={() => setEditingGoal(false)}
              >
                Back to learning
              </button>
            )}
          </div>
        </form>
      ) : (
        <>
          <section className="goal-banner" aria-label="Your goal">
            <div>
              <p className="eyebrow">YOUR NORTH STAR</p>
              <h2>{goal.title}</h2>
              <p>
                {goal.minutes} minutes when it works for you · {done.length} of
                3 steps explored
              </p>
            </div>
            <button
              className="light-button"
              onClick={() => setEditingGoal(true)}
            >
              Adjust goal
            </button>
          </section>
          <div className="learning-grid">
            <section className="card roadmap" aria-label="Your roadmap">
              <p className="eyebrow">YOUR SMALL STEPS</p>
              <h2>A path, not a race.</h2>
              <ol>
                {path.steps.map((item, index) => (
                  <li key={item.id}>
                    <button
                      className={
                        step?.id === item.id
                          ? 'step-button active'
                          : 'step-button'
                      }
                      onClick={() =>
                        updateLearner((state) => ({
                          ...state,
                          activeSteps: {
                            ...state.activeSteps,
                            [direction]: item.id,
                          },
                        }))
                      }
                      aria-current={step?.id === item.id ? 'step' : undefined}
                    >
                      <span className="step-number" aria-hidden="true">
                        {learner.tasks[item.id]?.completed ? '✓' : index + 1}
                      </span>
                      <span>
                        <strong>{item.title}</strong>
                        <span className="small muted">
                          {learner.tasks[item.id]?.completed
                            ? 'Explored · revisit anytime'
                            : `About ${item.minutes} minutes`}
                        </span>
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <p className="small muted">
                Notes stay private on this device. You choose what to share.
              </p>
            </section>
            <section className="card practice" aria-label="Practice step">
              {stepFeedback && (
                <p className="small" role="status">
                  {stepFeedback}
                </p>
              )}
              {step ? (
                <>
                  <p className="eyebrow">
                    {progress?.completed
                      ? 'REVISIT A STEP'
                      : 'YOUR NEXT USEFUL ACTION'}
                  </p>
                  <h2 ref={practiceHeading} tabIndex={-1}>
                    {step.title}
                  </h2>
                  <p>{step.guidance}</p>
                  <div className="practice-prompt">
                    <strong>Try it in your own way</strong>
                    <p>{step.prompt}</p>
                  </div>
                  <details>
                    <summary>A little help, if you need it</summary>
                    <p>{step.hint}</p>
                  </details>
                  <label htmlFor="practice-notes">My practice notes</label>
                  <textarea
                    id="practice-notes"
                    rows={5}
                    maxLength={4000}
                    value={progress?.notes ?? ''}
                    placeholder={
                      'Type here, or practise on paper ' +
                      'and note what you tried.'
                    }
                    onChange={(event) => {
                      const notes = event.target.value;
                      updateLearner((state) => ({
                        ...state,
                        tasks: {
                          ...state.tasks,
                          [step.id]: {
                            notes,
                            completed: progress?.completed ?? false,
                          },
                        },
                      }));
                    }}
                  />
                  <p className="small muted">
                    No grades here. Take a break whenever you need one.
                  </p>
                  <div className="actions">
                    <button onClick={markStep}>
                      {progress?.completed
                        ? 'Mark as still exploring'
                        : 'I explored this step'}
                    </button>
                  </div>
                  {resource && (
                    <div className="step-resource">
                      <p className="small muted">
                        Go deeper when you have internet
                      </p>
                      <ResourceCard
                        resource={resource}
                        saved={learner.savedResources.includes(resource.id)}
                      />
                    </div>
                  )}
                </>
              ) : (
                <div className="completion">
                  <span className="completion-mark" aria-hidden="true">
                    ✓
                  </span>
                  <h2 ref={practiceHeading} tabIndex={-1}>
                    Look at what you’ve explored.
                  </h2>
                  <p>
                    You have worked through this path. Revisit any step, adjust
                    your goal, or bring a question to your circle.
                  </p>
                  <a className="button" href="#circle">
                    Check in with my circle →
                  </a>
                </div>
              )}
            </section>
          </div>
        </>
      )}
      <aside className="gentle-note">
        <span aria-hidden="true">✳</span>
        <p>
          <strong>Your pace belongs to you.</strong> A few minutes, a different
          goal, a fresh start — they all count as learning.
        </p>
      </aside>
    </>
  );
}
