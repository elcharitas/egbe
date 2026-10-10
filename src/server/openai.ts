import { env } from 'cloudflare:workers';
import { createRemoteJWKSet, customFetch, jwtVerify } from 'jose';

const issuer = 'https://auth.openai.com';
const discoveryUrl = `${issuer}/.well-known/openid-configuration`;
const authorizationEndpoint = `${issuer}/api/accounts/authorize`;
const tokenEndpoint = `${issuer}/api/accounts/oauth/token`;
const jwksUri = `${issuer}/.well-known/jwks.json`;
const callbackPath = '/auth/openai/callback';
const transactionCookie = 'egbe_openai_transaction';
export const sessionCookie = 'egbe_openai_session';
const failLocation = '/?signin=failed#account';
const unavailableLocation = '/?signin=unavailable#account';
const successLocation = '/?signin=success#account';
const transactionAge = 600;
const sessionAge = 8 * 60 * 60;
const tokenPattern = /^[0-9a-f]{64}$/;

type Config = {
  clientId: string;
  redirectUri: string;
  method: 'none' | 'client_secret_basic';
  secret?: string;
  secure: boolean;
};

function secureRequest(request: Request): boolean | null {
  const url = new URL(request.url);
  if (url.protocol === 'https:') return true;
  if (
    url.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  )
    return false;
  return null;
}

export function configFor(request: Request): Config | null {
  const secure = secureRequest(request);
  const clientId = env.OPENAI_CLIENT_ID;
  const redirectUri = env.OPENAI_REDIRECT_URI;
  const method = env.OPENAI_TOKEN_AUTH_METHOD;
  if (
    secure === null ||
    !clientId?.startsWith('oaiapp_') ||
    !redirectUri ||
    (method !== 'none' && method !== 'client_secret_basic') ||
    (method === 'client_secret_basic' && !env.OPENAI_CLIENT_SECRET)
  )
    return null;
  try {
    const callback = new URL(redirectUri);
    if (
      callback.origin !== new URL(request.url).origin ||
      callback.pathname !== callbackPath ||
      callback.search ||
      callback.hash ||
      callback.username ||
      callback.password
    )
      return null;
  } catch {
    return null;
  }
  return {
    clientId,
    redirectUri,
    method,
    secret:
      method === 'client_secret_basic' ? env.OPENAI_CLIENT_SECRET : undefined,
    secure,
  };
}

export function randomToken() {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

export async function hash(value: string) {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

function cookie(request: Request, name: string) {
  const raw = request.headers.get('cookie') ?? '';
  const value = raw
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
    ?.slice(name.length + 1);
  return value && tokenPattern.test(value) ? value : null;
}

export function sessionToken(request: Request) {
  return cookie(request, sessionCookie);
}

function transactionToken(request: Request) {
  return cookie(request, transactionCookie);
}

function cookieHeader(
  name: string,
  value: string,
  secure: boolean,
  age: number,
) {
  return (
    `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}` +
    (secure ? '; Secure' : '')
  );
}

function clearTransaction(response: Response, request: Request) {
  response.headers.append(
    'Set-Cookie',
    cookieHeader(transactionCookie, '', secureRequest(request) !== false, 0),
  );
  return response;
}

function redirect(location: string) {
  return new Response(null, {
    status: 302,
    headers: { Location: location, 'Cache-Control': 'private, no-store' },
  });
}

function failed(request: Request) {
  return clearTransaction(redirect(failLocation), request);
}

async function boundedFetch(url: string, init?: RequestInit) {
  const response = await fetch(url, {
    ...init,
    redirect: 'error',
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error('Identity provider unavailable');
  const length = response.headers.get('content-length');
  if (length && Number(length) > 65536)
    throw new Error('Identity provider response too large');
  return response;
}

async function boundedJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await boundedFetch(url, init);
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Identity provider response missing');
  let size = 0;
  const chunks: Uint8Array[] = [];
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 65536) throw new Error('Identity provider response too large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  const data = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    data.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(data)) as unknown;
}

async function discover() {
  const data = await boundedJson(discoveryUrl);
  if (
    !data ||
    typeof data !== 'object' ||
    !('issuer' in data) ||
    data.issuer !== issuer ||
    !('authorization_endpoint' in data) ||
    data.authorization_endpoint !== authorizationEndpoint ||
    !('token_endpoint' in data) ||
    data.token_endpoint !== tokenEndpoint ||
    !('jwks_uri' in data) ||
    data.jwks_uri !== jwksUri
  )
    throw new Error('Identity provider discovery mismatch');
}

// jose caches validated keys and refreshes the set for previously unknown kids.
const keys = createRemoteJWKSet(new URL(jwksUri), {
  cooldownDuration: 30_000,
  cacheMaxAge: 600_000,
  [customFetch]: async () =>
    new Response(JSON.stringify(await boundedJson(jwksUri)), {
      headers: { 'Content-Type': 'application/json' },
    }),
});

export async function startSignIn(request: Request) {
  const config = configFor(request);
  if (!config) return clearTransaction(redirect(unavailableLocation), request);
  try {
    await discover();
    const browser = randomToken();
    const state = randomToken();
    const verifier = randomToken();
    const nonce = randomToken();
    const now = Date.now();
    // Every start gets a one-time transaction. The global cap and expiry
    // pruning bound pending records even when no callback arrives.
    await env.DB.prepare('DELETE FROM oauth_transactions WHERE expires_at <= ?')
      .bind(now)
      .run();
    const inserted = await env.DB.prepare(
      `INSERT INTO oauth_transactions
       (browser_hash, state_hash, verifier, nonce, redirect_uri,
        created_at, expires_at)
       SELECT ?, ?, ?, ?, ?, ?, ?
       WHERE (SELECT COUNT(*) FROM oauth_transactions) < 5000`,
    )
      .bind(
        await hash(browser),
        await hash(state),
        verifier,
        nonce,
        config.redirectUri,
        now,
        now + transactionAge * 1000,
      )
      .run();
    if (inserted.meta.changes !== 1)
      throw new Error('Too many pending identity transactions');
    const challenge = await hash(verifier);
    const url = new URL(authorizationEndpoint);
    url.search = new URLSearchParams({
      client_id: config.clientId,
      redirect_uri: config.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state,
      code_challenge: btoa(
        String.fromCharCode(
          ...(challenge.match(/../g) ?? []).map((hex) => parseInt(hex, 16)),
        ),
      )
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, ''),
      code_challenge_method: 'S256',
      nonce,
    }).toString();
    const response = redirect(url.href);
    response.headers.append(
      'Set-Cookie',
      cookieHeader(transactionCookie, browser, config.secure, transactionAge),
    );
    return response;
  } catch {
    return failed(request);
  }
}

type Transaction = {
  state_hash: string;
  verifier: string;
  nonce: string;
  redirect_uri: string;
};

async function redeem(code: string, transaction: Transaction, config: Config) {
  const form = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: transaction.redirect_uri,
    client_id: config.clientId,
    code_verifier: transaction.verifier,
  });
  const headers: Record<string, string> = {
    accept: 'application/json',
    'content-type': 'application/x-www-form-urlencoded',
  };
  if (config.method === 'client_secret_basic') {
    const component = (value: string) =>
      new URLSearchParams({ value }).toString().slice('value='.length);
    headers.authorization = `Basic ${btoa(
      `${component(config.clientId)}:${component(config.secret!)}`,
    )}`;
  }
  const tokens = await boundedJson(tokenEndpoint, {
    method: 'POST',
    headers,
    body: form,
  });
  if (
    !tokens ||
    typeof tokens !== 'object' ||
    !('id_token' in tokens) ||
    typeof tokens.id_token !== 'string' ||
    tokens.id_token.length > 16000
  )
    throw new Error('Identity token missing');
  const { payload } = await jwtVerify(tokens.id_token, keys, {
    issuer,
    audience: config.clientId,
    requiredClaims: ['sub', 'exp', 'iat'],
    clockTolerance: 5,
    algorithms: ['RS256', 'ES256'],
  });
  if (
    payload.nonce !== transaction.nonce ||
    typeof payload.sub !== 'string' ||
    !payload.sub ||
    payload.sub.length > 255 ||
    typeof payload.iat !== 'number' ||
    payload.iat > Date.now() / 1000 + 5
  )
    throw new Error('Identity claim invalid');
  return {
    subject: payload.sub,
    name:
      typeof payload.name === 'string'
        ? payload.name.trim().slice(0, 120) || null
        : null,
  };
}

