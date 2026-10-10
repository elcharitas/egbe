import { useEffect, useSyncExternalStore } from 'react';
import { emptyLearner, learnerSchema, type Learner } from '../domain/learner';

const storageKey = 'egbe.learner.v1';
type SaveStatus = 'saved' | 'unsaved' | 'damaged' | 'unreadable' | 'conflict';
interface Snapshot {
  learner: Learner;
  ready: boolean;
  status: SaveStatus;
}

const initial: Snapshot = {
  learner: emptyLearner(),
  ready: false,
  status: 'saved',
};
let snapshot = initial;
let initialized = false;
let lastSaved: Learner | undefined;
let recoveryStoredData: string | null = null;
const subscribers = new Set<() => void>();
class UnreadableProgress extends Error {}

function publish(next: Snapshot) {
  snapshot = next;
  for (const notify of subscribers) notify();
}

function readStoredLearner(): Learner {
  const stored = localStorage.getItem(storageKey);
  recoveryStoredData = stored;
  if (stored === null) return emptyLearner();
  try {
    return learnerSchema.parse(JSON.parse(stored));
  } catch {
    throw new UnreadableProgress('Stored learner data could not be read.');
  }
}

function openStoredProgress() {
  try {
    lastSaved = readStoredLearner();
    publish({ learner: lastSaved, ready: true, status: 'saved' });
  } catch (error) {
    publish({
      ...snapshot,
      ready: error instanceof UnreadableProgress,
      status: error instanceof UnreadableProgress ? 'damaged' : 'unreadable',
    });
  }
}

function initialize() {
  if (initialized) return;
  initialized = true;
  openStoredProgress();
  window.addEventListener('storage', (event) => {
    if (event.key !== storageKey || snapshot.status !== 'saved') return;
    openStoredProgress();
  });
}

export function currentLearner() {
  return snapshot.learner;
}

export function deviceSaveStatus() {
  return snapshot.status;
}

function persist(learner: Learner, failedSave = learner) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(learner));
    lastSaved = learner;
    publish({ learner, ready: true, status: 'saved' });
    return true;
  } catch {
    publish({ learner: failedSave, ready: true, status: 'unsaved' });
    return false;
  }
}

function changeLearner(
  change: (learner: Learner) => Learner,
  keepInPageOnFailure: boolean,
) {
  if (!snapshot.ready) return false;
  if (!keepInPageOnFailure && snapshot.status !== 'saved') return false;
  let learner = snapshot.learner;
  if (snapshot.status === 'saved') {
    try {
      learner = readStoredLearner();
      lastSaved = learner;
    } catch (error) {
      const next = keepInPageOnFailure
        ? learnerSchema.parse(change(learner))
        : learner;
      publish({
        learner: next,
        ready: true,
        status: error instanceof UnreadableProgress ? 'damaged' : 'unsaved',
      });
      return false;
    }
  }
  const next = learnerSchema.parse(change(learner));
  if (snapshot.status !== 'saved') {
    publish({ ...snapshot, learner: next });
    return false;
  }
  return persist(next, keepInPageOnFailure ? next : learner);
}

export function updateLearner(change: (learner: Learner) => Learner) {
  return changeLearner(change, true);
}

// Public actions keep their draft or retry ID until the write is durable.
export function commitLearner(change: (learner: Learner) => Learner) {
  return changeLearner(change, false);
}

export function retryDeviceSave() {
  if (!snapshot.ready) {
    // An initial access failure is not evidence that the storage key is empty.
    openStoredProgress();
    return snapshot.status === 'saved';
  }
  if (snapshot.status !== 'unsaved') return false;
  try {
    const stored = readStoredLearner();
    if (JSON.stringify(stored) !== JSON.stringify(lastSaved)) {
      publish({ ...snapshot, status: 'conflict' });
      return false;
    }
    return persist(snapshot.learner);
  } catch (error) {
    if (error instanceof UnreadableProgress) {
      publish({ ...snapshot, status: 'damaged' });
    }
    return false;
  }
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
  const recovery = {
    currentLearning: snapshot.learner,
    storedData: recoveryStoredData,
    saveStatus: snapshot.status,
  };
  const blob = new Blob([JSON.stringify(recovery, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'egbe-device-recovery.json';
  link.click();
  URL.revokeObjectURL(url);
}

export function useLearner() {
  const state = useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => snapshot,
    () => initial,
  );
  useEffect(initialize, []);
  return state;
}
