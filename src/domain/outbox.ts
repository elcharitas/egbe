import type { PendingCheckIn } from './check-in';
export type { PendingCheckIn } from './check-in';

interface OutboxStorage {
  read: () => PendingCheckIn[];
  write: (remaining: PendingCheckIn[]) => void;
}

// Remove only confirmed IDs from the latest queue: new drafts can arrive
// while a request is in flight. Failed acknowledgements safely retry the ID.
export async function flushOutbox(
  storage: OutboxStorage,
  send: (entry: PendingCheckIn) => Promise<void>,
) {
  const batch = storage.read();
  for (const entry of batch) {
    if (!storage.read().some((pending) => pending.id === entry.id)) continue;
    await send(entry);
    storage.write(storage.read().filter((pending) => pending.id !== entry.id));
  }
}
