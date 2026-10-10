import { env } from 'cloudflare:workers';
import { createServerFn } from '@tanstack/react-start';
import {
  getRequest,
  setResponseHeader,
  setCookie,
} from '@tanstack/react-start/server';
import { configFor, hash, sessionCookie, sessionToken } from './openai';

export type AccountStatus = {
  configured: boolean;
  signedIn: boolean;
  displayName: string | null;
  creditsSupported: false;
  reason: string;
};

export const getAccount = createServerFn({ method: 'GET' }).handler(
  async (): Promise<AccountStatus> => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const request = getRequest();
    const config = configFor(request);
    const configured = config !== null;
    const token = sessionToken(request);
    let displayName: string | null = null;
    let signedIn = false;
    if (config && token) {
      const account = await env.DB.prepare(
        `SELECT a.display_name FROM auth_sessions s
         JOIN auth_accounts a ON a.id = s.account_id
         WHERE s.session_hash = ? AND s.expires_at > ?
           AND a.issuer = ? AND a.client_id = ?`,
      )
        .bind(
          await hash(token),
          Date.now(),
          'https://auth.openai.com',
          config.clientId,
        )
        .first<{ display_name: string | null }>();
      signedIn = account !== null;
      displayName = account?.display_name ?? null;
    }
    return {
      configured,
      signedIn,
      displayName,
      creditsSupported: false,
      reason: !configured
        ? 'ChatGPT sign-in is unavailable until an approved client is configured.'
        : signedIn
          ? 'Identity only. No cross-device learning sync or ChatGPT plan usage.'
          : 'Sign in verifies identity only; learning stays on this device.',
    };
  },
);

export const signOut = createServerFn({ method: 'POST' }).handler(
  async (): Promise<void> => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const request = getRequest();
    const origin = request.headers.get('origin');
    if (!origin || origin !== new URL(request.url).origin) {
      throw new Error('Sign-out requires a same-origin request.');
    }
    const token = sessionToken(request);
    if (token) {
      await env.DB.prepare('DELETE FROM auth_sessions WHERE session_hash = ?')
        .bind(await hash(token))
        .run();
    }
    setCookie(sessionCookie, '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(request.url).protocol === 'https:',
      path: '/',
      maxAge: 0,
    });
  },
);
