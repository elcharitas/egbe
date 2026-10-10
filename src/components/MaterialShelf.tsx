import { useRef, useState } from 'react';
import {
  chooseCircle,
  deleteContribution,
  queueMaterial,
  type CircleState,
} from '../client/circle-store';
import { updateLearner } from '../client/learner-store';
import type { Learner } from '../domain/learner';
import type { MaterialSummary } from '../domain/study-circle';
import { WorkspaceNotice } from './WorkspaceNotice';

export function MaterialShelf({
  learner,
  circle,
  online,
}: {
  learner: Learner;
  circle: CircleState;
  online: boolean;
}) {
  const [bringing, setBringing] = useState(false);
  const [query, setQuery] = useState('');
  const [savedOnly, setSavedOnly] = useState(false);
  const [fileError, setFileError] = useState('');
  const shelfHeading = useRef<HTMLHeadingElement>(null);
  const pending: MaterialSummary[] = learner.materialOutbox
    .filter((item) => item.circleId === learner.activeCircleId)
    .map((item) => ({
      ...item,
      textLength: item.text.length,
      mine: true,
      alias: 'Your local draft',
      createdAt: 0,
    }));
  const materials = [...pending, ...circle.materials].filter(
    (material) =>
      (!savedOnly ||
        learner.savedMaterials.some((item) => item.id === material.id)) &&
      `${material.title} ${material.attribution}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const draft = learner.materialDraft;
  const otherDraft = learner.materialDraftCircleId !== learner.activeCircleId;

  async function importText(file: File | undefined) {
    if (!file) return;
    setFileError('');
    try {
      if (file.size > 32768)
        throw new Error('Use a UTF-8 text file under 32 KB.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      if (text.length > 12000)
        throw new Error('Keep the excerpt to 12,000 characters or less.');
      updateLearner((current) => ({
        ...current,
        materialDraft: {
          ...current.materialDraft,
          text,
          title:
            current.materialDraft.title ||
            file.name.replace(/\.(txt|md)$/i, '').slice(0, 120),
        },
      }));
    } catch (error) {
      setFileError(
        error instanceof Error
          ? error.message
          : 'This file could not be read. Your draft is kept.',
      );
    }
  }

  return (
    <>
      <div className="section-heading">
        <div>
          <p className="eyebrow">YOUR CIRCLE’S MATERIAL SHELF</p>
          <h2 ref={shelfHeading} tabIndex={-1}>
            Bring what you’re learning from.
          </h2>
          <p className="muted">
            Class notes, a reading, a useful link. The students set the subject.
          </p>
        </div>
        <button
          disabled={!circle.circle?.joined}
          onClick={() => {
            if (
              !bringing &&
              ![
                draft.title,
                draft.text,
                draft.attribution,
                draft.sourceUrl,
              ].some((value) => value.trim())
            ) {
              updateLearner((current) => ({
                ...current,
                materialDraftCircleId: current.activeCircleId,
              }));
            }
            setBringing((value) => !value);
          }}
        >
          {bringing ? 'Close material form' : '+ Bring material'}
        </button>
      </div>
      {!circle.circle?.joined && (
        <p className="small muted">
          You can read first. Join this circle to bring a material or check in.
        </p>
      )}
      {bringing && (
        <form
          className="card bring-material-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (queueMaterial()) {
              setBringing(false);
              requestAnimationFrame(() => shelfHeading.current?.focus());
            }
          }}
        >
          <h3>Add something to study together</h3>
          {otherDraft && (
            <div className="notice">
              <p>
                Your existing material draft belongs to another circle. Nothing
                has been moved or erased.
              </p>
              <button
                type="button"
                className="secondary"
                disabled={circle.busy}
                onClick={() => chooseCircle(learner.materialDraftCircleId)}
              >
                Return to the draft’s circle
              </button>
            </div>
          )}
          <p className="small muted">
            Share only public links or text you have permission to share. This
            is a public demo, not a private classroom.
          </p>
          <div className="goal-fields">
            <div>
              <label htmlFor="material-title">Material title</label>
              <input
                id="material-title"
                readOnly={otherDraft}
                maxLength={120}
                value={draft.title}
                placeholder="e.g. Lecture notes: cell division"
                onChange={(event) => {
                  const title = event.target.value;
                  updateLearner((current) => ({
                    ...current,
                    materialDraft: { ...current.materialDraft, title },
                  }));
                }}
              />
            </div>
            <div>
              <label htmlFor="material-attribution">
                Author, course, or source
              </label>
              <input
                id="material-attribution"
                readOnly={otherDraft}
                maxLength={160}
                value={draft.attribution}
                placeholder="Give credit to where it came from"
                onChange={(event) => {
                  const attribution = event.target.value;
                  updateLearner((current) => ({
                    ...current,
                    materialDraft: { ...current.materialDraft, attribution },
                  }));
                }}
              />
            </div>
          </div>
          <label htmlFor="material-url">Source link (optional)</label>
          <input
            id="material-url"
            readOnly={otherDraft}
            type="url"
            maxLength={2000}
            value={draft.sourceUrl}
            placeholder="https://… · PDF and article links are welcome"
            onChange={(event) => {
              const sourceUrl = event.target.value;
              updateLearner((current) => ({
                ...current,
                materialDraft: { ...current.materialDraft, sourceUrl },
              }));
            }}
          />
          <div className="text-import">
            <label htmlFor="material-text">Notes or excerpt (optional)</label>
            <label className="file-label">
              Import .txt or .md
              <input
                type="file"
                disabled={otherDraft}
                accept=".txt,.md,text/plain,text/markdown"
                aria-label="Import a UTF-8 text file"
                onChange={(event) => {
                  void importText(event.target.files?.[0]);
                }}
              />
            </label>
          </div>
          <textarea
            id="material-text"
            readOnly={otherDraft}
            rows={5}
            maxLength={12000}
            value={draft.text}
            placeholder="Paste the part you want to understand together."
            onChange={(event) => {
              const text = event.target.value;
              updateLearner((current) => ({
                ...current,
                materialDraft: { ...current.materialDraft, text },
              }));
            }}
          />
          <p className="small muted">
            {draft.text.length}/12,000 characters · Text files under 32 KB.{' '}
            PDF/image files are not uploaded; share their source link instead.
          </p>
          {fileError && (
            <p className="error" role="alert">
              {fileError}
            </p>
          )}
          <label className="checkbox">
            <input
              type="checkbox"
              disabled={otherDraft}
              checked={draft.permissionToShare}
              onChange={(event) => {
                const permissionToShare = event.target.checked;
                updateLearner((current) => ({
                  ...current,
                  materialDraft: {
                    ...current.materialDraft,
                    permissionToShare,
                  },
                }));
              }}
            />
            I have permission to share this material publicly.
          </label>
          <div className="actions">
            <button type="submit" disabled={otherDraft}>
              {online
                ? 'Share material with circle'
                : 'Save material to share later'}
            </button>
            <span className="small muted">Provide a link, text, or both.</span>
          </div>
          <WorkspaceNotice circle={circle} online={online} />
        </form>
      )}
      {!bringing && <WorkspaceNotice circle={circle} online={online} />}
      <div className="shelf-toolbar">
        <label className="sr-only" htmlFor="material-search">
          Find a circle material
        </label>
        <input
          id="material-search"
          type="search"
          value={query}
          placeholder="Find a material by title or source"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="checkbox">
          <input
            type="checkbox"
            checked={savedOnly}
            onChange={(event) => setSavedOnly(event.target.checked)}
          />
          Saved on this device
        </label>
      </div>
      {materials.length === 0 && (
        <section className="card empty-shelf">
          <span className="shelf-symbol" aria-hidden="true">
            ▤
          </span>
          <h3>
            {query || savedOnly
              ? 'No materials match yet.'
              : 'A shelf waiting for your first material.'}
          </h3>
          <p className="muted">
            {query || savedOnly
              ? 'Clear the search or turn off the saved-only filter.'
              : 'Bring a reading or your notes, then choose one idea to work on together.'}
          </p>
        </section>
      )}
      <div className="material-grid">
        {materials.map((material) => {
          const waiting = pending.some((item) => item.id === material.id);
          const saved = learner.savedMaterials.some(
            (item) => item.id === material.id,
          );
          return (
            <article className="card material-card" key={material.id}>
              <div className="material-labels">
                <span className="tag">
                  {material.textLength ? 'Text to study' : 'Source link'}
                </span>
                {waiting && (
                  <span className="tag waiting">Waiting to share</span>
                )}
                {saved && <span className="tag">Saved here</span>}
              </div>
              <h3>{material.title}</h3>
              <p className="small">{material.attribution}</p>
              <p className="small muted">
                {waiting
                  ? 'Your local material'
                  : `Brought by ${material.alias}`}
                {' · '}
                {material.textLength
                  ? `${material.textLength.toLocaleString()} characters`
                  : 'Link only'}
              </p>
              <p className="small muted">
                Student-provided · not independently verified
              </p>
              <div className="actions">
                <button
                  className="secondary"
                  onClick={() => {
                    updateLearner((current) => ({
                      ...current,
                      selectedMaterialId: material.id,
                    }));
                    window.location.hash = 'study';
                  }}
                >
                  Open & study <span aria-hidden="true">→</span>
                </button>
                {material.mine && !waiting && (
                  <button
                    className="text-button"
                    disabled={!online || circle.busy}
                    onClick={() => {
                      if (
                        window.confirm(
                          'Remove this material from the public shelf? Other devices may keep saved copies.',
                        )
                      ) {
                        void deleteContribution(material.id, 'material');
                      }
                    }}
                  >
                    Remove material
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
