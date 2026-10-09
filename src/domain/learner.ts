import { z } from 'zod';
import { directions, type Direction } from './catalog';
import { checkInSchema, directionSchema } from './check-in';

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
  participant: z.string().nullable(),
  outbox: z.array(checkInSchema).max(50),
});

export type Learner = z.infer<typeof learnerSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type TaskProgress = z.infer<typeof taskSchema>;

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
    participant: null,
    outbox: [],
  };
}

export function parseGoal(direction: Direction, learner: Learner) {
  return goalSchema.safeParse(learner.goalDrafts[direction]);
}
