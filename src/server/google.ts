import { env } from 'cloudflare:workers';
import {
  getCookie,
  getRequest,
  setResponseHeader,
} from '@tanstack/react-start/server';
import { createLocalJWKSet, jwtVerify } from 'jose';
import { requireSameOrigin, secureOrigin } from './request-security';

export type Account = { id: string; displayName: string | null };

const sessionCookie = 'egbe_auth';
const flowCookie = 'egbe_google_flow';
const returnCookie = 'egbe_google_return';
const hexToken = /^[0-9a-f]{64}$/;
const codePattern = /^[\x21-\x7e]{1,4096}$/;
const issuer = 'https://accounts.google.com';
const discoveryURL = `${issuer}/.well-known/openid-configuration`;
const authorizationURL = `${issuer}/o/oauth2/v2/auth`;
const tokenURL = 'https://oauth2.googleapis.com/token';
const jwksURL = 'https://www.googleapis.com/oauth2/v3/certs';
const flowLifetime = 10 * 60 * 1000;
const sessionLifetime = 30 * 24 * 60 * 60 * 1000;

function randomHex() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

async function sha256(value: string) {
  const bytes = new Uint8Array(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)),
  );
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join(
    '',
  );
}

function cookieValue(header: string | null, name: string) {
  const item = header
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  const value = item?.slice(name.length + 1);
  return value && hexToken.test(value) ? value : null;
}

