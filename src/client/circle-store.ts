import { useEffect, useRef, useSyncExternalStore } from 'react';
import { checkInSchema } from '../domain/check-in';
import { emptyMaterialDraft } from '../domain/learner';
import { flushOutbox } from '../domain/outbox';
import {
  createCircleSchema,
  shareMaterialSchema,
  type MaterialSummary,
  type PendingMaterial,
  type StudyCircle,
  type StudyMaterial,
} from '../domain/study-circle';
import {
  createCircle,
  listCircles,
  openCircle,
  readCircle,
  readMaterial,
  removeCheckIn,
  removeMaterial,
  shareCheckIn,
  shareMaterial,
  type CirclePost,
  type CircleSnapshot,
} from '../server/circle.functions';
import {
  commitLearner,
  currentLearner,
  deviceSaveStatus,
  removeWaitingCheckIn,
  removeWaitingMaterial,
  updateLearner,
} from './learner-store';
import { requestFromWorker as circleRequest } from './request';

export interface CircleState {
  posts: CirclePost[];
  materials: MaterialSummary[];
  circle: StudyCircle | null;
  material: StudyMaterial | null;
  alias: string | null;
  loaded: boolean;
  busy: boolean;
  reading: boolean;
  error: string;
  feedback: string;
}

const initial: CircleState = {
  posts: [],
  materials: [],
  circle: null,
  material: null,
  alias: null,
  loaded: false,
  busy: false,
  reading: false,
  error: '',
  feedback: '',
};
let state = initial;
let materialRead = 0;
const subscribers = new Set<() => void>();

function publish(change: Partial<CircleState>) {
  state = { ...state, ...change };
  if (change.error) state.feedback = '';
  for (const notify of subscribers) notify();
}

function failureMessage(error: unknown) {
  if (error instanceof TypeError) {
    return (
      'The connection failed. Your private work and waiting contributions ' +
      'are kept. Refresh & sync when connected.'
    );
  }
  return error instanceof Error
    ? error.message
    : 'The circle could not be reached.';
}

function rememberCircle(result: CircleSnapshot, circles: StudyCircle[]) {
  const learner = currentLearner();
  const waiting = learner.outbox.length + learner.materialOutbox.length;
  if (
    learner.participant &&
    learner.participant !== result.participant &&
    waiting
  ) {
    throw new Error(
      'Your circle cookie has changed. Waiting contributions were not shared. ' +
        'Copy and cancel them before joining with a new demo name.',
    );
  }
  const saved = updateLearner((current) => ({
    ...current,
    participant: result.participant,
    circles: [
      result.circle,
      ...circles.filter((item) => item.id !== result.circle.id),
    ].slice(0, 30),
    shelf: {
      circle: result.circle,
      materials: result.materials,
      fetchedAt: Date.now(),
    },
  }));
  publish({
    circle: result.circle,
    materials: result.materials,
    posts: result.posts,
    alias: result.alias,
    loaded: true,
  });
  return saved;
}

async function flushContributions() {
  while (
    currentLearner().materialOutbox.length ||
    currentLearner().outbox.length
  ) {
    await flushOutbox<MaterialSummary, PendingMaterial>(
      {
        read: () => currentLearner().materialOutbox,
        acknowledge: (id, material) => {
          if (!removeWaitingMaterial(id)) {
            throw new Error(
              'The server received your material, but this device could not ' +
                'save its confirmation. The waiting copy is kept for a safe retry.',
            );
          }
          if (material.circleId === currentLearner().activeCircleId) {
            publish({
              materials: [
                material,
                ...state.materials.filter((item) => item.id !== id),
              ],
            });
          }
          publish({ feedback: 'Material shared with the circle.' });
        },
      },
      (entry) =>
        circleRequest((signal) => shareMaterial({ data: entry, signal })),
    );
    await flushOutbox<CirclePost>(
      {
        read: () => currentLearner().outbox,
        acknowledge: (id, post) => {
          if (!removeWaitingCheckIn(id)) {
            throw new Error(
              'The server received your check-in, but this device could not ' +
                'save its confirmation. The waiting copy is kept for a safe retry.',
            );
          }
          if (post.circleId === currentLearner().activeCircleId) {
            publish({
              posts: [
                post,
                ...state.posts.filter((item) => item.id !== id),
              ].slice(0, 50),
            });
          }
          publish({ feedback: 'Check-in shared with the circle.' });
        },
      },
      (entry) =>
        circleRequest((signal) => shareCheckIn({ data: entry, signal })),
    );
  }
}

