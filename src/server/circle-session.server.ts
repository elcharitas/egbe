import {
  getCookie,
  getRequest,
  setCookie,
  setResponseHeader,
} from '@tanstack/react-start/server';
import { z } from 'zod';

const cookieName = 'egbe_circle';
const tokenSchema = z.string().regex(/^[0-9a-f]{64}$/);

export function circleRequestSecurity() {
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

export async function ownerFromToken(token: string) {
  const bytes = new TextEncoder().encode(token);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function validToken() {
  const value = getCookie(cookieName);
  if (value && !tokenSchema.safeParse(value).success) {
    throw new Error('Circle session invalid. Clear the cookie to join again.');
  }
  return value;
}

export async function optionalOwner() {
  const token = validToken();
  return token ? ownerFromToken(token) : null;
}

export async function currentOwner() {
  const token = validToken();
  if (!token) {
    throw new Error('Circle session missing. Open the circle to join again.');
  }
  return ownerFromToken(token);
}

export async function openOwner(secure: boolean) {
  let token = validToken();
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
  return ownerFromToken(token);
}

export function participant(owner: string) {
  return owner.slice(0, 16);
}

export function alias(owner: string) {
  return `Learner ${owner.slice(0, 6)}`;
}
