import { describe, expect, it } from 'vitest';
import { flushOutbox, type PendingCheckIn } from './outbox';

const first: PendingCheckIn = {
  id: 'first',
  participant: '0123456789abcdef',
  direction: 'web',
  message: 'I tried a heading.',
};
const second: PendingCheckIn = {
  id: 'second',
  participant: '0123456789abcdef',
  direction: 'numbers',
  message: 'I compared prices.',
};

function memoryQueue(initial: PendingCheckIn[]) {
  let queue = initial;
  return {
    read: () => queue,
    acknowledge: (id: string) => {
      queue = queue.filter((entry) => entry.id !== id);
    },
    write: (next: PendingCheckIn[]) => {
      queue = next;
    },
  };
}

describe('durable check-in outbox', () => {
  it('preserves a new check-in added while an older one is sending', async () => {
    const storage = memoryQueue([first]);
    await flushOutbox(storage, async () => {
      storage.write([...storage.read(), second]);
    });
    expect(storage.read()).toEqual([second]);
  });

  it('keeps the failed and unattempted entries, not confirmed ones', async () => {
    const storage = memoryQueue([first, second]);
    await expect(
      flushOutbox(storage, async (entry) => {
        if (entry.id === second.id) throw new Error('connection interrupted');
      }),
    ).rejects.toThrow('connection interrupted');
    expect(storage.read()).toEqual([second]);
  });

  it('retries the same ID after the server committed but its reply was lost', async () => {
    const storage = memoryQueue([first]);
    const committed = new Set<string>();
    const send = async (entry: PendingCheckIn) => {
      committed.add(entry.id);
    };
    await expect(
      flushOutbox(storage, async (entry) => {
        await send(entry);
        throw new Error('reply lost');
      }),
    ).rejects.toThrow('reply lost');
    expect(storage.read()).toEqual([first]);
    await flushOutbox(storage, send);
    expect(committed.size).toBe(1);
    expect(storage.read()).toEqual([]);
  });

  it('retains an acknowledged entry if saving the acknowledgement fails', async () => {
    const storage = memoryQueue([first]);
    await expect(
      flushOutbox(
        {
          read: storage.read,
          acknowledge: () => {
            throw new Error('storage full');
          },
        },
        async () => {},
      ),
    ).rejects.toThrow('storage full');
    expect(storage.read()).toEqual([first]);
  });

  it('does not send an entry removed before its turn', async () => {
    const storage = memoryQueue([first, second]);
    const sent: string[] = [];
    await flushOutbox(storage, async (entry) => {
      sent.push(entry.id);
      storage.write([first]);
    });
    expect(sent).toEqual(['first']);
    expect(storage.read()).toEqual([]);
  });
});
