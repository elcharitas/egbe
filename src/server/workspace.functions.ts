import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { setResponseHeader } from '@tanstack/react-start/server';
import { z } from 'zod';
import { emptyLearner, learnerSchema } from '../domain/learner';
import { currentAccount } from './google';
import { requireSameOrigin } from './request-security';

const saveSchema = z.object({
  learner: learnerSchema,
  revision: z.number().int().nonnegative(),
  mutationId: z.uuid(),
});
const rowSchema = z.object({
  data: z.string(),
  revision: z.number().int().nonnegative(),
  mutation_id: z.string().nullable(),
});

export const readWorkspace = createServerFn({ method: 'GET' }).handler(
  async () => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const account = await currentAccount();
    const result = await env.DB.prepare(
      'SELECT data, revision, mutation_id FROM learner_workspaces WHERE account_id = ?',
    )
      .bind(account.id)
      .first();
    const learner = result
      ? learnerSchema.parse(JSON.parse(rowSchema.parse(result).data))
      : emptyLearner();
    return {
      learner: { ...learner, participant: account.id.slice(0, 16) },
      revision: result ? rowSchema.parse(result).revision : 0,
    };
  },
);

export const saveWorkspace = createServerFn({ method: 'POST' })
  .validator((input: unknown) => saveSchema.parse(input))
  .handler(async ({ data }) => {
    requireSameOrigin();
    setResponseHeader('Cache-Control', 'private, no-store');
    const account = await currentAccount();
    if (
      data.learner.participant !== account.id.slice(0, 16) ||
      [...data.learner.outbox, ...data.learner.materialOutbox].some(
        (entry) => entry.participant !== account.id.slice(0, 16),
      )
    ) {
      throw new Error('This work belongs to a different account.');
    }
    const serialized = JSON.stringify({
      ...data.learner,
      circles: [],
      shelf: null,
    });
    if (new TextEncoder().encode(serialized).length > 512 * 1024) {
      throw new Error(
        'Account workspace is full. Export work before removing it.',
      );
    }
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO learner_workspaces
       (account_id, data, revision, mutation_id, updated_at)
       SELECT ?, ?, 1, ?, ? WHERE ? = 0
       ON CONFLICT(account_id) DO NOTHING`,
    )
      .bind(account.id, serialized, data.mutationId, now, data.revision)
      .run();
    await env.DB.prepare(
      `UPDATE learner_workspaces
       SET data = ?, revision = revision + 1, mutation_id = ?, updated_at = ?
       WHERE account_id = ? AND revision = ? AND mutation_id IS NOT ?`,
    )
      .bind(
        serialized,
        data.mutationId,
        now,
        account.id,
        data.revision,
        data.mutationId,
      )
      .run();
    const stored = rowSchema.parse(
      await env.DB.prepare(
        'SELECT data, revision, mutation_id FROM learner_workspaces WHERE account_id = ?',
      )
        .bind(account.id)
        .first(),
    );
    if (stored.mutation_id !== data.mutationId || stored.data !== serialized) {
      throw new Error(
        'Account work changed in another tab or device. Export this page before reloading.',
      );
    }
    return { revision: stored.revision };
  });
