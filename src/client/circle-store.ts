import { useEffect, useSyncExternalStore } from 'react';
import { checkInSchema } from '../domain/check-in';
import { flushOutbox } from '../domain/outbox';
import {
  openCircle,
  readCircle,
  removeCheckIn,
  shareCheckIn,
  type CirclePost,
} from '../server/circle.functions';
import {
  removeWaitingCheckIn,
  currentLearner,
  deviceSaveStatus,
  updateLearner,
} from './learner-store';

export interface CircleState {
  posts: CirclePost[];
  alias: string | null;
  loaded: boolean;
  busy: boolean;
  error: string;
  feedback: string;
}

const initial: CircleState = {
  posts: [],
  alias: null,
  loaded: false,
  busy: false,
  error: '',
  feedback: '',
};
let state = initial;
const subscribers = new Set<() => void>();

function publish(change: Partial<CircleState>) {
  state = { ...state, ...change };
  if (change.error) state.feedback = '';
  for (const notify of subscribers) notify();
}

function failureMessage(error: unknown) {
  if (error instanceof TypeError) {
    return (
      'The circle connection failed. Your waiting check-ins are kept. ' +
      'Try Refresh & sync when connected.'
    );
  }
  return error instanceof Error
    ? error.message
    : 'The circle could not be reached. Your waiting check-ins are kept.';
}

async function circleRequest<Result>(
  request: (signal: AbortSignal) => Promise<Result>,
) {
  const controller = new AbortController();
  const interrupt = () => controller.abort();
  const timeout = setTimeout(interrupt, 15000);
  window.addEventListener('offline', interrupt, { once: true });
  try {
    return await request(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error(
        'The connection was interrupted or took too long. ' +
          'Unconfirmed check-ins are kept. Try Refresh & sync when connected.',
      );
    }
    throw error;
  } finally {
    clearTimeout(timeout);
    window.removeEventListener('offline', interrupt);
  }
}

export async function syncCircle(join = false) {
  if (state.busy || !navigator.onLine) return;
  if (deviceSaveStatus() !== 'saved') {
    publish({ error: 'Save on this device before sharing with the circle.' });
    return;
  }
  publish({ busy: true, error: '', feedback: '' });
  try {
    const result = await circleRequest((signal) =>
      join ? openCircle({ signal }) : readCircle({ signal }),
    );
    const previousParticipant = currentLearner().participant;
    if (
      previousParticipant &&
      previousParticipant !== result.participant &&
      currentLearner().outbox.length > 0
    ) {
      throw new Error(
        'Your circle cookie has changed. Waiting check-ins were not shared. ' +
          'Copy their text before cancelling them, then join again.',
      );
    }
    const saved = updateLearner((learner) => ({
      ...learner,
      participant: result.participant,
    }));
    publish({ posts: result.posts, alias: result.alias, loaded: true });
    if (!saved) {
      throw new Error('Save on this device before sharing with the circle.');
    }
    while (currentLearner().outbox.length > 0) {
      await flushOutbox<CirclePost>(
        {
          read: () => currentLearner().outbox,
          acknowledge: (id, post) => {
            if (!removeWaitingCheckIn(id)) {
              throw new Error(
                'The server received your check-in, but this device could not ' +
                  'save its confirmation. Its waiting copy is kept for a safe retry.',
              );
            }
            publish({
              posts: [
                post,
                ...state.posts.filter((item) => item.id !== post.id),
              ].slice(0, 50),
              feedback: 'Check-in shared with the circle.',
            });
          },
        },
        (entry) =>
          circleRequest((signal) => shareCheckIn({ data: entry, signal })),
      );
    }
    if (!state.feedback)
      publish({ feedback: 'Circle refreshed. No automatic polling.' });
  } catch (error) {
    publish({ error: failureMessage(error) });
  } finally {
    publish({ busy: false });
  }
}

export function queueCheckIn() {
  const learner = currentLearner();
  if (!learner.participant) {
    publish({
      error: 'Join the demo circle online before your first check-in.',
    });
    return;
  }
  if (learner.outbox.length >= 50) {
    publish({
      error: 'You have 50 waiting check-ins. Sync or cancel one first.',
    });
    return;
  }
  const parsed = checkInSchema.safeParse({
    id: crypto.randomUUID(),
    participant: learner.participant,
    direction: learner.direction,
    message: learner.checkInDraft,
  });
  if (!parsed.success) {
    publish({ error: 'Write a check-in between 1 and 600 characters.' });
    return;
  }
  const saved = updateLearner((current) => ({
    ...current,
    checkInDraft: '',
    outbox: [...current.outbox, parsed.data],
  }));
  publish({
    error: saved
      ? ''
      : 'Device save failed. Keep this page open and retry device save.',
    feedback: saved ? 'Check-in saved on this device, waiting to share.' : '',
  });
  if (saved && navigator.onLine) void syncCircle();
}

export function cancelWaitingCheckIn(id: string) {
  if (state.busy) return;
  if (removeWaitingCheckIn(id)) {
    publish({ feedback: 'Waiting check-in cancelled on this device.' });
  } else {
    publish({
      error:
        'Cancellation was not saved. The waiting copy is still here. ' +
        'Retry the device save, then cancel again before reloading.',
    });
  }
}

export function reopenCircleSession() {
  if (currentLearner().outbox.length > 0) {
    publish({
      error:
        'Copy and cancel waiting check-ins before reopening a changed session.',
    });
    return;
  }
  const saved = updateLearner((learner) => ({ ...learner, participant: null }));
  if (!saved) {
    publish({
      error: 'The session change was not saved. Retry device save first.',
    });
    return;
  }
  publish({ loaded: false, posts: [], alias: null });
  void syncCircle(true);
}

export async function deleteSharedCheckIn(id: string) {
  if (state.busy || !navigator.onLine) return;
  publish({ busy: true, error: '', feedback: '' });
  try {
    await circleRequest((signal) => removeCheckIn({ data: { id }, signal }));
    publish({
      posts: state.posts.filter((post) => post.id !== id),
      feedback: 'Your check-in was removed from the circle.',
    });
  } catch (error) {
    publish({ error: failureMessage(error) });
  } finally {
    publish({ busy: false });
  }
}

export function useCircle(
  ready: boolean,
  online: boolean,
  participant: string | null,
) {
  const circle = useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => state,
    () => initial,
  );
  useEffect(() => {
    if (
      ready &&
      online &&
      participant &&
      (!state.loaded || currentLearner().outbox.length > 0)
    ) {
      void syncCircle();
    }
  }, [ready, online, participant]);
  return circle;
}
