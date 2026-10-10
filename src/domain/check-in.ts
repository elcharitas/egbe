import { z } from 'zod';
import { communityCircleId } from './study-circle';

export const directionSchema = z.enum(['web', 'numbers']);
export const checkInSchema = z.object({
  id: z.uuid(),
  participant: z.string().regex(/^[0-9a-f]{16}$/),
  circleId: z.uuid().default(communityCircleId),
  materialId: z.uuid().nullable().default(null),
  direction: directionSchema,
  message: z.string().trim().min(1).max(600),
});

export type PendingCheckIn = z.infer<typeof checkInSchema>;
