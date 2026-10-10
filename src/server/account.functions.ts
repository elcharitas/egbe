import { createServerFn } from '@tanstack/react-start';
import {
  getCookie,
  getRequest,
  setResponseHeader,
} from '@tanstack/react-start/server';
import { z } from 'zod';
import {
  configured,
  deleteSession,
  optionalAccount,
  prepareGoogleReturn,
} from './google';

export const getAccount = createServerFn({ method: 'GET' }).handler(
  async (): Promise<{
    configured: boolean;
    signedIn: boolean;
    accountId: string | null;
    hasEarlierCircleSession: boolean;
    displayName: string | null;
    reason: string;
  }> => {
    setResponseHeader('Cache-Control', 'private, no-store');
    const available = configured(new URL(getRequest().url));
    const account = await optionalAccount();
    return {
      configured: available,
      signedIn: account !== null,
      accountId: account?.id ?? null,
      hasEarlierCircleSession: /^[0-9a-f]{64}$/.test(
        getCookie('egbe_circle') ?? '',
      ),
      displayName: account?.displayName ?? null,
      reason: account
        ? ''
        : available
          ? 'Sign in with Google to save and share across devices.'
          : 'Google sign-in is not configured on this site.',
    };
  },
);

export const prepareGoogleSignIn = createServerFn({ method: 'POST' })
  .validator((input: unknown) =>
    z
      .object({
        invite: z
          .string()
          .regex(/^[0-9a-f]{64}$/)
          .nullable(),
      })
      .parse(input),
  )
  .handler(({ data }) => {
    prepareGoogleReturn(data.invite);
  });

export const signOut = createServerFn({ method: 'POST' }).handler(
  async (): Promise<void> => {
    await deleteSession();
  },
);
