import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { checkInSchema, directionSchema } from '../domain/check-in';
import {
  circleInputSchema,
  createCircleSchema,
  materialInputSchema,
  shareMaterialSchema,
  type MaterialSummary,
  type StudyCircle,
  type StudyMaterial,
} from '../domain/study-circle';
import {
  alias,
  circleRequestSecurity,
  currentOwner,
  participant,
} from './circle-session.server';

const ownerSchema = z.string().regex(/^[0-9a-f]{64}$/);
const inviteSchema = z.object({ token: z.string().regex(/^[0-9a-f]{64}$/) });
const removeSchema = z.object({ id: z.uuid() });
const postRowSchema = z.object({
  id: z.uuid(),
  owner: ownerSchema,
  circle_id: z.uuid(),
  material_id: z.uuid().nullable(),
  direction: directionSchema,
  message: z.string().min(1).max(600),
  created_at: z.number().int(),
  removed_at: z.number().int().nullable(),
});
const circleRowSchema = z.object({
  id: z.uuid(),
  owner: ownerSchema.nullable(),
  title: z.string().min(1).max(80),
  description: z.string().max(300),
  visibility: z.enum(['public', 'private']),
  created_at: z.number().int(),
  member_count: z.number().int().nonnegative(),
  material_count: z.number().int().nonnegative(),
  joined: z.number().int().min(0).max(1),
});
const materialRowSchema = z.object({
  id: z.uuid(),
  circle_id: z.uuid(),
  owner: ownerSchema,
  title: z.string().min(1).max(120),
  source_url: z.string().nullable(),
  attribution: z.string().min(1).max(160),
  text_length: z.number().int().nonnegative(),
  created_at: z.number().int(),
});
const storedMaterialSchema = materialRowSchema
  .omit({ text_length: true })
  .extend({
    text: z.string().max(12000),
    removed_at: z.number().int().nullable(),
  });

export type CirclePost = {
  id: string;
  circleId: string;
  materialId: string | null;
  direction: 'web' | 'numbers';
  message: string;
  createdAt: number;
  alias: string;
  mine: boolean;
};

export type CircleSnapshot = {
  participant: string | null;
  alias: string | null;
  posts: CirclePost[];
  circle: StudyCircle;
  materials: MaterialSummary[];
};

function toPost(value: unknown, viewer: string | null): CirclePost {
  const row = postRowSchema.parse(value);
  return {
    id: row.id,
    circleId: row.circle_id,
    materialId: row.material_id,
    direction: row.direction,
    message: row.message,
    createdAt: row.created_at,
    alias: alias(row.owner),
    mine: row.owner === viewer,
  };
}

function toCircle(value: unknown, viewer: string | null): StudyCircle {
  const row = circleRowSchema.parse(value);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    memberCount: row.member_count,
    materialCount: row.material_count,
    joined: row.joined === 1,
    mine: viewer !== null && row.owner === viewer,
    createdAt: row.created_at,
  };
}

function toMaterial(value: unknown, viewer: string | null): MaterialSummary {
  const row = materialRowSchema.parse(value);
  return {
    id: row.id,
    circleId: row.circle_id,
    title: row.title,
    sourceUrl: row.source_url,
    attribution: row.attribution,
    textLength: row.text_length,
    alias: alias(row.owner),
    mine: viewer !== null && row.owner === viewer,
    createdAt: row.created_at,
  };
}

const circleSelect = `
  SELECT c.id, c.owner, c.title, c.description, c.visibility, c.created_at,
    (SELECT COUNT(*) FROM circle_members WHERE circle_id = c.id)
      AS member_count,
    (SELECT COUNT(*) FROM study_materials
     WHERE circle_id = c.id AND removed_at IS NULL) AS material_count,
    EXISTS(SELECT 1 FROM circle_members
           WHERE circle_id = c.id AND owner = ?) AS joined
  FROM study_circles c`;

async function circleById(id: string, viewer: string) {
  const row = await env.DB.prepare(
    `${circleSelect} WHERE c.id = ? AND
     (c.visibility = 'public' OR EXISTS (
       SELECT 1 FROM circle_members
       WHERE circle_id = c.id AND owner = ?))`,
  )
    .bind(viewer, id, viewer)
    .first();
  if (!row) throw new Error('Circle not found.');
  return toCircle(row, viewer);
}

async function joinedCircle(id: string, viewer: string) {
  const circle = await circleById(id, viewer);
  if (!circle.joined) throw new Error('Join this circle before sharing.');
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

async function inviteHash(token: string) {
  return hex(
    new Uint8Array(
      await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token)),
    ),
  );
}

