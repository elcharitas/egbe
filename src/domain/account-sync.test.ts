import { describe, expect, it } from 'vitest';
import {
  createAccountSync,
  type AccountMutation,
  type AccountSnapshot,
} from './account-sync';

function deferred() {
  let release!: () => void;
  const wait = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { wait, release };
}

describe('account revision synchronization', () => {
  it('saves edits made while an earlier save is in flight', async () => {
    const gate = deferred();
    const sent: AccountMutation<string>[] = [];
    let snapshot: AccountSnapshot<string> | undefined;
    const sync = createAccountSync(
      '',
      0,
      async (mutation) => {
        sent.push(mutation);
        if (sent.length === 1) await gate.wait;
        return { revision: mutation.revision + 1 };
      },
      (next) => {
        snapshot = next;
      },
      () => 'id',
    );
    sync.update(() => 'first');
    const save = sync.flush();
    await Promise.resolve();
    sync.update(() => 'newer');
    gate.release();
    expect(await save).toBe(true);
    expect(sent.map((item) => item.value)).toEqual(['first', 'newer']);
    expect(snapshot?.value).toBe('newer');
    expect(snapshot?.status).toBe('saved');
  });

  it('retries the same payload and ID after a lost reply', async () => {
    const sent: AccountMutation<string>[] = [];
    let attempt = 0;
    const sync = createAccountSync(
      '',
      0,
      async (mutation) => {
        sent.push(mutation);
        if (++attempt === 1) throw new Error('lost reply');
        return { revision: mutation.revision + 1 };
      },
      () => {},
      () => `id-${attempt}`,
    );
    sync.update(() => 'first');
    expect(await sync.flush()).toBe(false);
    sync.update(() => 'newer');
    expect(await sync.flush()).toBe(true);
    expect(sent[0]).toEqual(sent[1]);
    expect(sent[2]?.value).toBe('newer');
    expect(sent[2]?.revision).toBe(1);
  });

  it('keeps a cancelled retry marker visible until confirmation', async () => {
    let fail = true;
    let snapshot: AccountSnapshot<string[]> | undefined;
    const sync = createAccountSync(
      ['retry-id'],
      2,
      async (mutation) => {
        if (fail) throw new Error('connection failed');
        return { revision: mutation.revision + 1 };
      },
      (next) => {
        snapshot = next;
      },
      () => 'cancel-id',
    );
    expect(await sync.commit(() => [])).toBe(false);
    expect(snapshot?.value).toEqual(['retry-id']);
    expect(snapshot?.committing).toBe(true);
    expect(sync.update(() => ['different'])).toBe(false);
    fail = false;
    expect(await sync.flush()).toBe(true);
    expect(snapshot?.value).toEqual([]);
    expect(snapshot?.committing).toBe(false);
  });

  it('does not overwrite a newer account revision', async () => {
    let sends = 0;
    let snapshot: AccountSnapshot<string> | undefined;
    const sync = createAccountSync(
      '',
      1,
      async () => {
        sends++;
        throw new Error('Account work changed in another tab or device.');
      },
      (next) => {
        snapshot = next;
      },
      () => 'id',
    );
    sync.update(() => 'in-page work');
    expect(await sync.flush()).toBe(false);
    expect(snapshot?.value).toBe('in-page work');
    expect(snapshot?.status).toBe('conflict');
    expect(await sync.flush()).toBe(false);
    expect(sends).toBe(1);
  });

  it('can save after an already-clean flush and serializes commits', async () => {
    const gate = deferred();
    const sent: AccountMutation<number>[] = [];
    const sync = createAccountSync(
      0,
      0,
      async (mutation) => {
        sent.push(mutation);
        await gate.wait;
        return { revision: mutation.revision + 1 };
      },
      () => {},
      () => 'id',
    );
    expect(await sync.flush()).toBe(true);
    const first = sync.commit(() => 1);
    const second = sync.commit(() => 2);
    await Promise.resolve();
    gate.release();
    expect(await first).toBe(true);
    expect(await second).toBe(false);
    expect(sent.map((item) => item.value)).toEqual([1]);
  });
});
