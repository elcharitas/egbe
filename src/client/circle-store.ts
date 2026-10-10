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
  createCircleInvite,
  joinPrivateCircle,
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
  accountSaveStatus,
  removeWaitingCheckIn,
  removeWaitingMaterial,
  retryAccountSave,
  updateCircleDirectory,
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
let circleRead = 0;
const subscribers = new Set<() => void>();

function publish(change: Partial<CircleState>) {
  state = { ...state, ...change };
  if (change.error) state.feedback = '';
  for (const notify of subscribers) notify();
}

export function clearCircleWork() {
  materialRead++;
  circleRead++;
  publish(initial);
}

function failureMessage(error: unknown) {
  if (error instanceof TypeError) {
    return (
      'The connection failed. Unsaved work remains only in this page. ' +
      'Keep it open and retry when connected.'
    );
  }
  return error instanceof Error
    ? error.message
    : 'The circle could not be reached.';
}

async function rememberCircle(result: CircleSnapshot, circles: StudyCircle[]) {
  const learner = currentLearner();
  const waiting = learner.outbox.length + learner.materialOutbox.length;
  if (
    learner.participant &&
    learner.participant !== result.participant &&
    waiting
  ) {
    throw new Error(
      'Your account changed. Waiting contributions were not shared. ' +
        'Sign in to the original account before retrying.',
    );
  }
  updateCircleDirectory(
    [
      result.circle,
      ...circles.filter((item) => item.id !== result.circle.id),
    ].slice(0, 30),
    {
      circle: result.circle,
      materials: result.materials,
      fetchedAt: Date.now(),
    },
  );
  publish({
    circle: result.circle,
    materials: result.materials,
    posts: result.posts,
    alias: result.alias,
    loaded: true,
  });
  return retryAccountSave();
}

