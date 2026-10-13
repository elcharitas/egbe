import { useEffect, useSyncExternalStore } from 'react';
import {
  createAccountSync,
  type AccountSaveStatus,
} from '../domain/account-sync';
import { emptyLearner, learnerSchema, type Learner } from '../domain/learner';
import { readWorkspace, saveWorkspace } from '../server/workspace.functions';
import { requestFromWorker } from './request';

interface Snapshot {
  learner: Learner;
  accountId: string | null;
  ready: boolean;
  status: AccountSaveStatus | 'loading' | 'error';
  error: string;
  committing: boolean;
}
const initial: Snapshot = {
  learner: emptyLearner(),
  accountId: null,
  ready: false,
  status: 'loading',
  error: '',
  committing: false,
};
let snapshot = initial;
let directory: Pick<Learner, 'circles' | 'shelf'> = {
  circles: [],
  shelf: null,
};
let sync: ReturnType<typeof createAccountSync<Learner>> | undefined;
let opening: Promise<boolean> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
let generation = 0;
const subscribers = new Set<() => void>();

function publish(next: Snapshot) {
  snapshot = { ...next, learner: { ...next.learner, ...directory } };
  for (const notify of subscribers) notify();
}

async function openWorkspace(accountId: string) {
  if (opening) return opening;
  const request = generation;
  publish({ ...snapshot, status: 'loading', error: '' });
  opening = (async () => {
    try {
      const result = await requestFromWorker((signal) =>
        readWorkspace({ signal }),
      );
      if (request !== generation) return false;
      const learner = learnerSchema.parse(result.learner);
      sync = createAccountSync(
        learner,
        result.revision,
        (mutation) => {
          if (request !== generation) {
            return Promise.reject(
              new Error('Your account changed. Original work was not sent.'),
            );
          }
          return requestFromWorker((signal) =>
            saveWorkspace({
              data: {
                learner: mutation.value,
                revision: mutation.revision,
                mutationId: mutation.mutationId,
              },
              signal,
            }),
          );
        },
        (next) => {
          if (request !== generation) return;
          publish({
            learner: next.value,
            accountId,
            ready: true,
            status: next.status,
            error: next.error,
            committing: next.committing,
          });
        },
        () => crypto.randomUUID(),
      );
      publish({
        learner,
        accountId,
        ready: true,
        status: 'saved',
        error: '',
        committing: false,
      });
      return true;
    } catch (error) {
      if (request === generation) {
        publish({
          ...snapshot,
          status: 'error',
          error:
            error instanceof Error
              ? error.message
              : 'Account work could not be opened.',
        });
      }
      return false;
    } finally {
      if (request === generation) opening = undefined;
    }
  })();
  return opening;
}

export function clearAccountWork() {
  generation++;
  clearTimeout(saveTimer);
  opening = undefined;
  sync = undefined;
  directory = { circles: [], shelf: null };
  publish(initial);
}

export function updateCircleDirectory(
  circles: Learner['circles'],
  shelf: Learner['shelf'],
) {
  directory = { circles, shelf };
  publish(snapshot);
}

export function currentLearner() {
  return snapshot.learner;
}

export function accountSaveStatus() {
  return snapshot.status;
}

export function hasUnconfirmedAccountWork() {
  return snapshot.ready && snapshot.status !== 'saved';
}

export function updateLearner(change: (learner: Learner) => Learner) {
  if (!sync) return false;
  const applied = sync.update((learner) =>
    learnerSchema.parse({
      ...change({ ...learner, ...directory }),
      circles: [],
      shelf: null,
    }),
  );
  if (applied && navigator.onLine && snapshot.status !== 'conflict') {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      void sync?.flush();
    }, 600);
  }
  return applied;
}

export async function commitLearner(change: (learner: Learner) => Learner) {
  clearTimeout(saveTimer);
  const currentSync = sync;
  const request = generation;
  if (!currentSync) return false;
  const saved = await currentSync.commit((learner) =>
    learnerSchema.parse({
      ...change({ ...learner, ...directory }),
      circles: [],
      shelf: null,
    }),
  );
  return saved && request === generation && currentSync === sync;
}

export async function retryAccountSave() {
  clearTimeout(saveTimer);
  return sync
    ? sync.flush()
    : snapshot.accountId
      ? openWorkspace(snapshot.accountId)
      : false;
}

export function removeWaitingCheckIn(id: string) {
  return commitLearner((learner) => ({
    ...learner,
    outbox: learner.outbox.filter((entry) => entry.id !== id),
  }));
}

export function removeWaitingMaterial(id: string) {
  return commitLearner((learner) => ({
    ...learner,
    materialOutbox: learner.materialOutbox.filter((entry) => entry.id !== id),
  }));
}

export function downloadRecovery() {
  const blob = new Blob([JSON.stringify(snapshot.learner, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'egbe-work-export.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function useLearner(accountId: string | null) {
  const state = useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => snapshot,
    () => initial,
  );
  useEffect(() => {
    clearAccountWork();
    if (accountId) {
      publish({ ...initial, accountId });
      void openWorkspace(accountId);
    }
  }, [accountId]);
  useEffect(() => {
    const reconnect = () => {
      if (accountId) void retryAccountSave();
    };
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (accountId && snapshot.ready && snapshot.status !== 'saved') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('online', reconnect);
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      window.removeEventListener('online', reconnect);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }, [accountId]);
  return state.accountId === accountId ? state : initial;
}
