import { z } from 'zod';

export const directionSchema = z.enum(['web', 'numbers']);
export const checkInSchema = z.object({
  id: z.uuid(),
  participant: z.string().regex(/^[0-9a-f]{16}$/),
  direction: directionSchema,
  message: z.string().trim().min(1).max(600),
});

export type PendingCheckIn = z.infer<typeof checkInSchema>;
