import { useState } from 'react';
import { directions, resources } from '../domain/catalog';
import type { Learner } from '../domain/learner';
import { ResourceCard } from './ResourceCard';

export function Resources({ learner }: { learner: Learner }) {
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const matching = resources.filter(
    (resource) =>
      (!savedOnly || learner.savedResources.includes(resource.id)) &&
      `${resource.title} ${resource.summary} ${resource.publisher}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );

  return (
    <>
      <p className="eyebrow">A SMALL, THOUGHTFUL LIBRARY</p>
      <h1>Find a useful starting point.</h1>
      <p className="intro">
        A few clear explanations, not another endless list to get through.
      </p>
      <div className="card resource-filters">
        <label htmlFor="resource-search">Find a resource</label>
        <input
          id="resource-search"
          type="search"
          placeholder="Try HTML, percentages, or Mozilla"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={savedOnly}
            onChange={(event) => setSavedOnly(event.target.checked)}
          />
          Show my saved links
        </label>
      </div>
      <p className="small muted">
        Source pages checked during this sprint on 9 October 2026; access can
        change. No live verification. External sites may load images or adverts.
        Saving a link does not download its lesson.
      </p>
      {matching.length === 0 && (
        <div className="card">
          <h2>No matching links yet.</h2>
          <p>Try a shorter search, or turn off “Show my saved links”.</p>
          <button
            className="secondary"
            onClick={() => {
              setQuery('');
              setSavedOnly(false);
            }}
          >
            Show all resources
          </button>
        </div>
      )}
      <div className="resource-grid">
        {matching.map((resource) => (
          <div key={resource.id}>
            <p className="small muted">
              {directions[resource.direction].title}
            </p>
            <ResourceCard
              resource={resource}
              saved={learner.savedResources.includes(resource.id)}
            />
          </div>
        ))}
      </div>
    </>
  );
}
