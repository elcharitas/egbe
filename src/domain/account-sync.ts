export type AccountSaveStatus = 'saved' | 'saving' | 'unsaved' | 'conflict';
export interface AccountSnapshot<Value> {
  value: Value;
  status: AccountSaveStatus;
  error: string;
  committing: boolean;
}
export interface AccountMutation<Value> {
  value: Value;
  revision: number;
  mutationId: string;
}

// One pending mutation keeps its ID through a lost reply. Revision checks
// prevent a second tab or device from silently replacing newer account work.
export function createAccountSync<Value>(
  initial: Value,
  initialRevision: number,
  send: (mutation: AccountMutation<Value>) => Promise<{ revision: number }>,
  notify: (snapshot: AccountSnapshot<Value>) => void,
  newId: () => string,
) {
  let value = initial;
  let savedValue = initial;
  let revision = initialRevision;
  let pending: (AccountMutation<Value> & { commit: boolean }) | undefined;
  let running: Promise<boolean> | undefined;
  let status: AccountSaveStatus = 'saved';
  let error = '';

  function publish() {
    notify({ value, status, error, committing: pending?.commit ?? false });
  }

  async function sendPending() {
    if (!pending) return;
    status = 'saving';
    error = '';
    publish();
    const result = await send(pending);
    if (result.revision !== pending.revision + 1) {
      throw new Error(
        'Unexpected account revision. Reload after exporting work.',
      );
    }
    revision = result.revision;
    savedValue = pending.value;
    if (pending.commit) value = pending.value;
    pending = undefined;
  }

  function flush(): Promise<boolean> {
    if (running) return running;
    if (status === 'conflict') return Promise.resolve(false);
    running = Promise.resolve().then(async () => {
      try {
        while (pending || value !== savedValue) {
          pending ??= {
            value,
            revision,
            mutationId: newId(),
            commit: false,
          };
          await sendPending();
        }
        status = 'saved';
        error = '';
        return true;
      } catch (failure) {
        error =
          failure instanceof Error ? failure.message : 'Account save failed.';
        status = /changed in another|Unexpected account revision/.test(error)
          ? 'conflict'
          : 'unsaved';
        return false;
      } finally {
        running = undefined;
        publish();
      }
    });
    return running;
  }

  return {
    update(change: (current: Value) => Value) {
      if (pending?.commit) return false;
      const next = change(value);
      if (JSON.stringify(next) === JSON.stringify(value)) return true;
      value = next;
      if (status !== 'conflict') status = 'unsaved';
      publish();
      return true;
    },
    flush,
    async commit(change: (current: Value) => Value) {
      if (!(await flush()) || pending) return false;
      pending = {
        value: change(value),
        revision,
        mutationId: newId(),
        commit: true,
      };
      return flush();
    },
  };
}