export async function syncCircle(join = false) {
  if (state.busy || !navigator.onLine) return false;
  if (join && deviceSaveStatus() !== 'saved') {
    publish({ error: 'Retry the device save before joining or sharing.' });
    return false;
  }
  const circleId = currentLearner().activeCircleId;
  publish({ busy: true, error: '', feedback: '' });
  try {
    const result = await circleRequest((signal) =>
      join
        ? openCircle({ data: { circleId }, signal })
        : readCircle({ data: { circleId }, signal }),
    );
    const circles = await circleRequest((signal) => listCircles({ signal }));
    const saved = rememberCircle(result, circles);
    if (saved && result.participant && deviceSaveStatus() === 'saved') {
      await flushContributions();
    }
    if (!state.feedback)
      publish({ feedback: 'Circle refreshed. No automatic polling.' });
    return true;
  } catch (error) {
    publish({ error: failureMessage(error) });
    return false;
  } finally {
    publish({ busy: false });
  }
}

export function chooseCircle(circleId: string) {
  if (state.busy) return;
  materialRead += 1;
  updateLearner((learner) => ({
    ...learner,
    activeCircleId: circleId,
    selectedMaterialId: null,
    checkInMaterialId: learner.checkInDraft.trim()
      ? learner.checkInMaterialId
      : null,
    checkInCircleId: learner.checkInDraft.trim()
      ? learner.checkInCircleId
      : circleId,
  }));
  publish({
    circle: null,
    material: null,
    materials: [],
    posts: [],
    loaded: false,
    reading: false,
    error: '',
    feedback: '',
  });
}

export async function createStudyCircle() {
  if (state.busy || !navigator.onLine) return false;
  const learner = currentLearner();
  const id = learner.circleDraft.id ?? crypto.randomUUID();
  const parsed = createCircleSchema.safeParse({ ...learner.circleDraft, id });
  if (!parsed.success) {
    publish({ error: 'Give the circle a title (up to 80 characters).' });
    return false;
  }
  if (!learner.participant) {
    publish({ error: 'Join a circle with a demo name before creating one.' });
    return false;
  }
  if (
    !commitLearner((current) => ({
      ...current,
      circleDraft: { ...current.circleDraft, id },
    }))
  ) {
    publish({
      error: 'Save the circle draft on this device before creating it.',
    });
    return false;
  }
  publish({ busy: true, error: '', feedback: '' });
  try {
    const result = await circleRequest((signal) =>
      createCircle({ data: parsed.data, signal }),
    );
    const saved = commitLearner((current) => ({
      ...current,
      activeCircleId: result.circle.id,
      selectedMaterialId: null,
      circleDraft: { id: null, title: '', description: '' },
      circles: [
        result.circle,
        ...current.circles.filter((item) => item.id !== result.circle.id),
      ].slice(0, 30),
      shelf: {
        circle: result.circle,
        materials: result.materials,
        fetchedAt: Date.now(),
      },
    }));
    if (!saved)
      throw new Error(
        'The circle was created, but its confirmation could not be saved. ' +
          'Keep this page open and retry device save; the draft retains its retry ID.',
      );
    publish({
      circle: result.circle,
      materials: result.materials,
      posts: result.posts,
      alias: result.alias,
      material: null,
      loaded: true,
      feedback: 'Circle created. Bring the first material.',
    });
    return true;
  } catch (error) {
    publish({ error: failureMessage(error) });
    return false;
  } finally {
    publish({ busy: false });
  }
}