function cookie(name: string, value: string, secure: boolean, maxAge: number) {
  return (
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; ` +
    `${secure ? 'Secure; ' : ''}Max-Age=${maxAge}`
  );
}

function callbackURL(url: URL) {
  secureOrigin(url);
  const expected = `${url.origin}/auth/google/callback`;
  if (env.GOOGLE_REDIRECT_URI !== expected) return null;
  if (!env.GOOGLE_CLIENT_ID?.trim() || !env.GOOGLE_CLIENT_SECRET?.trim()) {
    return null;
  }
  return expected;
}

export function configured(url: URL) {
  return callbackURL(url) !== null;
}

export function authResponse(
  url: URL,
  result: 'success' | 'failure' | 'unavailable',
  clearFlow = false,
  session?: string,
  invite?: string | null,
) {
  const target = new URL('/', url.origin);
  target.searchParams.set('auth', result);
  target.hash =
    invite && hexToken.test(invite) ? `invite=${invite}` : 'materials';
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    Location: target.href,
    'Referrer-Policy': 'no-referrer',
  });
  const secure = secureOrigin(url);
  if (clearFlow)
    headers.append('Set-Cookie', cookie(flowCookie, '', secure, 0));
  headers.append('Set-Cookie', cookie(returnCookie, '', secure, 0));
  if (session) {
    headers.append(
      'Set-Cookie',
      cookie(sessionCookie, session, secure, sessionLifetime / 1000),
    );
  }
  return new Response(null, { status: 303, headers });
}

async function boundedJSON(url: string, init?: RequestInit, limit = 65536) {
  const response = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(5000),
    // Workers supports manual redirect handling, not redirect: 'error'.
    // A redirect is rejected by the response.ok check below.
    redirect: 'manual',
    headers: {
      Accept: 'application/json',
      ...init?.headers,
    },
  });
  if (!response.ok || !response.body) {
    throw new Error('Google sign-in provider is unavailable.');
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error('Google response is too large.');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(body),
  ) as unknown;
}

async function googleEndpoints() {
  const discovery = await boundedJSON(discoveryURL);
  if (
    !discovery ||
    typeof discovery !== 'object' ||
    !('issuer' in discovery) ||
    discovery.issuer !== issuer ||
    !('authorization_endpoint' in discovery) ||
    discovery.authorization_endpoint !== authorizationURL ||
    !('token_endpoint' in discovery) ||
    discovery.token_endpoint !== tokenURL ||
    !('jwks_uri' in discovery) ||
    discovery.jwks_uri !== jwksURL
  ) {
    throw new Error('Google OIDC discovery did not match official endpoints.');
  }
}

async function prune() {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare(
      `DELETE FROM oauth_transactions WHERE state_hash IN
       (SELECT state_hash FROM oauth_transactions
        WHERE expires_at <= ? LIMIT 100)`,
    ).bind(now),
    env.DB.prepare(
      `DELETE FROM auth_sessions WHERE session_hash IN
       (SELECT session_hash FROM auth_sessions
        WHERE expires_at <= ? LIMIT 100)`,
    ).bind(now),
  ]);
}

export async function startGoogle(request: Request) {
  const url = new URL(request.url);
  const redirectURI = callbackURL(url);
  const invite = cookieValue(request.headers.get('cookie'), returnCookie);
  if (!redirectURI)
    return authResponse(url, 'unavailable', false, undefined, invite);
  await googleEndpoints();
  await prune();

  const state = randomHex();
  const browser = randomHex();
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(32)));
  const nonce = randomHex();
  const result = await env.DB.prepare(
    `INSERT INTO oauth_transactions
      (state_hash, browser_hash, verifier, nonce, redirect_uri, expires_at,
       return_invite_hash)
     SELECT ?, ?, ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM oauth_transactions) < 1000`,
  )
    .bind(
      await sha256(state),
      await sha256(browser),
      verifier,
      nonce,
      redirectURI,
      Date.now() + flowLifetime,
      invite ? await sha256(invite) : null,
    )
    .run();
  if (result.meta.changes !== 1) throw new Error('Sign-in is busy.');

  const authorization = new URL(authorizationURL);
  authorization.searchParams.set('client_id', env.GOOGLE_CLIENT_ID!);
  authorization.searchParams.set('redirect_uri', redirectURI);
  authorization.searchParams.set('response_type', 'code');
  authorization.searchParams.set('scope', 'openid profile');
  authorization.searchParams.set('state', state);
  authorization.searchParams.set('nonce', nonce);
  authorization.searchParams.set('code_challenge_method', 'S256');
  authorization.searchParams.set(
    'code_challenge',
    base64url(
      new Uint8Array(
        await crypto.subtle.digest(
          'SHA-256',
          new TextEncoder().encode(verifier),
        ),
      ),
    ),
  );
  const headers = new Headers({
    'Cache-Control': 'private, no-store',
    Location: authorization.href,
    'Referrer-Policy': 'no-referrer',
  });
  headers.append(
    'Set-Cookie',
    cookie(flowCookie, browser, secureOrigin(url), flowLifetime / 1000),
  );
  return new Response(null, { status: 303, headers });
}

export async function finishGoogle(request: Request) {
  const url = new URL(request.url);
  const redirectURI = callbackURL(url);
  if (!redirectURI) return authResponse(url, 'unavailable', true);
  const state = url.searchParams.get('state');
  const browser = cookieValue(request.headers.get('cookie'), flowCookie);
  if (
    url.searchParams.getAll('state').length !== 1 ||
    !state ||
    !hexToken.test(state) ||
    !browser
  ) {
    return authResponse(url, 'failure', true);
  }

  // DELETE RETURNING is atomic: a concurrent callback cannot reuse this flow.
  // Consume even a denied or malformed authorization response.
  const transaction = await env.DB.prepare(
    `DELETE FROM oauth_transactions
     WHERE state_hash = ? AND browser_hash = ? AND redirect_uri = ?
       AND expires_at > ?
     RETURNING verifier, nonce, return_invite_hash`,
  )
    .bind(await sha256(state), await sha256(browser), redirectURI, Date.now())
    .first<{
      verifier: string;
      nonce: string;
      return_invite_hash: string | null;
    }>();
  if (!transaction) return authResponse(url, 'failure', true);
  const pendingInvite = cookieValue(
    request.headers.get('cookie'),
    returnCookie,
  );
  const invite =
    pendingInvite &&
    (await sha256(pendingInvite)) === transaction.return_invite_hash
      ? pendingInvite
      : null;
  const code = url.searchParams.get('code');
  if (
    url.searchParams.has('error') ||
    url.searchParams.getAll('code').length !== 1 ||
    (url.searchParams.has('iss') && url.searchParams.get('iss') !== issuer) ||
    !code ||
    !codePattern.test(code)
  ) {
    return authResponse(url, 'failure', true, undefined, invite);
  }
  await googleEndpoints();
  const tokens = await boundedJSON(
    tokenURL,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        client_id: env.GOOGLE_CLIENT_ID!,
        client_secret: env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: redirectURI,
        code_verifier: transaction.verifier,
      }),
    },
    32768,
  );
  if (
    !tokens ||
    typeof tokens !== 'object' ||
    !('id_token' in tokens) ||
    typeof tokens.id_token !== 'string' ||
    tokens.id_token.length > 16000
  ) {
    throw new Error('Google did not return a valid identity token.');
  }
  const jwks = await boundedJSON(jwksURL);
  if (
    !jwks ||
    typeof jwks !== 'object' ||
    !('keys' in jwks) ||
    !Array.isArray(jwks.keys) ||
    jwks.keys.length > 20
  ) {
    throw new Error('Google signing keys are unavailable.');
  }
  const { payload } = await jwtVerify(
    tokens.id_token,
    createLocalJWKSet(jwks as { keys: Array<import('jose').JWK> }),
    {
      issuer: [issuer, 'accounts.google.com'],
      audience: env.GOOGLE_CLIENT_ID!,
      algorithms: ['RS256'],
      clockTolerance: 10,
    },
  );
  if (
    !payload.exp ||
    !payload.iat ||
    payload.iat > Math.floor(Date.now() / 1000) + 10 ||
    payload.nonce !== transaction.nonce ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255 ||
    (payload.azp !== undefined && payload.azp !== env.GOOGLE_CLIENT_ID) ||
    (Array.isArray(payload.aud) &&
      payload.aud.length > 1 &&
      payload.azp !== env.GOOGLE_CLIENT_ID)
  ) {
    throw new Error('Google identity token claims did not match sign-in.');
  }
  await prune();
  const displayName =
    typeof payload.name === 'string'
      ? payload.name.trim().slice(0, 80) || null
      : null;
  const now = Date.now();
  const accountID = randomHex();
  await env.DB.prepare(
    `INSERT INTO auth_accounts (id, issuer, subject, display_name, created_at)
     SELECT ?, ?, ?, ?, ?
     WHERE (SELECT COUNT(*) FROM auth_accounts) < 10000
     ON CONFLICT(issuer, subject) DO NOTHING`,
  )
    .bind(accountID, issuer, payload.sub, displayName, now)
    .run();
  const account = await env.DB.prepare(
    `SELECT id FROM auth_accounts WHERE issuer = ? AND subject = ?`,
  )
    .bind(issuer, payload.sub)
    .first<{ id: string }>();
  if (!account) throw new Error('Account limit reached.');
  await env.DB.prepare(`UPDATE auth_accounts SET display_name = ? WHERE id = ?`)
    .bind(displayName, account.id)
    .run();
  // New devices can sign in without leaving unlimited dormant sessions.
  await env.DB.prepare(
    `DELETE FROM auth_sessions
     WHERE session_hash IN (
       SELECT session_hash FROM auth_sessions
       WHERE account_id = ? ORDER BY expires_at ASC LIMIT 1
     ) AND (SELECT COUNT(*) FROM auth_sessions WHERE account_id = ?) >= 10`,
  )
    .bind(account.id, account.id)
    .run();
  const session = randomHex();
  const issued = await env.DB.prepare(
    `INSERT INTO auth_sessions (session_hash, account_id, expires_at)
     SELECT ?, ?, ?
     WHERE (SELECT COUNT(*) FROM auth_sessions WHERE account_id = ?) < 10
       AND (SELECT COUNT(*) FROM auth_sessions) < 100000`,
  )
    .bind(await sha256(session), account.id, now + sessionLifetime, account.id)
    .run();
  if (issued.meta.changes !== 1) throw new Error('Session limit reached.');
  return authResponse(url, 'success', true, session, invite);
}

export function prepareGoogleReturn(invite: string | null) {
  requireSameOrigin();
  const url = new URL(getRequest().url);
  setResponseHeader('Cache-Control', 'private, no-store');
  setResponseHeader(
    'Set-Cookie',
    cookie(returnCookie, invite ?? '', secureOrigin(url), invite ? 600 : 0),
  );
}

export async function optionalAccount(): Promise<Account | null> {
  setResponseHeader('Cache-Control', 'private, no-store');
  secureOrigin(new URL(getRequest().url));
  const token = getCookie(sessionCookie);
  if (!token || !hexToken.test(token)) return null;
  const row = await env.DB.prepare(
    `SELECT a.id, a.display_name
     FROM auth_sessions s JOIN auth_accounts a ON a.id = s.account_id
     WHERE s.session_hash = ? AND s.expires_at > ?`,
  )
    .bind(await sha256(token), Date.now())
    .first<{ id: string; display_name: string | null }>();
  return row ? { id: row.id, displayName: row.display_name } : null;
}

export async function currentAccount(): Promise<Account> {
  const account = await optionalAccount();
  if (!account) throw new Error('Sign in with Google to continue.');
  return account;
}

export async function deleteSession() {
  requireSameOrigin();
  const request = getRequest();
  const url = new URL(request.url);
  const secure = secureOrigin(url);
  const token = getCookie(sessionCookie);
  if (token && hexToken.test(token)) {
    await env.DB.prepare(`DELETE FROM auth_sessions WHERE session_hash = ?`)
      .bind(await sha256(token))
      .run();
  }
  setResponseHeader('Set-Cookie', cookie(sessionCookie, '', secure, 0));
  setResponseHeader('Cache-Control', 'private, no-store');
}
