import { z } from 'zod';
import { directions, type Direction } from './catalog';
import { checkInSchema, directionSchema } from './check-in';
import {
  communityCircleId,
  materialSummarySchema,
  shareMaterialSchema,
  studyCircleSchema,
  studyMaterialSchema,
} from './study-circle';

const goalSchema = z.object({
  title: z.string().trim().min(1).max(120),
  minutes: z.number().int().min(5).max(60),
});
const goalDraftSchema = z.object({
  title: z.string().max(120),
  minutes: z.number().int().min(5).max(60),
});
const taskSchema = z.object({
  notes: z.string().max(4000),
  completed: z.boolean(),
});

export const studyStages = ['read', 'explain', 'discuss'] as const;
const materialWorkSchema = z.object({
  circleId: z.uuid().default(communityCircleId),
  goal: z.string().max(120),
  minutes: z.number().int().min(5).max(60),
  notes: z.string().max(4000),
  stage: z.enum(studyStages).default('read'),
  question: z.string().max(1000).default(''),
  completed: z.array(z.enum(studyStages)).max(3),
});

export const emptyMaterialDraft = {
  title: '',
  sourceUrl: '',
  attribution: '',
  text: '',
  permissionToShare: false,
};
const materialDraftSchema = z.object({
  title: z.string().max(120),
  sourceUrl: z.string().max(2000),
  attribution: z.string().max(160),
  text: z.string().max(12000),
  permissionToShare: z.boolean(),
});

export const learnerSchema = z.object({
  version: z.literal(1),
  direction: directionSchema,
  goals: z.object({
    web: goalSchema.nullable(),
    numbers: goalSchema.nullable(),
  }),
  goalDrafts: z.object({ web: goalDraftSchema, numbers: goalDraftSchema }),
  activeSteps: z
    .object({
      web: z.string().nullable(),
      numbers: z.string().nullable(),
    })
    .default({ web: null, numbers: null }),
  tasks: z.record(z.string(), taskSchema),
  savedResources: z.array(z.string()).max(100),
  checkInDraft: z.string().max(600),
  checkInCircleId: z.uuid().default(communityCircleId),
  participant: z.string().nullable(),
  outbox: z.array(checkInSchema).max(50),
  activeCircleId: z.uuid().default(communityCircleId),
  selectedMaterialId: z.uuid().nullable().default(null),
  checkInMaterialId: z.uuid().nullable().default(null),
  circles: z.array(studyCircleSchema).max(30).default([]),
  shelf: z
    .object({
      circle: studyCircleSchema,
      materials: z.array(materialSummarySchema).max(100),
      fetchedAt: z.number().int(),
    })
    .nullable()
    .default(null),
  materialDraft: materialDraftSchema.default(emptyMaterialDraft),
  materialDraftCircleId: z.uuid().default(communityCircleId),
  materialOutbox: z.array(shareMaterialSchema).max(10).default([]),
  savedMaterials: z.array(studyMaterialSchema).max(20).default([]),
  materialWork: z.record(z.uuid(), materialWorkSchema).default({}),
  circleDraft: z
    .object({
      id: z.uuid().nullable(),
      title: z.string().max(80),
      description: z.string().max(300),
      visibility: z.enum(['public', 'private']).default('private'),
    })
    .default({ id: null, title: '', description: '', visibility: 'private' }),
});

export type Learner = z.infer<typeof learnerSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type TaskProgress = z.infer<typeof taskSchema>;
export type MaterialWork = z.infer<typeof materialWorkSchema>;

export function emptyMaterialWork(circleId = communityCircleId): MaterialWork {
  return {
    circleId,
    goal: '',
    minutes: 10,
    notes: '',
    stage: 'read',
    question: '',
    completed: [],
  };
}

export function emptyLearner(): Learner {
  return {
    version: 1,
    direction: 'web',
    goals: { web: null, numbers: null },
    goalDrafts: {
      web: { title: directions.web.defaultGoal, minutes: 10 },
      numbers: { title: directions.numbers.defaultGoal, minutes: 10 },
    },
    activeSteps: { web: null, numbers: null },
    tasks: {},
    savedResources: [],
    checkInDraft: '',
    checkInCircleId: communityCircleId,
    participant: null,
    outbox: [],
    activeCircleId: communityCircleId,
    selectedMaterialId: null,
    checkInMaterialId: null,
    circles: [],
    shelf: null,
    materialDraft: { ...emptyMaterialDraft },
    materialDraftCircleId: communityCircleId,
    materialOutbox: [],
    savedMaterials: [],
    materialWork: {},
    circleDraft: {
      id: null,
      title: '',
      description: '',
      visibility: 'private',
    },
  };
}

export function parseGoal(direction: Direction, learner: Learner) {
  return goalSchema.safeParse(learner.goalDrafts[direction]);
}