async function snapshot(
  circleId: string,
  viewer: string,
): Promise<CircleSnapshot> {
  const circle = await circleById(circleId, viewer);
  const [posts, materials] = await Promise.all([
    env.DB.prepare(
      `SELECT id, owner, circle_id, material_id, direction, message,
              created_at, removed_at
       FROM check_ins WHERE circle_id = ? AND removed_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 50`,
    )
      .bind(circleId)
      .all(),
    env.DB.prepare(
      `SELECT id, circle_id, owner, title, source_url, attribution,
              length(text) AS text_length, created_at
       FROM study_materials
       WHERE circle_id = ? AND removed_at IS NULL
       ORDER BY created_at DESC, id DESC LIMIT 100`,
    )
      .bind(circleId)
      .all(),
  ]);
  return {
    participant: participant(viewer),
    alias: alias(viewer),
    circle,
    posts: posts.results.map((row) => toPost(row, viewer)),
    materials: materials.results.map((row) => toMaterial(row, viewer)),
  };
}

export const listCircles = createServerFn({ method: 'GET' }).handler(
  async (): Promise<StudyCircle[]> => {
    circleRequestSecurity();
    const viewer = await currentOwner();
    const result = await env.DB.prepare(
      `${circleSelect} WHERE c.visibility = 'public' OR EXISTS (
        SELECT 1 FROM circle_members
        WHERE circle_id = c.id AND owner = ?)
       ORDER BY c.created_at DESC, c.id DESC LIMIT 30`,
    )
      .bind(viewer, viewer)
      .all();
    return result.results.map((row) => toCircle(row, viewer));
  },
);

export const readCircle = createServerFn({ method: 'GET' })
  .validator((input: unknown) => circleInputSchema.parse(input))
  .handler(async ({ data }): Promise<CircleSnapshot> => {
    circleRequestSecurity();
    return snapshot(data.circleId, await currentOwner());
  });

