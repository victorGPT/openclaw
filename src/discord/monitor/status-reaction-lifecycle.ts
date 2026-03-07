import type { StatusReactionEmojis } from "../../channels/status-reactions.js";

export type DiscordStatusLifecycleState =
  | "idle"
  | "waiting-fresh"
  | "waiting-backlog"
  | "active-base"
  | "active-coded"
  | "active-search"
  | "active-tool"
  | "cleared";

type DiscordStatusTraceStage = "queued" | "applied" | "ignored" | "failed";
type DiscordStatusSpecialization = "coded" | "search" | "tool";

export type DiscordStatusTraceEntry = {
  messageId: string;
  state: DiscordStatusLifecycleState;
  fromState: DiscordStatusLifecycleState;
  toState: DiscordStatusLifecycleState;
  stage: DiscordStatusTraceStage;
  emoji: string | null;
  reason?: string;
  at: number;
};

export type DiscordStatusReactionAdapter = {
  setReaction: (emoji: string) => Promise<void>;
  removeReaction?: (emoji: string) => Promise<void>;
};

export type DiscordStatusReactionProjection = {
  waitingFresh: string;
  waitingBacklog: string;
  activeBase: string;
  activeCoded: string;
  activeSearch: string;
  activeTool: string;
};

export const DISCORD_STATUS_DEFAULT_PROJECTION: DiscordStatusReactionProjection = {
  waitingFresh: "👀",
  waitingBacklog: "⏳",
  activeBase: "🤔",
  activeCoded: "💻",
  activeSearch: "🔍",
  activeTool: "🔧",
};

export const DISCORD_STATUS_SPECIALIZATION_WINDOW_MS = 300;
export const DISCORD_STATUS_CLEAR_HOLD_MS = 0;

const CODING_SIGNAL_TOKENS = ["read", "write", "edit", "exec", "process"];
const SEARCH_SIGNAL_TOKENS = ["web_search", "web_fetch", "browser"];
const MAX_TRACE_ENTRIES = 2000;
const traceEntries: DiscordStatusTraceEntry[] = [];

function pushTrace(entry: DiscordStatusTraceEntry): void {
  traceEntries.push(entry);
  if (traceEntries.length > MAX_TRACE_ENTRIES) {
    traceEntries.splice(0, traceEntries.length - MAX_TRACE_ENTRIES);
  }
}

function resolveEmojiForState(
  state: DiscordStatusLifecycleState,
  projection: DiscordStatusReactionProjection,
): string | null {
  switch (state) {
    case "waiting-fresh":
      return projection.waitingFresh;
    case "waiting-backlog":
      return projection.waitingBacklog;
    case "active-base":
      return projection.activeBase;
    case "active-coded":
      return projection.activeCoded;
    case "active-search":
      return projection.activeSearch;
    case "active-tool":
      return projection.activeTool;
    default:
      return null;
  }
}

function isWaitingState(state: DiscordStatusLifecycleState): boolean {
  return state === "waiting-fresh" || state === "waiting-backlog";
}

function isActiveState(state: DiscordStatusLifecycleState): boolean {
  return (
    state === "active-base" ||
    state === "active-coded" ||
    state === "active-search" ||
    state === "active-tool"
  );
}

function canTransition(
  from: DiscordStatusLifecycleState,
  to: DiscordStatusLifecycleState,
): boolean {
  if (from === "idle") {
    return isWaitingState(to) || to === "active-base";
  }
  if (isWaitingState(from)) {
    return to === "active-base" || to === "cleared";
  }
  if (from === "active-base") {
    return (
      to === "active-coded" || to === "active-search" || to === "active-tool" || to === "cleared"
    );
  }
  if (from === "active-coded" || from === "active-search" || from === "active-tool") {
    return to === "cleared";
  }
  return false;
}

function canEnqueueTransition(params: {
  state: DiscordStatusLifecycleState;
  lastRequestedState: DiscordStatusLifecycleState | null;
  nextState: DiscordStatusLifecycleState;
}): boolean {
  if (canTransition(params.state, params.nextState)) {
    return true;
  }
  if (
    isWaitingState(params.state) &&
    params.lastRequestedState === "active-base" &&
    params.nextState === "cleared"
  ) {
    return true;
  }
  if (
    params.state === "active-base" &&
    (params.lastRequestedState === "active-coded" ||
      params.lastRequestedState === "active-search" ||
      params.lastRequestedState === "active-tool") &&
    params.nextState === "cleared"
  ) {
    return true;
  }
  return false;
}

