import { z } from 'zod';

export const communityCircleId = '3ea517f0-1661-45d5-84bf-3797090dd75a';
export const circleInputSchema = z.object({
  circleId: z.uuid(),
});
export const createCircleSchema = z.object({
  id: z.uuid(),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().max(300),
  visibility: z.enum(['public', 'private']).default('public'),
});
export const materialInputSchema = z.object({ id: z.uuid() });

export const sourceUrlSchema = z
  .string()
  .trim()
  .max(2000)
  .refine((value) => {
    try {
      const url = new URL(value);
      return (
        ['https:', 'http:'].includes(url.protocol) &&
        !url.username &&
        !url.password
      );
    } catch {
      return false;
    }
  }, 'Use an http or https source link without embedded credentials.');

export const shareMaterialSchema = z
  .object({
    id: z.uuid(),
    participant: z.string().regex(/^[0-9a-f]{16}$/),
    circleId: z.uuid(),
    title: z.string().trim().min(1, 'Give the material a title.').max(120),
    sourceUrl: sourceUrlSchema.nullable(),
    attribution: z
      .string()
      .trim()
      .min(1, 'Credit the author, course, or source.')
      .max(160),
    text: z.string().trim().max(12000),
    permissionToShare: z.literal(true, {
      error:
        'Confirm that you have permission to share this material with the circle.',
    }),
  })
  .refine((material) => Boolean(material.sourceUrl || material.text), {
    message: 'Add a source link or some text to study.',
  });

export type PendingMaterial = z.infer<typeof shareMaterialSchema>;

export interface StudyCircle {
  id: string;
  title: string;
  description: string;
  visibility: 'public' | 'private';
  memberCount: number;
  materialCount: number;
  joined: boolean;
  mine: boolean;
  createdAt: number;
}

export interface MaterialSummary {
  id: string;
  circleId: string;
  title: string;
  sourceUrl: string | null;
  attribution: string;
  textLength: number;
  alias: string;
  mine: boolean;
  createdAt: number;
}

export interface StudyMaterial extends MaterialSummary {
  text: string;
}

export const studyCircleSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(80),
  description: z.string().max(300),
  visibility: z.enum(['public', 'private']).default('public'),
  memberCount: z.number().int().nonnegative(),
  materialCount: z.number().int().nonnegative(),
  joined: z.boolean(),
  mine: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export const materialSummarySchema = z.object({
  id: z.uuid(),
  circleId: z.uuid(),
  title: z.string().min(1).max(120),
  sourceUrl: sourceUrlSchema.nullable(),
  attribution: z.string().min(1).max(160),
  textLength: z.number().int().min(0).max(12000),
  alias: z.string().min(1).max(80),
  mine: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});

export const studyMaterialSchema = materialSummarySchema.extend({
  text: z.string().max(12000),
});
