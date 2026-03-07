import { describe, expect, it, vi } from "vitest";
import {
  __testing,
  createDiscordStatusReactionLifecycle,
  resolveDiscordStatusReactionProjection,
} from "./status-reaction-lifecycle.js";

describe("status-reaction-lifecycle", () => {
  it("keeps waiting-fresh and waiting-backlog mutually exclusive per message", async () => {
    const setReaction = vi.fn(async (_emoji: string) => {});
    const removeReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m1",
      adapter: { setReaction, removeReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(true);
    await lifecycle.enterActive();
    await lifecycle.complete(true);

    const emojis = setReaction.mock.calls.map((call) => call[0]);
    expect(emojis).toContain("⏳");
    expect(emojis).not.toContain("👀");
  });

  it("specializes to coding at most once within the active window", async () => {
    vi.useFakeTimers();
    const setReaction = vi.fn(async (_emoji: string) => {});
    const removeReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m2",
      adapter: { setReaction, removeReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(false);
    await lifecycle.enterActive();
    lifecycle.noteToolActivity("exec");
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(300);

    lifecycle.noteToolActivity("browser");
    await Promise.resolve();
    await lifecycle.complete(true);

    expect(setReaction.mock.calls.map((call) => call[0])).toEqual(["👀", "🤔", "💻"]);
    expect(removeReaction.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(["👀", "🤔", "💻", "⏳", "🔍", "🔧"]),
    );
  });

  it("does not specialize after the 300ms active window closes", async () => {
    vi.useFakeTimers();
    const setReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m3",
      adapter: { setReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(false);
    await lifecycle.enterActive();
    await vi.advanceTimersByTimeAsync(301);

    lifecycle.noteToolActivity("exec");
    await Promise.resolve();
    await lifecycle.complete(true);

    expect(setReaction.mock.calls.map((call) => call[0])).toEqual(["👀", "🤔"]);
  });

  it("specializes to search immediately when observed within the active window", async () => {
    const setReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m4",
      adapter: { setReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(false);
    await lifecycle.enterActive();
    lifecycle.noteToolActivity("browser");
    await lifecycle.complete(true);

    expect(setReaction.mock.calls.map((call) => call[0])).toEqual(["👀", "🤔", "🔍"]);
  });

  it("specializes to generic tool immediately when observed within the active window", async () => {
    const setReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m4-tool",
      adapter: { setReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(false);
    await lifecycle.enterActive();
    lifecycle.noteToolActivity("custom_tool");
    await lifecycle.complete(true);

    expect(setReaction.mock.calls.map((call) => call[0])).toEqual(["👀", "🤔", "🔧"]);
  });

  it("records failed transition when active update fails", async () => {
    __testing.resetTraceEntriesForTests();
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m5",
      adapter: {
        setReaction: async (emoji: string) => {
          if (emoji === "🤔") {
            throw new Error("boom");
          }
        },
      },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(false);
    await lifecycle.enterActive();

    const failed = __testing
      .getTraceEntriesForTests()
      .filter((entry) => entry.messageId === "m5" && entry.stage === "failed")
      .map((entry) => entry.toState);
    expect(failed).toContain("active-base");
  });

  it("clears backlog waiting directly when the run ends before becoming active", async () => {
    const setReaction = vi.fn(async (_emoji: string) => {});
    const removeReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m6",
      adapter: { setReaction, removeReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(true);
    await lifecycle.complete(false);

    expect(setReaction.mock.calls.map((call) => call[0])).toEqual(["⏳"]);
    expect(removeReaction.mock.calls.map((call) => call[0])).toEqual(
      expect.arrayContaining(["👀", "⏳", "🤔", "💻", "🔍", "🔧"]),
    );
  });

  it("clears reactions directly on completion without terminal emoji", async () => {
    const setReaction = vi.fn(async (_emoji: string) => {});
    const removeReaction = vi.fn(async (_emoji: string) => {});
    const lifecycle = createDiscordStatusReactionLifecycle({
      enabled: true,
      messageId: "m7",
      adapter: { setReaction, removeReaction },
      projection: resolveDiscordStatusReactionProjection(undefined, "👀"),
    });

    await lifecycle.enterWaiting(false);
    await lifecycle.enterActive();
    await lifecycle.complete(false);

    expect(setReaction.mock.calls.map((call) => call[0])).toEqual(["👀", "🤔"]);
    expect(removeReaction).toHaveBeenCalled();
    expect(setReaction.mock.calls.map((call) => call[0])).not.toContain("✅");
    expect(setReaction.mock.calls.map((call) => call[0])).not.toContain("❌");
  });
});
