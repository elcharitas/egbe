import { z } from 'zod';

export const assistantExcerptLimit = 6000;
export const assistantQuestionLimit = 1000;

export const assistantInputSchema = z.object({
  id: z.uuid(),
  accountId: z.string().regex(/^[0-9a-f]{64}$/),
  materialId: z.uuid(),
  question: z
    .string()
    .trim()
    .min(1, 'Enter a study question.')
    .max(assistantQuestionLimit),
  excerpt: z
    .string()
    .trim()
    .min(1, 'Add an excerpt for the assistant.')
    .max(assistantExcerptLimit),
  confirmSharing: z.literal(true, {
    error: 'Review and confirm the excerpt and question before sending.',
  }),
});

export type AssistantInput = z.infer<typeof assistantInputSchema>;

export interface AssistanceRecord {
  id: string;
  materialId: string;
  question: string;
  excerpt: string;
  answer: string | null;
  status: 'pending' | 'complete' | 'failed';
  createdAt: number;
  error: string | null;
}

export interface AssistantSnapshot {
  configured: boolean;
  requests: AssistanceRecord[];
}
