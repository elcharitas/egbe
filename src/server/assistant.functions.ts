import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import {
  assistantInputSchema,
  type AssistantInput,
  type AssistanceRecord,
  type AssistantSnapshot,
} from '../domain/study-assistant';
import { circleRequestSecurity, currentOwner } from './circle-session.server';
import { askProvider } from './assistant.server';
import { visibleMaterialRow } from './material-access.server';

const ownerSchema = z.string().regex(/^[0-9a-f]{64}$/);
const rowSchema = z.object({
  id: z.uuid(),
  account_id: ownerSchema,
  material_id: z.uuid(),
  payload_hash: ownerSchema,
  question: z.string(),
  excerpt: z.string(),
  answer: z.string().nullable(),
  status: z.enum(['pending', 'complete', 'failed']),
  created_at: z.number().int(),
  error: z.string().nullable(),
});
type AssistanceRow = z.infer<typeof rowSchema>;

function record(row: AssistanceRow): AssistanceRecord {
  return {
    id: row.id,
    materialId: row.material_id,
    question: row.question,
    excerpt: row.excerpt,
    answer: row.answer,
    status: row.status,
    createdAt: row.created_at,
    error: row.error,
  };
}

async function byId(id: string) {
  const row = await env.DB.prepare(
    'SELECT * FROM study_assistance WHERE id = ?',
  )
    .bind(id)
    .first();
  return row ? rowSchema.parse(row) : null;
}

async function hashInput(data: AssistantInput) {
  const payload = JSON.stringify([
    data.materialId,
    data.question,
    data.excerpt,
    data.confirmSharing,
  ]);
  const digest = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(payload)),
  );
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

export const readAssistance = createServerFn({ method: 'GET' })
  .validator((input: unknown) =>
    z.object({ materialId: z.uuid() }).parse(input),
  )
  .handler(async ({ data }): Promise<AssistantSnapshot> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const rows = await env.DB.prepare(
      `SELECT * FROM study_assistance
       WHERE account_id = ? AND material_id = ?
       ORDER BY created_at DESC, id DESC LIMIT 5`,
    )
      .bind(owner, data.materialId)
      .all();
    return {
      configured: Boolean(env.OPENAI_API_KEY?.trim()),
      requests: rows.results.map((row) => record(rowSchema.parse(row))),
    };
  });

export const recoverAssistance = createServerFn({ method: 'GET' })
  .validator((input: unknown) => z.object({ id: z.uuid() }).parse(input))
  .handler(async ({ data }): Promise<AssistanceRecord> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const stored = await byId(data.id);
    if (!stored || stored.account_id !== owner) {
      throw new Error('Assistant request not found.');
    }
    return record(stored);
  });

export const requestAssistance = createServerFn({ method: 'POST' })
  .validator((input: unknown) => assistantInputSchema.parse(input))
  .handler(async ({ data }): Promise<AssistanceRecord> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    if (data.accountId !== owner) {
      throw new Error(
        'Your account changed. Sign in to the original account before sending this question.',
      );
    }
    const payloadHash = await hashInput(data);
    const existing = await byId(data.id);
    if (existing) {
      if (
        existing.account_id !== owner ||
        existing.payload_hash !== payloadHash
      ) {
        throw new Error('This assistant request ID was already used.');
      }
      return record(existing);
    }

    const key = env.OPENAI_API_KEY?.trim();
    if (!key) throw new Error('Study assistant is not configured.');
    // The same material access rule used by readMaterial applies to new work.
    // Only metadata and the learner-confirmed excerpt go to the provider.
    const material = z
      .object({ title: z.string(), attribution: z.string() })
      .parse(await visibleMaterialRow(data.materialId, owner));
    const now = Date.now();
    const dayStart = Math.floor(now / 86_400_000) * 86_400_000;
    const result = await env.DB.prepare(
      `INSERT INTO study_assistance
       (id, account_id, material_id, payload_hash, question, excerpt,
        answer, status, created_at, error)
       SELECT ?, ?, ?, ?, ?, ?, NULL, 'pending', ?, NULL
       WHERE (SELECT COUNT(*) FROM study_assistance
              WHERE account_id = ? AND created_at >= ?) < 20
         AND (SELECT COUNT(*) FROM study_assistance
              WHERE created_at >= ?) < 100
         AND NOT EXISTS (
           SELECT 1 FROM study_assistance
           WHERE account_id = ? AND status = 'pending'
             AND created_at > ?)
         AND (SELECT COUNT(*) FROM study_assistance) < 10000
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        data.id,
        owner,
        data.materialId,
        payloadHash,
        data.question,
        data.excerpt,
        now,
        owner,
        dayStart,
        dayStart,
        owner,
        now - 90_000,
      )
      .run();
    if (result.meta.changes !== 1) {
      const raced = await byId(data.id);
      if (
        raced &&
        raced.account_id === owner &&
        raced.payload_hash === payloadHash
      ) {
        return record(raced);
      }
      throw new Error(
        'Assistant request unavailable: daily, recent, or total limit reached.',
      );
    }

    try {
      const answer = await askProvider(
        key,
        env.OPENAI_MODEL?.trim() || 'gpt-4.1-mini',
        material,
        data.excerpt,
        data.question,
      );
      const saved = await env.DB.prepare(
        `UPDATE study_assistance
         SET status = 'complete', answer = ?
         WHERE id = ? AND account_id = ? AND status = 'pending'`,
      )
        .bind(answer, data.id, owner)
        .run();
      if (saved.meta.changes !== 1) {
        throw new Error('Assistant result could not be saved.');
      }
    } catch {
      // Timeout/transport failures can still incur provider charges. Never
      // retry a reserved ID or expose provider errors and response bodies.
      await env.DB.prepare(
        `UPDATE study_assistance SET status = 'failed', error = ?
         WHERE id = ? AND account_id = ? AND status = 'pending'`,
      )
        .bind(
          'The assistant could not complete this request. It may count ' +
            'toward your daily limit; wait before starting a new request.',
          data.id,
          owner,
        )
        .run();
    }
    const stored = await byId(data.id);
    if (!stored || stored.account_id !== owner) {
      throw new Error('Assistant request could not be recovered.');
    }
    return record(stored);
  });
