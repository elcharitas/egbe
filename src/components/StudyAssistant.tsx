import { useEffect, useRef, useState } from 'react';
import { SparkleIcon } from '@primer/octicons-react';
import { commitLearner } from '../client/learner-store';
import { requestFromWorker } from '../client/request';
import { emptyMaterialWork, type MaterialWork } from '../domain/learner';
import type { StudyMaterial } from '../domain/study-circle';
import {
  assistantExcerptLimit,
  assistantInputSchema,
  assistantQuestionLimit,
  type AssistanceRecord,
} from '../domain/study-assistant';
import {
  readAssistance,
  recoverAssistance,
  requestAssistance,
} from '../server/assistant.functions';

export function StudyAssistant({
  accountId,
  materialId,
  material,
  work,
  online,
  changeWork,
}: {
  accountId: string | null;
  materialId: string;
  material: StudyMaterial | null;
  work: MaterialWork;
  online: boolean;
  changeWork: (change: (current: MaterialWork) => MaterialWork) => boolean;
}) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [records, setRecords] = useState<AssistanceRecord[]>([]);
  const [busy, setBusy] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const active = useRef(true);
  const answerHeading = useRef<HTMLHeadingElement>(null);
  const excerpt =
    work.assistantExcerpt ??
    material?.text.slice(0, assistantExcerptLimit) ??
    '';
  const pendingId = work.assistantRequestId;

  useEffect(() => {
    setConfirmed(false);
  }, [excerpt, work.question, material?.title, material?.attribution]);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (!online) return;
    let disposed = false;
    requestFromWorker((signal) =>
      readAssistance({ data: { materialId }, signal }),
    )
      .then((result) => {
        if (disposed) return;
        setConfigured(result.configured);
        setRecords(result.requests);
      })
      .catch(() => {
        if (!disposed)
          setError(
            'Study assistance could not be checked. Your question is kept.',
          );
      });
    return () => {
      disposed = true;
    };
  }, [materialId, online]);

  async function remember(record: AssistanceRecord) {
    if (!active.current) return;
    setRecords((current) =>
      [record, ...current.filter((item) => item.id !== record.id)].slice(0, 5),
    );
    if (record.status === 'pending') {
      setFeedback(
        'The request is still unconfirmed. Check its status before starting another.',
      );
      return;
    }
    const saved = await commitLearner((learner) => {
      const current = learner.materialWork[materialId];
      if (!current || current.assistantRequestId !== record.id) return learner;
      return {
        ...learner,
        materialWork: {
          ...learner.materialWork,
          [materialId]: { ...current, assistantRequestId: null },
        },
      };
    });
    if (!active.current) return;
    setFeedback(
      saved
        ? record.status === 'complete'
          ? 'AI answer saved privately in your account.'
          : 'The request did not produce an answer. Your question is kept.'
        : 'The request is recorded in your account, but its confirmation marker could not be cleared. Retry account save.',
    );
    requestAnimationFrame(() => answerHeading.current?.focus());
  }

  async function ask(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || pendingId || !online || !configured || !material) return;
    const input = assistantInputSchema.safeParse({
      id: crypto.randomUUID(),
      accountId,
      materialId,
      question: work.question,
      excerpt,
      confirmSharing: confirmed,
    });
    if (!input.success) {
      setError(
        input.error.issues[0]?.message ?? 'Review your question and excerpt.',
      );
      return;
    }
    setBusy(true);
    setError('');
    setFeedback('');
    let requestSaved = false;
    try {
      const saved = await commitLearner((learner) => ({
        ...learner,
        materialWork: {
          ...learner.materialWork,
          [materialId]: {
            ...(learner.materialWork[materialId] ??
              emptyMaterialWork(learner.activeCircleId)),
            assistantExcerpt: input.data.excerpt,
            assistantRequestId: input.data.id,
          },
        },
      }));
      if (!saved)
        throw new Error(
          'The request draft was not saved to your account. No AI request was sent.',
        );
      requestSaved = true;
      if (!active.current) return;
      const record = await requestFromWorker(
        (signal) => requestAssistance({ data: input.data, signal }),
        45000,
      );
      await remember(record);
      if (active.current) setConfirmed(false);
    } catch (failure) {
      if (active.current) {
        const transportFailure =
          failure instanceof Error &&
          failure.message.startsWith('The connection');
        setError(
          requestSaved && transportFailure
            ? 'The assistant reply was not confirmed. Your question and request ID are saved in your account. Use “Check earlier request” before starting another paid call.'
            : failure instanceof Error
              ? failure.message
              : 'The assistant request failed.',
        );
      }
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function recover() {
    if (!pendingId || busy) return;
    setBusy(true);
    setError('');
    try {
      const record = await requestFromWorker((signal) =>
        recoverAssistance({ data: { id: pendingId }, signal }),
      );
      await remember(record);
    } catch {
      if (active.current)
        setError(
          'The earlier request could not be confirmed. No replacement AI call was made.',
        );
    } finally {
      if (active.current) setBusy(false);
    }
  }

  async function clearPending() {
    if (
      !window.confirm(
        'The earlier request may already have used OpenAI credits. Starting another can incur another charge. Keep its record and clear the waiting marker?',
      )
    )
      return;
    setBusy(true);
    const saved = await commitLearner((learner) => {
      const current = learner.materialWork[materialId];
      if (!current || current.assistantRequestId !== pendingId) return learner;
      return {
        ...learner,
        materialWork: {
          ...learner.materialWork,
          [materialId]: { ...current, assistantRequestId: null },
        },
      };
    });
    if (active.current) {
      setBusy(false);
      setError(
        saved ? '' : 'The waiting marker was not cleared. Retry account save.',
      );
      setFeedback(
        saved
          ? 'Earlier request retained. You can prepare a new question.'
          : '',
      );
    }
  }

  function editQuestion(question: string) {
    setConfirmed(false);
    changeWork((current) => ({ ...current, question }));
  }

  return (
    <section
      id="study-assistant"
      tabIndex={-1}
      className="card study-assistant"
      aria-label="Study assistant"
    >
      <h2>
        <SparkleIcon /> Study assistant
      </h2>
      <p className="small muted">
        Understand an idea, try a short exercise, then bring what you learned to
        your circle.
      </p>
      <form onSubmit={ask}>
        <label htmlFor="study-question">My study question</label>
        <textarea
          id="study-question"
          rows={3}
          maxLength={assistantQuestionLimit}
          value={work.question}
          readOnly={busy}
          placeholder="What would I like help understanding?"
          onChange={(event) => editQuestion(event.target.value)}
        />
        <div className="actions assistant-prompts">
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              editQuestion('Explain one important idea in this excerpt simply.')
            }
          >
            Explain an idea
          </button>
          <button
            type="button"
            className="secondary"
            disabled={busy}
            onClick={() =>
              editQuestion(
                'Give me one short practice question and a hint, without the answer.',
              )
            }
          >
            Help me practise
          </button>
        </div>
        <label htmlFor="assistant-excerpt">Excerpt for the assistant</label>
        <textarea
          id="assistant-excerpt"
          rows={5}
          maxLength={assistantExcerptLimit}
          value={excerpt}
          readOnly={busy}
          placeholder="Paste a permitted excerpt if this material is only a link."
          onChange={(event) => {
            const assistantExcerpt = event.target.value;
            setConfirmed(false);
            changeWork((current) => ({ ...current, assistantExcerpt }));
          }}
        />
        <p className="small muted">
          {excerpt.length}/{assistantExcerptLimit} characters. Egbe does not
          fetch the original link.
        </p>
        <p className="small">
          <strong>Material:</strong>{' '}
          {material?.title ?? 'Reconnect to open the source'}
          <br />
          <strong>Attribution:</strong> {material?.attribution ?? 'Not loaded'}
        </p>
        <p className="small muted">
          OpenAI receives this title, attribution, excerpt, and question. Your
          private goal and notes are not included. Questions and answers stay
          private in D1.
        </p>
        <label className="checkbox">
          <input
            type="checkbox"
            checked={confirmed}
            disabled={busy}
            onChange={(event) => setConfirmed(event.target.checked)}
          />
          Send this reviewed excerpt and question to OpenAI.
        </label>
        <button
          disabled={
            !online || !configured || !material || busy || Boolean(pendingId)
          }
        >
          {busy ? 'Working…' : 'Get study help'}
        </button>
      </form>
      {configured === false && (
        <p className="notice small">
          The site’s OpenAI key is not connected yet. Your question, notes, and
          circle remain available.
        </p>
      )}
      {!online && (
        <p className="notice small">
          Reconnect for AI assistance. Unsaved edits remain only in this page.
        </p>
      )}
      {pendingId && (
        <div className="notice">
          <p className="small">
            An earlier request is unconfirmed. Checking its status does not make
            another paid call.
          </p>
          <div className="actions">
            <button
              className="secondary"
              disabled={!online || busy}
              onClick={() => {
                void recover();
              }}
            >
              Check earlier request
            </button>
            <button
              className="text-button"
              disabled={!online || busy}
              onClick={() => {
                void clearPending();
              }}
            >
              Prepare a new request instead
            </button>
          </div>
        </div>
      )}
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="feedback" role="status">
          {feedback}
        </p>
      )}
      {records.length > 0 && (
        <div className="assistant-history">
          <h3 ref={answerHeading} tabIndex={-1}>
            Your recent assistance
          </h3>
          {records.map((record) => (
            <article className="assistant-record" key={record.id}>
              <p>
                <strong>{record.question}</strong>
              </p>
              {record.status === 'complete' ? (
                <>
                  <span className="tag">
                    AI-generated · check against the source
                  </span>
                  <p className="assistant-answer">{record.answer}</p>
                </>
              ) : (
                <p className="small muted">
                  {record.error ?? 'Waiting for a confirmed answer.'}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
      <details className="small assistant-data-details">
        <summary>Data and usage</summary>
        <p>
          Requests use the site owner’s OpenAI API account, not a ChatGPT
          subscription. Limits apply to all attempts, including failures. OpenAI
          may retain API data for abuse monitoring; Egbe disables stored
          Responses but cannot promise zero provider retention.
        </p>
        <p>
          Assistance is a private account copy. Removing a circle material does
          not remove your earlier questions, excerpts, or AI answers. New
          requests still require access to the current material.
        </p>
      </details>
    </section>
  );
}
