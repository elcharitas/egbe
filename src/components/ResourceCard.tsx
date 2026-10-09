import type { LearningResource } from '../domain/catalog';
import { updateLearner } from '../client/learner-store';

export function ResourceCard({
  resource,
  saved,
}: {
  resource: LearningResource;
  saved: boolean;
}) {
  function toggleSaved() {
    updateLearner((learner) => ({
      ...learner,
      savedResources: saved
        ? learner.savedResources.filter((id) => id !== resource.id)
        : [...new Set([...learner.savedResources, resource.id])],
    }));
  }

  return (
    <article className="resource-card">
      <p className="eyebrow">ARTICLE · ENGLISH</p>
      <h3>{resource.title}</h3>
      <p>{resource.summary}</p>
      <p className="resource-source">{resource.publisher}</p>
      <p className="small muted">{resource.access}</p>
      <div className="actions">
        <a href={resource.url} target="_blank" rel="noreferrer">
          Read at source <span aria-hidden="true">↗</span>
          <span className="sr-only"> (new tab, needs internet)</span>
        </a>
        <button
          className="secondary"
          onClick={toggleSaved}
          aria-pressed={saved}
          aria-label={`${saved ? 'Unsave' : 'Save'} ${resource.title}`}
        >
          {saved ? '✓ Saved link' : '+ Save link'}
        </button>
      </div>
    </article>
  );
}