export async function finishSignIn(request: Request) {
  const config = configFor(request);
  if (!config) return failed(request);
  const browser = transactionToken(request);
  if (!browser) return failed(request);
  try {
    const now = Date.now();
    // DELETE RETURNING atomically consumes the transaction even for a
    // mismatched state, provider error, or repeated callback.
    const transaction = await env.DB.prepare(
      `DELETE FROM oauth_transactions
       WHERE browser_hash = ? RETURNING state_hash, verifier, nonce,
       redirect_uri, expires_at`,
    )
      .bind(await hash(browser))
      .first<Transaction & { expires_at: number }>();
    const url = new URL(request.url);
    const states = url.searchParams.getAll('state');
    if (
      !transaction ||
      transaction.expires_at <= now ||
      transaction.redirect_uri !== config.redirectUri ||
      states.length !== 1 ||
      !tokenPattern.test(states[0] ?? '') ||
      (await hash(states[0]!)) !== transaction.state_hash ||
      url.searchParams.has('error')
    )
      return failed(request);
    const codes = url.searchParams.getAll('code');
    if (codes.length !== 1 || !codes[0] || codes[0].length > 4096)
      return failed(request);
    await discover();
    const identity = await redeem(codes[0], transaction, config);
    const id = randomToken();
    await env.DB.prepare(
      `INSERT INTO auth_accounts
       (id, issuer, client_id, subject, display_name, created_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(issuer, client_id, subject)
       DO UPDATE SET display_name = excluded.display_name`,
    )
      .bind(id, issuer, config.clientId, identity.subject, identity.name, now)
      .run();
    const account = await env.DB.prepare(
      `SELECT id FROM auth_accounts
       WHERE issuer = ? AND client_id = ? AND subject = ?`,
    )
      .bind(issuer, config.clientId, identity.subject)
      .first<{ id: string }>();
    if (!account) throw new Error('Local identity unavailable');
    const session = randomToken();
    await env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at <= ?')
      .bind(now)
      .run();
    await env.DB.prepare(
      `INSERT INTO auth_sessions (session_hash, account_id, expires_at)
       VALUES (?, ?, ?)`,
    )
      .bind(await hash(session), account.id, now + sessionAge * 1000)
      .run();
    const response = clearTransaction(redirect(successLocation), request);
    response.headers.append(
      'Set-Cookie',
      cookieHeader(sessionCookie, session, config.secure, sessionAge),
    );
    return response;
  } catch {
    return failed(request);
  }
}