export function queueMaterial() {
  const learner = currentLearner();
  if (learner.materialDraftCircleId !== learner.activeCircleId) {
    publish({
      error: 'This draft belongs to another circle. Return there to share it.',
    });
    return false;
  }
  if (!learner.participant || !state.circle?.joined) {
    publish({ error: 'Join this circle online before bringing a material.' });
    return false;
  }
  if (learner.materialOutbox.length >= 10) {
    publish({ error: 'Ten materials are waiting. Sync or cancel one first.' });
    return false;
  }
  const parsed = shareMaterialSchema.safeParse({
    ...learner.materialDraft,
    sourceUrl: learner.materialDraft.sourceUrl.trim() || null,
    id: crypto.randomUUID(),
    circleId: learner.activeCircleId,
    participant: learner.participant,
  });
  if (!parsed.success) {
    publish({
      error: parsed.error.issues[0]?.message ?? 'Check the material details.',
    });
    return false;
  }
  const saved = commitLearner((current) => ({
    ...current,
    materialDraft: { ...emptyMaterialDraft },
    materialOutbox: [...current.materialOutbox, parsed.data],
  }));
  if (!saved) {
    publish({
      error:
        'The material was not safely saved. Your draft is kept; retry device save.',
    });
    return false;
  }
  publish({
    error: '',
    feedback: 'Material saved on this device, waiting to share.',
  });
  if (navigator.onLine) void syncCircle();
  return true;
}

export function queueCheckIn() {
  const learner = currentLearner();
  if (learner.checkInCircleId !== learner.activeCircleId) {
    publish({
      error: 'This draft belongs to another circle. Return there to share it.',
    });
    return;
  }
  if (!learner.participant || !state.circle?.joined) {
    publish({ error: 'Join this circle online before your first check-in.' });
    return;
  }
  if (learner.outbox.length >= 50) {
    publish({
      error: 'Fifty check-ins are waiting. Sync or cancel one first.',
    });
    return;
  }
  const parsed = checkInSchema.safeParse({
    id: crypto.randomUUID(),
    participant: learner.participant,
    circleId: learner.activeCircleId,
    materialId: learner.checkInMaterialId,
    direction: learner.direction,
    message: learner.checkInDraft,
  });
  if (!parsed.success) {
    publish({ error: 'Write a check-in between 1 and 600 characters.' });
    return;
  }
  const saved = commitLearner((current) => ({
    ...current,
    checkInDraft: '',
    outbox: [...current.outbox, parsed.data],
  }));
  publish({
    error: saved
      ? ''
      : 'Device save failed. Your draft is kept; retry device save.',
    feedback: saved ? 'Check-in saved on this device, waiting to share.' : '',
  });
  if (saved && navigator.onLine) void syncCircle();
}

export function cancelContribution(id: string, kind: 'material' | 'check-in') {
  if (state.busy) return;
  const saved =
    kind === 'material' ? removeWaitingMaterial(id) : removeWaitingCheckIn(id);
  publish(
    saved
      ? {
          error: '',
          feedback: 'Waiting contribution cancelled on this device.',
        }
      : {
          error:
            'Cancellation was not saved. Its retry ID is kept. Retry device save, then cancel again before reloading.',
        },
  );
}

export async function deleteContribution(
  id: string,
  kind: 'material' | 'check-in',
) {
  if (state.busy || !navigator.onLine) return;
  publish({ busy: true, error: '', feedback: '' });
  try {
    if (kind === 'material') {
      await circleRequest((signal) => removeMaterial({ data: { id }, signal }));
      publish({
        materials: state.materials.filter((item) => item.id !== id),
        material: state.material?.id === id ? null : state.material,
      });
    } else {
      await circleRequest((signal) => removeCheckIn({ data: { id }, signal }));
      publish({ posts: state.posts.filter((post) => post.id !== id) });
    }
    publish({
      feedback: 'Your contribution was removed from the public circle.',
    });
  } catch (error) {
    publish({ error: failureMessage(error) });
  } finally {
    publish({ busy: false });
  }
}

