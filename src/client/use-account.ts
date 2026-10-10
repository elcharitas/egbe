import { useCallback, useEffect, useState } from 'react';
import {
  getAccount,
  prepareGoogleSignIn,
  signOut,
} from '../server/account.functions';
import {
  clearAccountWork,
  hasUnconfirmedAccountWork,
  retryAccountSave,
} from './learner-store';
import { clearCircleWork, syncCircle } from './circle-store';
import { claimEarlierOwnership } from '../server/legacy.functions';
import { requestFromWorker } from './request';

type AccountStatus = Awaited<ReturnType<typeof getAccount>>;

export function useAccount() {
  const [account, setAccount] = useState<AccountStatus | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const refresh = useCallback(async () => {
    try {
      const next = await requestFromWorker((signal) => getAccount({ signal }));
      setAccount(next);
      const url = new URL(location.href);
      const outcome = url.searchParams.get('auth');
      if (outcome) {
        url.searchParams.delete('auth');
        history.replaceState(history.state, '', url);
      }
      setError(
        outcome === 'failure'
          ? 'Google sign-in could not be completed. Your account work was not changed.'
          : outcome === 'success' && !next.signedIn
            ? 'Sign-in could not be confirmed. Try Google sign-in again.'
            : '',
      );
    } catch {
      setError('Your account could not be checked. Reconnect and try again.');
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function login(invite: string | null) {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await requestFromWorker((signal) =>
        prepareGoogleSignIn({ data: { invite }, signal }),
      );
      window.location.assign('/auth/google');
    } catch {
      setError('Sign-in could not start. Try again when connected.');
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    setFeedback('');
    if (hasUnconfirmedAccountWork() && !(await retryAccountSave())) {
      if (
        !window.confirm(
          'Your account save is not confirmed. Signing out discards unsaved in-page edits. Cancel and export first if you want to keep them. Sign out anyway?',
        )
      ) {
        setError(
          'Your in-page work is kept. Export it or retry saving before signing out.',
        );
        setBusy(false);
        return;
      }
    }
    try {
      await requestFromWorker((signal) => signOut({ signal }));
      clearAccountWork();
      clearCircleWork();
      await refresh();
    } catch {
      setError(
        'Sign-out could not be confirmed. Your work remains in this page.',
      );
    } finally {
      setBusy(false);
    }
  }
  async function connectEarlierOwnership() {
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      await requestFromWorker((signal) => claimEarlierOwnership({ signal }));
      await refresh();
      await syncCircle();
      setFeedback('Earlier circle ownership connected to your account.');
    } catch (failure) {
      setError(
        failure instanceof Error
          ? failure.message
          : 'Earlier ownership could not be connected.',
      );
    } finally {
      setBusy(false);
    }
  }
  return {
    account,
    busy,
    error,
    feedback,
    refresh,
    login,
    logout,
    connectEarlierOwnership,
  };
}