async function flushContributions() {
  while (
    currentLearner().materialOutbox.length ||
    currentLearner().outbox.length
  ) {
    await flushOutbox<MaterialSummary, PendingMaterial>(
      {
        read: () => currentLearner().materialOutbox,
        acknowledge: async (id, material) => {
          if (!(await removeWaitingMaterial(id))) {
            throw new Error(
              'The circle received your material, but your account could not ' +
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
        acknowledge: async (id, post) => {
          if (!(await removeWaitingCheckIn(id))) {
            throw new Error(
              'The circle received your check-in, but your account could not ' +
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
  if (join && !(await retryAccountSave())) {
    publish({ error: 'Retry the account save before joining or sharing.' });
    return false;
  }
  const circleId = currentLearner().activeCircleId;
  const request = ++circleRead;
  publish({ busy: true, error: '', feedback: '' });
  try {
    const result = await circleRequest((signal) =>
      join
        ? openCircle({ data: { circleId }, signal })
        : readCircle({ data: { circleId }, signal }),
    );
    const circles = await circleRequest((signal) => listCircles({ signal }));
    if (request !== circleRead) return false;
    const saved = await rememberCircle(result, circles);
    if (saved && result.participant && accountSaveStatus() === 'saved') {
      await flushContributions();
    }
    if (!state.feedback)
      publish({ feedback: 'Circle refreshed. No automatic polling.' });
    return true;
  } catch (error) {
    if (request === circleRead) publish({ error: failureMessage(error) });
    return false;
  } finally {
    if (request === circleRead) publish({ busy: false });
  }
}

export async function makeCircleInvitation(circleId: string) {
  if (state.busy || !navigator.onLine) return null;
  publish({ busy: true, error: '' });
  try {
    const { token } = await circleRequest((signal) =>
      createCircleInvite({ data: { circleId }, signal }),
    );
    return `${location.origin}/#invite=${token}`;
  } catch (error) {
    publish({ error: failureMessage(error) });
    return null;
  } finally {
    publish({ busy: false });
  }
}

export async function acceptCircleInvitation(token: string) {
  if (state.busy || !navigator.onLine || !(await retryAccountSave()))
    return false;
  publish({ busy: true, error: '' });
  try {
    const result = await circleRequest((signal) =>
      joinPrivateCircle({ data: { token }, signal }),
    );
    if (
      !(await commitLearner((learner) => ({
        ...learner,
        activeCircleId: result.circle.id,
        selectedMaterialId: null,
      })))
    ) {
      throw new Error(
        'Membership was added. Retry account save before continuing.',
      );
    }
    const circles = await circleRequest((signal) => listCircles({ signal }));
    await rememberCircle(result, circles);
    publish({ feedback: 'You joined this private circle.' });
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
  if (circleId === currentLearner().activeCircleId) {
    if (!state.loaded) void syncCircle();
    return;
  }
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
  void syncCircle();
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
    publish({ error: 'Sign in before creating a circle.' });
    return false;
  }
  if (
    !(await commitLearner((current) => ({
      ...current,
      circleDraft: { ...current.circleDraft, id },
    })))
  ) {
    publish({
      error: 'Save the circle draft to your account before creating it.',
    });
    return false;
  }
  publish({ busy: true, error: '', feedback: '' });
  try {
    const result = await circleRequest((signal) =>
      createCircle({ data: parsed.data, signal }),
    );
    const saved = await commitLearner((current) => ({
      ...current,
      activeCircleId: result.circle.id,
      selectedMaterialId: null,
      circleDraft: {
        id: null,
        title: '',
        description: '',
        visibility: 'private',
      },
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
          'Keep this page open and retry account save; the draft retains its retry ID.',
      );
    updateCircleDirectory(
      [
        result.circle,
        ...currentLearner().circles.filter(
          (item) => item.id !== result.circle.id,
        ),
      ].slice(0, 30),
      {
        circle: result.circle,
        materials: result.materials,
        fetchedAt: Date.now(),
      },
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

export async function queueMaterial() {
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
  publish({ busy: true, error: '' });
  const saved = await commitLearner((current) => ({
    ...current,
    materialDraft: { ...emptyMaterialDraft },
    materialOutbox: [...current.materialOutbox, parsed.data],
  }));
  publish({ busy: false });
  if (!saved) {
    publish({
      error:
        'The material was not safely saved. Your draft is kept; retry account save.',
    });
    return false;
  }
  publish({
    error: '',
    feedback: 'Material saved to your account, waiting to share.',
  });
  if (navigator.onLine) void syncCircle();
  return true;
}

export async function queueCheckIn() {
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
  publish({ busy: true, error: '' });
  const saved = await commitLearner((current) => ({
    ...current,
    checkInDraft: '',
    outbox: [...current.outbox, parsed.data],
  }));
  publish({ busy: false });
  publish({
    error: saved
      ? ''
      : 'Account save failed. Your draft is kept; retry account save.',
    feedback: saved ? 'Check-in saved to your account, waiting to share.' : '',
  });
  if (saved && navigator.onLine) void syncCircle();
}

export async function cancelContribution(
  id: string,
  kind: 'material' | 'check-in',
) {
  if (state.busy) return;
  publish({ busy: true, error: '' });
  const saved = await (kind === 'material'
    ? removeWaitingMaterial(id)
    : removeWaitingCheckIn(id));
  publish({ busy: false });
  publish(
    saved
      ? {
          error: '',
          feedback: 'Waiting contribution cancelled in your account.',
        }
      : {
          error:
            'Cancellation is not confirmed. Its retry ID is kept. Retry account save before reloading.',
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
      feedback: 'Your contribution was removed from the circle.',
    });
  } catch (error) {
    publish({ error: failureMessage(error) });
  } finally {
    publish({ busy: false });
  }
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
          'Reconnect to open this material. Unsaved work remains only in this page.',
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

export async function saveMaterialToAccount() {
  if (!state.material) return;
  const material = state.material;
  const learner = currentLearner();
  if (
    !learner.savedMaterials.some((item) => item.id === material.id) &&
    learner.savedMaterials.length >= 20
  ) {
    publish({
      error:
        'Twenty materials are saved. Remove an account copy before saving another.',
    });
    return;
  }
  const saved = await commitLearner((current) => ({
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
            ? 'Material text saved in your account.'
            : 'Link details saved. The source itself still needs internet.',
          error: '',
        }
      : {
          error:
            'The account copy was not saved. Keep this page open and retry account save.',
        },
  );
}

export async function removeAccountCopy(id: string) {
  const saved = await commitLearner((learner) => ({
    ...learner,
    savedMaterials: learner.savedMaterials.filter((item) => item.id !== id),
  }));
  publish(
    saved
      ? {
          feedback:
            'Account material copy removed. Your private notes are kept.',
        }
      : { error: 'Account removal was not saved. Retry account save.' },
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
    if (!ready) {
      clearCircleWork();
      return;
    }
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
  return ready ? circle : initial;
}
