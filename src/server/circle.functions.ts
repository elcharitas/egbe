import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import {
  getCookie,
  getRequest,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server';
import { z } from 'zod';
import { checkInSchema, directionSchema } from '../domain/check-in';

const cookieName = 'egbe_circle';
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ownerSchema = z.string().regex(/^[0-9a-f]{64}$/);
const removeSchema = z.object({ id: z.uuid() });
const rowSchema = z.object({
  id: z.uuid(),
  owner: ownerSchema,
  direction: directionSchema,
  message: z.string().min(1).max(600),
  created_at: z.number().int(),
  removed_at: z.number().int().nullable(),
});

export type CirclePost = {
  id: string;
  direction: 'web' | 'numbers';
  message: string;
  createdAt: number;
  alias: string;
  mine: boolean;
};

export type CircleSnapshot = {
  participant: string;
  alias: string;
  posts: CirclePost[];
};

function circleRequestSecurity() {
  setResponseHeader('Cache-Control', 'private, no-store');
  const url = new URL(getRequest().url);
  if (url.protocol === 'https:') return true;
  if (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  ) {
    return false;
  }
  throw new Error('The circle requires HTTPS outside local development.');
}

async function ownerFromToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function existingToken() {
  const value = getCookie(cookieName);
  if (!value) {
    throw new Error('Circle session missing. Open the circle to join again.');
  }
  if (!tokenSchema.safeParse(value).success) {
    throw new Error('Circle session invalid. Clear the cookie to join again.');
  }
  return value;
}

async function currentOwner() {
  return ownerFromToken(existingToken());
}

function participant(owner: string) {
  return owner.slice(0, 16);
}

function alias(owner: string) {
  return `Learner ${owner.slice(0, 6)}`;
}

function toPost(value: unknown, viewer: string): CirclePost {
  const row = rowSchema.parse(value);
  return {
    id: row.id,
    direction: row.direction,
    message: row.message,
    createdAt: row.created_at,
    alias: alias(row.owner),
    mine: row.owner === viewer,
  };
}

async function snapshot(owner: string): Promise<CircleSnapshot> {
  const result = await env.DB.prepare(
    `SELECT id, owner, direction, message, created_at, removed_at
     FROM check_ins WHERE removed_at IS NULL
     ORDER BY created_at DESC, id DESC LIMIT 50`,
  ).all();
  return {
    participant: participant(owner),
    alias: alias(owner),
    posts: result.results.map((row) => toPost(row, owner)),
  };
}

export const openCircle = createServerFn({ method: 'POST' }).handler(
  async (): Promise<CircleSnapshot> => {
    const secure = circleRequestSecurity();

    let token = getCookie(cookieName);
    if (token && !tokenSchema.safeParse(token).success) {
      throw new Error(
        'Circle session invalid. Clear the cookie to join again.',
      );
    }
    if (!token) {
      token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
        byte.toString(16).padStart(2, '0'),
      ).join('');
      setCookie(cookieName, token, {
        httpOnly: true,
        sameSite: 'strict',
        secure,
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return snapshot(await ownerFromToken(token));
  },
);

export const readCircle = createServerFn({ method: 'GET' }).handler(
  async (): Promise<CircleSnapshot> => {
    circleRequestSecurity();
    return snapshot(await currentOwner());
  },
);

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

    const now = Date.now();
    await env.DB.prepare(
      `INSERT INTO check_ins (id, owner, direction, message, created_at)
       SELECT ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM check_ins
              WHERE owner = ? AND created_at > ?) < 10
       ON CONFLICT(id) DO NOTHING`,
    )
      .bind(
        data.id,
        owner,
        data.direction,
        data.message,
        now,
        owner,
        now - 60 * 60 * 1000,
      )
      .run();

    const stored = await env.DB.prepare(
      `SELECT id, owner, direction, message, created_at, removed_at
       FROM check_ins WHERE id = ?`,
    )
      .bind(data.id)
      .first();
    if (!stored) {
      throw new Error(
        'Circle limit reached: 10 check-ins per hour. Try later.',
      );
    }
    const row = rowSchema.parse(stored);
    if (row.owner === owner && row.removed_at !== null) {
      throw new Error(
        'This check-in was removed. Cancel its waiting copy; ' +
          'it will not be reposted.',
      );
    }
    if (
      row.owner !== owner ||
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
       WHERE id = ? AND owner = ? AND removed_at IS NULL`,
    )
      .bind(Date.now(), data.id, owner)
      .run();
    if (result.meta.changes !== 1) {
      const removed = await env.DB.prepare(
        `SELECT id FROM check_ins
         WHERE id = ? AND owner = ? AND removed_at IS NOT NULL`,
      )
        .bind(data.id, owner)
        .first();
      if (!removed)
        throw new Error('Check-in not found or not yours to remove.');
    }
    return { id: data.id };
  });