function trackTransition(params: {
  messageId: string;
  fromState: DiscordStatusLifecycleState;
  toState: DiscordStatusLifecycleState;
  stage: DiscordStatusTraceStage;
  emoji: string | null;
  reason?: string;
  onTrace?: (entry: DiscordStatusTraceEntry) => void;
}): void {
  const entry: DiscordStatusTraceEntry = {
    messageId: params.messageId,
    state: params.toState,
    fromState: params.fromState,
    toState: params.toState,
    stage: params.stage,
    emoji: params.emoji,
    reason: params.reason,
    at: Date.now(),
  };
  pushTrace(entry);
  params.onTrace?.(entry);
}

function classifyToolSignal(toolName?: string): DiscordStatusSpecialization {
  const normalized = toolName?.trim().toLowerCase() ?? "";
  if (CODING_SIGNAL_TOKENS.some((token) => normalized.includes(token))) {
    return "coded";
  }
  if (SEARCH_SIGNAL_TOKENS.some((token) => normalized.includes(token))) {
    return "search";
  }
  return "tool";
}

function resolveStateForSpecialization(
  kind: DiscordStatusSpecialization,
): Extract<DiscordStatusLifecycleState, "active-coded" | "active-search" | "active-tool"> {
  switch (kind) {
    case "coded":
      return "active-coded";
    case "search":
      return "active-search";
    case "tool":
      return "active-tool";
  }
}

export function resolveDiscordStatusReactionProjection(
  overrides?: StatusReactionEmojis,
  waitingFreshFallback?: string,
): DiscordStatusReactionProjection {
  const normalizedWaitingFreshFallback = waitingFreshFallback?.trim() || undefined;
  return {
    waitingFresh:
      overrides?.queued ??
      normalizedWaitingFreshFallback ??
      DISCORD_STATUS_DEFAULT_PROJECTION.waitingFresh,
    waitingBacklog: overrides?.stallSoft ?? DISCORD_STATUS_DEFAULT_PROJECTION.waitingBacklog,
    activeBase: overrides?.thinking ?? DISCORD_STATUS_DEFAULT_PROJECTION.activeBase,
    activeCoded: overrides?.coding ?? DISCORD_STATUS_DEFAULT_PROJECTION.activeCoded,
    activeSearch: overrides?.web ?? DISCORD_STATUS_DEFAULT_PROJECTION.activeSearch,
    activeTool: overrides?.tool ?? DISCORD_STATUS_DEFAULT_PROJECTION.activeTool,
  };
}

