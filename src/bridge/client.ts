import type { DecisionInput, InboxMessage } from './messages';

// Browser side of the bridge (R12). Every call tolerates an absent middleware
// (production build, dev server down): the app must keep working without the
// harness, so failures return false/empty instead of throwing.

export async function sendDecision(input: DecisionInput): Promise<boolean> {
  try {
    const res = await fetch('/__bridge/outbox', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export async function pollInbox(): Promise<InboxMessage[]> {
  try {
    const res = await fetch('/__bridge/inbox');
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: InboxMessage[] };
    return data.messages ?? [];
  } catch {
    return [];
  }
}

const POLL_INTERVAL_MS = 2000;

/** Start polling the inbox; returns a stop function. */
export function startInboxPolling(
  onMessage: (message: InboxMessage) => void,
  intervalMs = POLL_INTERVAL_MS,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    const messages = await pollInbox();
    if (stopped) return;
    for (const message of messages) onMessage(message);
    timer = setTimeout(tick, intervalMs);
  };
  timer = setTimeout(tick, intervalMs);

  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}
