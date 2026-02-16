export type DiscordWorkEmoji = "👀" | "🧠" | "💻" | "🌐" | "🛠️" | "⏳" | "⚠️" | "✅" | "❌";

const MIDDLE_STATE_DEBOUNCE_MS = 700;
const STALL_SOFT_MS = 10_000;
const STALL_HARD_MS = 30_000;
const SUCCESS_HOLD_MS = 1_500;
const FAILURE_HOLD_MS = 4_000;

type ReactionStatusMachineParams = {
  setReaction: (emoji: DiscordWorkEmoji) => Promise<void>;
  clearReaction: (emoji: DiscordWorkEmoji) => Promise<void>;
  onError?: (message: string) => void;
};

function maybeUnref(timer: ReturnType<typeof setTimeout>) {
  // Prevent status timers from pinning the process (tests / shutdown).
  timer.unref?.();
}

export function resolveToolStateEmoji(toolText?: string): "💻" | "🌐" | "🛠️" {
  const text = (toolText ?? "").toLowerCase();

  // Web-ish tools
  if (
    text.includes("web_search") ||
    text.includes("web-search") ||
    text.includes("web_fetch") ||
    text.includes("web-fetch") ||
    text.includes("browser")
  ) {
    return "🌐";
  }

  // Code/file/process tools
  if (
    text.includes("exec") ||
    text.includes("read") ||
    text.includes("write") ||
    text.includes("edit") ||
    text.includes("process")
  ) {
    return "💻";
  }

  return "🛠️";
}

export function createDiscordReactionStatusMachine(params: ReactionStatusMachineParams) {
  let currentEmoji: DiscordWorkEmoji | null = null;
  let pendingMiddleEmoji: DiscordWorkEmoji | null = null;
  let lastProgressAt = Date.now();
  let disposed = false;
  let terminal = false;

  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let softStallTimer: ReturnType<typeof setTimeout> | null = null;
  let hardStallTimer: ReturnType<typeof setTimeout> | null = null;
  let clearTimer: ReturnType<typeof setTimeout> | null = null;

  let lane: Promise<void> = Promise.resolve();

  const clearTimers = () => {
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }
    if (softStallTimer) {
      clearTimeout(softStallTimer);
      softStallTimer = null;
    }
    if (hardStallTimer) {
      clearTimeout(hardStallTimer);
      hardStallTimer = null;
    }
    if (clearTimer) {
      clearTimeout(clearTimer);
      clearTimer = null;
    }
  };

  const enqueue = (task: () => Promise<void>) => {
    lane = lane.then(task).catch((err) => {
      params.onError?.(`discord status reaction failed: ${String(err)}`);
    });
    return lane;
  };

  const setEmojiImmediate = async (emoji: DiscordWorkEmoji) => {
    if (disposed || emoji === currentEmoji) {
      return;
    }
    const previous = currentEmoji;
    if (previous) {
      await params.clearReaction(previous).catch((err) => {
        params.onError?.(`discord status remove reaction failed: ${String(err)}`);
      });
    }
    await params.setReaction(emoji).catch((err) => {
      params.onError?.(`discord status set reaction failed: ${String(err)}`);
    });
    currentEmoji = emoji;
  };

  const scheduleStallChecks = () => {
    if (disposed || terminal) {
      return;
    }
    if (softStallTimer) {
      clearTimeout(softStallTimer);
    }
    if (hardStallTimer) {
      clearTimeout(hardStallTimer);
    }

    const now = Date.now();
    const elapsed = now - lastProgressAt;
    const softIn = Math.max(0, STALL_SOFT_MS - elapsed);
    const hardIn = Math.max(0, STALL_HARD_MS - elapsed);

    softStallTimer = setTimeout(() => {
      if (disposed || terminal) {
        return;
      }
      if (Date.now() - lastProgressAt >= STALL_SOFT_MS) {
        scheduleMiddleState("⏳");
      }
    }, softIn);
    maybeUnref(softStallTimer);

    hardStallTimer = setTimeout(() => {
      if (disposed || terminal) {
        return;
      }
      if (Date.now() - lastProgressAt >= STALL_HARD_MS) {
        scheduleMiddleState("⚠️");
      }
    }, hardIn);
    maybeUnref(hardStallTimer);
  };

  const markProgress = () => {
    lastProgressAt = Date.now();
    scheduleStallChecks();
  };

  const scheduleMiddleState = (emoji: DiscordWorkEmoji) => {
    if (disposed || terminal) {
      return;
    }
    if (currentEmoji === emoji || pendingMiddleEmoji === emoji) {
      return;
    }
    pendingMiddleEmoji = emoji;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(() => {
      const next = pendingMiddleEmoji;
      pendingMiddleEmoji = null;
      debounceTimer = null;
      if (!next || disposed || terminal || next === currentEmoji) {
        return;
      }
      void enqueue(async () => {
        await setEmojiImmediate(next);
      });
    }, MIDDLE_STATE_DEBOUNCE_MS);
    maybeUnref(debounceTimer);
  };

  const finish = async (emoji: "✅" | "❌", holdMs: number) => {
    if (disposed || terminal) {
      return;
    }
    terminal = true;
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
      pendingMiddleEmoji = null;
    }
    if (softStallTimer) {
      clearTimeout(softStallTimer);
      softStallTimer = null;
    }
    if (hardStallTimer) {
      clearTimeout(hardStallTimer);
      hardStallTimer = null;
    }

    await enqueue(async () => {
      await setEmojiImmediate(emoji);
    });

    clearTimer = setTimeout(() => {
      void dispose();
    }, holdMs);
    maybeUnref(clearTimer);
  };

  const start = async () => {
    if (disposed) {
      return;
    }
    markProgress();
    await enqueue(async () => {
      await setEmojiImmediate("👀");
    });
  };

  const thinking = () => {
    if (disposed || terminal) {
      return;
    }
    markProgress();
    scheduleMiddleState("🧠");
  };

  const tool = (toolText?: string) => {
    if (disposed || terminal) {
      return;
    }
    markProgress();
    scheduleMiddleState(resolveToolStateEmoji(toolText));
  };

  const progress = () => {
    if (disposed || terminal) {
      return;
    }
    markProgress();
  };

  const succeed = async () => {
    await finish("✅", SUCCESS_HOLD_MS);
  };

  const fail = async () => {
    await finish("❌", FAILURE_HOLD_MS);
  };

  const dispose = async () => {
    if (disposed) {
      return;
    }
    disposed = true;
    clearTimers();
    const emoji = currentEmoji;
    currentEmoji = null;
    if (!emoji) {
      return;
    }
    await enqueue(async () => {
      await params.clearReaction(emoji).catch((err) => {
        params.onError?.(`discord status clear reaction failed: ${String(err)}`);
      });
    });
  };

  return {
    start,
    thinking,
    tool,
    progress,
    succeed,
    fail,
    dispose,
  };
}