export const openCircle = createServerFn({ method: 'POST' })
  .validator((input: unknown) => circleInputSchema.parse(input))
  .handler(async ({ data }): Promise<CircleSnapshot> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    // Private circles must be joined through an invite, never by guessing an ID.
    await circleById(data.circleId, owner);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO circle_members (circle_id, owner, joined_at)
       SELECT id, ?, ? FROM study_circles
       WHERE id = ? AND visibility = 'public'
         AND (SELECT COUNT(*) FROM circle_members
              WHERE circle_id = ?) < 100`,
    )
      .bind(owner, Date.now(), data.circleId, data.circleId)
      .run();
    return snapshot(data.circleId, owner);
  });

export const createCircle = createServerFn({ method: 'POST' })
  .validator((input: unknown) => createCircleSchema.parse(input))
  .handler(async ({ data }): Promise<CircleSnapshot> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO study_circles
         (id, owner, title, description, visibility, created_at)
       SELECT ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM study_circles
              WHERE owner = ? AND created_at > ?) < 3
         AND (SELECT COUNT(*) FROM study_circles) < 100
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        data.id,
        owner,
        data.title,
        data.description,
        data.visibility,
        now,
        owner,
        now - 60 * 60 * 1000,
      )
      .run();
    const stored = await env.DB.prepare(
      `SELECT owner, title, description, visibility
       FROM study_circles WHERE id = ?`,
    )
      .bind(data.id)
      .first();
    if (!stored) {
      throw new Error('Circle limit reached: 3 per hour or 100 total.');
    }
    const existing = z
      .object({
        owner: ownerSchema.nullable(),
        title: z.string(),
        description: z.string(),
        visibility: z.enum(['public', 'private']),
      })
      .parse(stored);
    if (
      existing.owner !== owner ||
      existing.title !== data.title ||
      existing.description !== data.description ||
      existing.visibility !== data.visibility
    ) {
      throw new Error('This circle ID was already used for another circle.');
    }
    await env.DB.prepare(
      `INSERT OR IGNORE INTO circle_members (circle_id, owner, joined_at)
       VALUES (?, ?, ?)`,
    )
      .bind(data.id, owner, now)
      .run();
    return snapshot(data.id, owner);
  });

export const createCircleInvite = createServerFn({ method: 'POST' })
  .validator((input: unknown) => circleInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ token: string }> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const token = hex(crypto.getRandomValues(new Uint8Array(32)));
    const result = await env.DB.prepare(
      `UPDATE study_circles SET invite_hash = ?
       WHERE id = ? AND owner = ? AND visibility = 'private'
         AND EXISTS (SELECT 1 FROM circle_members
                     WHERE circle_id = study_circles.id AND owner = ?)`,
    )
      .bind(await inviteHash(token), data.circleId, owner, owner)
      .run();
    if (result.meta.changes !== 1) throw new Error('Circle not found.');
    return { token };
  });

export const joinPrivateCircle = createServerFn({ method: 'POST' })
  .validator((input: unknown) => inviteSchema.parse(input))
  .handler(async ({ data }): Promise<CircleSnapshot> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const hash = await inviteHash(data.token);
    await env.DB.prepare(
      `INSERT OR IGNORE INTO circle_members (circle_id, owner, joined_at)
       SELECT c.id, ?, ? FROM study_circles c
       WHERE c.visibility = 'private' AND c.invite_hash = ?
         AND ((SELECT COUNT(*) FROM circle_members
               WHERE circle_id = c.id) < 100
              OR EXISTS (SELECT 1 FROM circle_members
                         WHERE circle_id = c.id AND owner = ?))`,
    )
      .bind(owner, Date.now(), hash, owner)
      .run();
    // Do not disclose whether a token expired, was invalid, or hit a cap.
    const joined = await env.DB.prepare(
      `SELECT c.id FROM study_circles c
       JOIN circle_members m ON m.circle_id = c.id AND m.owner = ?
       WHERE c.visibility = 'private' AND c.invite_hash = ?`,
    )
      .bind(owner, hash)
      .first<{ id: string }>();
    if (!joined) throw new Error('Invite unavailable.');
    return snapshot(joined.id, owner);
  });

export const readMaterial = createServerFn({ method: 'GET' })
  .validator((input: unknown) => materialInputSchema.parse(input))
  .handler(async ({ data }): Promise<StudyMaterial> => {
    circleRequestSecurity();
    const viewer = await currentOwner();
    const stored = await env.DB.prepare(
      `SELECT m.id, m.circle_id, m.owner, m.title, m.source_url,
              m.attribution, m.text, m.created_at, m.removed_at
       FROM study_materials m
       JOIN study_circles c ON c.id = m.circle_id
       WHERE m.id = ? AND m.removed_at IS NULL
         AND (c.visibility = 'public' OR EXISTS (
           SELECT 1 FROM circle_members
           WHERE circle_id = c.id AND owner = ?))`,
    )
      .bind(data.id, viewer)
      .first();
    if (!stored) throw new Error('Material not found or removed.');
    const row = storedMaterialSchema.parse(stored);
    return {
      ...toMaterial(
        { ...row, text_length: Array.from(row.text).length },
        viewer,
      ),
      text: row.text,
    };
  });

export const shareMaterial = createServerFn({ method: 'POST' })
  .validator((input: unknown) => shareMaterialSchema.parse(input))
  .handler(async ({ data }): Promise<MaterialSummary> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    if (data.participant !== participant(owner)) {
      throw new Error(
        'Circle session changed. This material belongs to another session.',
      );
    }
    await joinedCircle(data.circleId, owner);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO study_materials
        (id, circle_id, owner, title, source_url, attribution, text, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM circle_members
                     WHERE circle_id = ? AND owner = ?)
         AND (SELECT COUNT(*) FROM study_materials
              WHERE owner = ? AND created_at > ?) < 5
         AND (SELECT COUNT(*) FROM study_materials
              WHERE circle_id = ?) < 100
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        data.id,
        data.circleId,
        owner,
        data.title,
        data.sourceUrl,
        data.attribution,
        data.text,
        now,
        data.circleId,
        owner,
        owner,
        now - 60 * 60 * 1000,
        data.circleId,
      )
      .run();
    const stored = await env.DB.prepare(
      `SELECT id, circle_id, owner, title, source_url, attribution, text,
              created_at, removed_at
       FROM study_materials WHERE id = ?`,
    )
      .bind(data.id)
      .first();
    if (!stored) {
      const circle = await circleById(data.circleId, owner);
      if (!circle.joined) throw new Error('Join this circle before sharing.');
      throw new Error('Material limit reached: 5 per hour or 100 per circle.');
    }
    const row = storedMaterialSchema.parse(stored);
    if (row.owner === owner && row.removed_at !== null) {
      throw new Error('This material was removed and cannot be reposted.');
    }
    if (
      row.owner !== owner ||
      row.circle_id !== data.circleId ||
      row.title !== data.title ||
      row.source_url !== data.sourceUrl ||
      row.attribution !== data.attribution ||
      row.text !== data.text
    ) {
      throw new Error(
        'This material ID was already used for another material.',
      );
    }
    return toMaterial(
      { ...row, text_length: Array.from(row.text).length },
      owner,
    );
  });

export const removeMaterial = createServerFn({ method: 'POST' })
  .validator((input: unknown) => materialInputSchema.parse(input))
  .handler(async ({ data }): Promise<{ id: string }> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const result = await env.DB.prepare(
      `UPDATE study_materials
       SET title = '[removed]', attribution = '[removed]',
           source_url = NULL, text = '', removed_at = ?
       WHERE id = ? AND owner = ? AND removed_at IS NULL
         AND EXISTS (SELECT 1 FROM circle_members
                     WHERE circle_id = study_materials.circle_id
                       AND owner = ?)`,
    )
      .bind(Date.now(), data.id, owner, owner)
      .run();
    if (result.meta.changes !== 1) {
      const removed = await env.DB.prepare(
        `SELECT id FROM study_materials
         WHERE id = ? AND owner = ? AND removed_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM circle_members
                       WHERE circle_id = study_materials.circle_id
                         AND owner = ?)`,
      )
        .bind(data.id, owner, owner)
        .first();
      if (!removed)
        throw new Error('Material not found or not yours to remove.');
    }
    return { id: data.id };
  });

export const shareCheckIn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => checkInSchema.parse(input))
  .handler(async ({ data }): Promise<CirclePost> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    if (data.participant !== participant(owner)) {
      throw new Error(
        'Circle session changed. This queued check-in belongs ' +
          'to another session.',
      );
    }

    await joinedCircle(data.circleId, owner);
    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO check_ins
        (id, owner, circle_id, material_id, direction, message, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE EXISTS (SELECT 1 FROM circle_members
                     WHERE circle_id = ? AND owner = ?)
         AND (? IS NULL OR EXISTS (
           SELECT 1 FROM study_materials
           WHERE id = ? AND circle_id = ? AND removed_at IS NULL))
         AND (SELECT COUNT(*) FROM check_ins
              WHERE owner = ? AND created_at > ?) < 10
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        data.id,
        owner,
        data.circleId,
        data.materialId,
        data.direction,
        data.message,
        now,
        data.circleId,
        owner,
        data.materialId,
        data.materialId,
        data.circleId,
        owner,
        now - 60 * 60 * 1000,
      )
      .run();

    const stored = await env.DB.prepare(
      `SELECT id, owner, circle_id, material_id, direction, message,
              created_at, removed_at
       FROM check_ins WHERE id = ?`,
    )
      .bind(data.id)
      .first();
    if (!stored) {
      const circle = await circleById(data.circleId, owner);
      if (!circle.joined) throw new Error('Join this circle before sharing.');
      if (data.materialId !== null) {
        const material = await env.DB.prepare(
          `SELECT id FROM study_materials
           WHERE id = ? AND circle_id = ? AND removed_at IS NULL`,
        )
          .bind(data.materialId, data.circleId)
          .first();
        if (!material) throw new Error('Material not found in this circle.');
      }
      throw new Error(
        'Circle limit reached: 10 check-ins per hour. Try later.',
      );
    }
    const row = postRowSchema.parse(stored);
    if (row.owner === owner && row.removed_at !== null) {
      throw new Error(
        'This check-in was removed. Cancel its waiting copy; ' +
          'it will not be reposted.',
      );
    }
    if (
      row.owner !== owner ||
      row.circle_id !== data.circleId ||
      row.material_id !== data.materialId ||
      row.direction !== data.direction ||
      row.message !== data.message
    ) {
      throw new Error(
        'This check-in ID was already used for a different post.',
      );
    }
    return toPost(row, owner);
  });

export const removeCheckIn = createServerFn({ method: 'POST' })
  .validator((input: unknown) => removeSchema.parse(input))
  .handler(async ({ data }): Promise<{ id: string }> => {
    circleRequestSecurity();
    const owner = await currentOwner();
    const result = await env.DB.prepare(
      `UPDATE check_ins SET message = '[removed]', removed_at = ?
       WHERE id = ? AND owner = ? AND removed_at IS NULL
         AND EXISTS (SELECT 1 FROM circle_members
                     WHERE circle_id = check_ins.circle_id
                       AND owner = ?)`,
    )
      .bind(Date.now(), data.id, owner, owner)
      .run();
    if (result.meta.changes !== 1) {
      const removed = await env.DB.prepare(
        `SELECT id FROM check_ins
         WHERE id = ? AND owner = ? AND removed_at IS NOT NULL
           AND EXISTS (SELECT 1 FROM circle_members
                       WHERE circle_id = check_ins.circle_id
                         AND owner = ?)`,
      )
        .bind(data.id, owner, owner)
        .first();
      if (!removed)
        throw new Error('Check-in not found or not yours to remove.');
    }
    return { id: data.id };
  });