export function reopenCircleSession() {
  const learner = currentLearner();
  if (learner.outbox.length || learner.materialOutbox.length) {
    publish({
      error:
        'Copy and cancel waiting contributions before reopening a changed session.',
    });
    return;
  }
  if (!commitLearner((current) => ({ ...current, participant: null }))) {
    publish({
      error: 'The session change was not saved. Retry device save first.',
    });
    return;
  }
  void syncCircle(true);
}

export async function loadMaterial(id: string) {
  const request = ++materialRead;
  const learner = currentLearner();
  const pending = learner.materialOutbox.find((material) => material.id === id);
  if (pending) {
    updateLearner((current) => ({ ...current, selectedMaterialId: id }));
    publish({
      material: {
        ...pending,
        textLength: pending.text.length,
        alias: `Learner ${pending.participant.slice(0, 6)}`,
        mine: true,
        createdAt: 0,
      },
      reading: false,
      error: '',
    });
    return;
  }
  const saved = learner.savedMaterials.find((material) => material.id === id);
  publish({ material: saved ?? null, reading: true, error: '' });
  updateLearner((current) => ({ ...current, selectedMaterialId: id }));
  try {
    if (!navigator.onLine) {
      if (!saved)
        throw new Error(
          'This material is not saved for offline reading. Your private notes are still here.',
        );
      return;
    }
    const material = await circleRequest((signal) =>
      readMaterial({ data: { id }, signal }),
    );
    if (request === materialRead) publish({ material });
  } catch (error) {
    if (request === materialRead) publish({ error: failureMessage(error) });
  } finally {
    if (request === materialRead) publish({ reading: false });
  }
}

export function saveMaterialOffline() {
  if (!state.material) return;
  const material = state.material;
  const learner = currentLearner();
  if (
    !learner.savedMaterials.some((item) => item.id === material.id) &&
    learner.savedMaterials.length >= 20
  ) {
    publish({
      error:
        'Twenty materials are saved. Remove a local copy before saving another.',
    });
    return;
  }
  const saved = commitLearner((current) => ({
    ...current,
    savedMaterials: [
      material,
      ...current.savedMaterials.filter((item) => item.id !== material.id),
    ],
  }));
  publish(
    saved
      ? {
          feedback: material.text
            ? 'Material text saved on this device for offline reading.'
            : 'Link details saved. The source itself still needs internet.',
          error: '',
        }
      : {
          error:
            'The offline copy was not saved. Keep this page open and retry device save.',
        },
  );
}

export function removeOfflineCopy(id: string) {
  const saved = commitLearner((learner) => ({
    ...learner,
    savedMaterials: learner.savedMaterials.filter((item) => item.id !== id),
  }));
  publish(
    saved
      ? {
          feedback: 'Local material copy removed. Your private notes are kept.',
        }
      : { error: 'Local removal was not saved. Retry device save.' },
  );
}

export function useCircle(ready: boolean, online: boolean, circleId: string) {
  const wasOnline = useRef(online);
  const circle = useSyncExternalStore(
    (notify) => {
      subscribers.add(notify);
      return () => subscribers.delete(notify);
    },
    () => state,
    () => initial,
  );
  useEffect(() => {
    const reconnected = online && !wasOnline.current;
    wasOnline.current = online;
    if (!ready) return;
    if (online) {
      const learner = currentLearner();
      if (
        reconnected ||
        !state.loaded ||
        state.circle?.id !== circleId ||
        learner.materialOutbox.length ||
        learner.outbox.length
      ) {
        void syncCircle();
      }
    } else {
      const learner = currentLearner();
      const shelf =
        learner.shelf?.circle.id === circleId ? learner.shelf : null;
      publish({
        circle:
          shelf?.circle ??
          learner.circles.find((item) => item.id === circleId) ??
          null,
        materials:
          shelf?.materials ??
          learner.savedMaterials.filter((item) => item.circleId === circleId),
        posts: state.circle?.id === circleId ? state.posts : [],
        loaded: Boolean(shelf),
        alias: learner.participant
          ? `Learner ${learner.participant.slice(0, 6)}`
          : null,
      });
    }
  }, [ready, online, circleId]);
  return circle;
}
