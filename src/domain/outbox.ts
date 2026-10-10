import type { PendingCheckIn } from './check-in';
export type { PendingCheckIn } from './check-in';

interface OutboxStorage<Result, Entry> {
  read: () => Entry[];
  acknowledge: (id: string, result: Result) => void;
}

// Acknowledge one ID against current storage, never replace a stale batch:
// another tab or a new draft can add entries while a request is in flight.
export async function flushOutbox<
  Result,
  Entry extends { id: string } = PendingCheckIn,
>(
  storage: OutboxStorage<Result, Entry>,
  send: (entry: Entry) => Promise<Result>,
) {
  const batch = storage.read();
  for (const entry of batch) {
    if (!storage.read().some((pending) => pending.id === entry.id)) continue;
    const result = await send(entry);
    storage.acknowledge(entry.id, result);
  }
}
