type QueueSnapshot = {
  size: number;
  messageIds: string[];
};

const activeMessageIds = new Set<string>();

function normalizeMessageId(messageId: string): string {
  return messageId.trim();
}

/**
 * Claim a queue slot for a Discord message lifecycle.
 * Returns whether there was pending work before this message entered.
 */
export function claimDiscordStatusReactionQueue(messageId: string): {
  hasPriorPendingWork: boolean;
} {
  const normalized = normalizeMessageId(messageId);
  const alreadyActive = activeMessageIds.has(normalized);
  const hasPriorPendingWork = alreadyActive ? activeMessageIds.size > 1 : activeMessageIds.size > 0;
  activeMessageIds.add(normalized);
  return { hasPriorPendingWork };
}

/**
 * Release a previously claimed queue slot.
 */
export function releaseDiscordStatusReactionQueue(messageId: string): void {
  const normalized = normalizeMessageId(messageId);
  if (!normalized) {
    return;
  }
  activeMessageIds.delete(normalized);
}

function getQueueSnapshot(): QueueSnapshot {
  return {
    size: activeMessageIds.size,
    messageIds: Array.from(activeMessageIds),
  };
}

function resetQueueForTests(): void {
  activeMessageIds.clear();
}

export const __testing = {
  getQueueSnapshot,
  resetQueueForTests,
};