export function createDiscordStatusReactionLifecycle(params: {
  enabled: boolean;
  messageId: string;
  adapter: DiscordStatusReactionAdapter;
  projection: DiscordStatusReactionProjection;
  onError?: (err: unknown) => void;
  onTrace?: (entry: DiscordStatusTraceEntry) => void;
}) {
  const { enabled, messageId, adapter, projection, onError, onTrace } = params;
  let state: DiscordStatusLifecycleState = "idle";
  let lastRequestedState: DiscordStatusLifecycleState | null = null;
  let currentEmoji: string | null = null;
  let chain = Promise.resolve();
  let clearTimer: NodeJS.Timeout | null = null;
  let activeEnteredAt: number | null = null;
  let specializationChosen = false;
  const knownEmojis = new Set<string>([
    projection.waitingFresh,
    projection.waitingBacklog,
    projection.activeBase,
    projection.activeCoded,
    projection.activeSearch,
    projection.activeTool,
  ]);

  function resetActiveWindow(): void {
    activeEnteredAt = Date.now();
    specializationChosen = false;
  }

  function closeActiveWindow(): void {
    activeEnteredAt = null;
    specializationChosen = false;
  }

  function transition(nextState: DiscordStatusLifecycleState): Promise<void> {
    const nextEmoji = resolveEmojiForState(nextState, projection);
    trackTransition({
      messageId,
      fromState: state,
      toState: nextState,
      stage: "queued",
      emoji: nextEmoji,
      onTrace,
    });

    if (!enabled) {
      state = nextState;
      if (nextState === "active-base") {
        resetActiveWindow();
      } else if (!isActiveState(nextState)) {
        closeActiveWindow();
      }
      return Promise.resolve();
    }
    if (nextState === state || nextState === lastRequestedState) {
      trackTransition({
        messageId,
        fromState: state,
        toState: nextState,
        stage: "ignored",
        emoji: nextEmoji,
        reason: "duplicate",
        onTrace,
      });
      return chain;
    }
    if (!canEnqueueTransition({ state, lastRequestedState, nextState })) {
      trackTransition({
        messageId,
        fromState: state,
        toState: nextState,
        stage: "ignored",
        emoji: nextEmoji,
        reason: "invalid_transition",
        onTrace,
      });
      return chain;
    }

    lastRequestedState = nextState;
    chain = chain.then(async () => {
      const fromState = state;
      try {
        if (!canTransition(fromState, nextState)) {
          trackTransition({
            messageId,
            fromState,
            toState: nextState,
            stage: "ignored",
            emoji: nextEmoji,
            reason: "invalid_transition",
            onTrace,
          });
          return;
        }

        if (nextState === "cleared") {
          closeActiveWindow();
          let hadFailure = false;
          if (adapter.removeReaction) {
            for (const emoji of knownEmojis) {
              try {
                await adapter.removeReaction(emoji);
              } catch (err) {
                hadFailure = true;
                onError?.(err);
              }
            }
          }

          if (hadFailure) {
            state = fromState;
            trackTransition({
              messageId,
              fromState,
              toState: nextState,
              stage: "failed",
              emoji: null,
              onTrace,
            });
            return;
          }

          state = nextState;
          currentEmoji = null;
          trackTransition({
            messageId,
            fromState,
            toState: nextState,
            stage: "applied",
            emoji: null,
            onTrace,
          });
          return;
        }

        if (!nextEmoji) {
          trackTransition({
            messageId,
            fromState,
            toState: nextState,
            stage: "ignored",
            emoji: null,
            reason: "no_projection",
            onTrace,
          });
          return;
        }

        const previousEmoji = currentEmoji;
        await adapter.setReaction(nextEmoji);
        if (adapter.removeReaction && previousEmoji && previousEmoji !== nextEmoji) {
          await adapter.removeReaction(previousEmoji);
        }
        state = nextState;
        currentEmoji = nextEmoji;
        if (nextState === "active-base") {
          resetActiveWindow();
        } else if (!isActiveState(nextState)) {
          closeActiveWindow();
        }
        trackTransition({
          messageId,
          fromState,
          toState: nextState,
          stage: "applied",
          emoji: nextEmoji,
          onTrace,
        });
      } catch (err) {
        state = fromState;
        trackTransition({
          messageId,
          fromState,
          toState: nextState,
          stage: "failed",
          emoji: nextEmoji,
          onTrace,
        });
        onError?.(err);
      } finally {
        if (lastRequestedState === nextState) {
          lastRequestedState = null;
        }
      }
    });
    return chain;
  }

  function noteToolActivity(toolName?: string): void {
    if (specializationChosen) {
      trackTransition({
        messageId,
        fromState: state,
        toState: state,
        stage: "ignored",
        emoji: resolveEmojiForState(state, projection),
        reason: "already_specialized",
        onTrace,
      });
      return;
    }
    if (state !== "active-base" || activeEnteredAt === null) {
      trackTransition({
        messageId,
        fromState: state,
        toState: state,
        stage: "ignored",
        emoji: resolveEmojiForState(state, projection),
        reason: "inactive",
        onTrace,
      });
      return;
    }
    if (Date.now() - activeEnteredAt > DISCORD_STATUS_SPECIALIZATION_WINDOW_MS) {
      trackTransition({
        messageId,
        fromState: state,
        toState: state,
        stage: "ignored",
        emoji: resolveEmojiForState(state, projection),
        reason: "out_of_window",
        onTrace,
      });
      return;
    }

    const nextSpecialization = classifyToolSignal(toolName);
    specializationChosen = true;
    void transition(resolveStateForSpecialization(nextSpecialization));
  }

  return {
    enterWaiting: (hasPriorPendingWork: boolean): Promise<void> =>
      transition(hasPriorPendingWork ? "waiting-backlog" : "waiting-fresh"),
    enterActive: (): Promise<void> => transition("active-base"),
    noteToolActivity,
    complete: (_succeeded: boolean): Promise<void> => {
      closeActiveWindow();
      return transition("cleared");
    },
    clearAfterHold: (holdMs = DISCORD_STATUS_CLEAR_HOLD_MS): void => {
      if (!enabled || clearTimer) {
        return;
      }
      clearTimer = setTimeout(() => {
        clearTimer = null;
        void transition("cleared");
      }, holdMs);
    },
  };
}

function resetTraceEntriesForTests(): void {
  traceEntries.length = 0;
}

function getTraceEntriesForTests(): DiscordStatusTraceEntry[] {
  return traceEntries.map((entry) => ({ ...entry }));
}

export const __testing = {
  getTraceEntriesForTests,
  resetTraceEntriesForTests,
};
