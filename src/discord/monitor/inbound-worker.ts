import { type RequestClient } from "@buape/carbon";
import { createRunStateMachine } from "../../channels/run-state-machine.js";
import { danger } from "../../globals.js";
import { formatDurationSeconds } from "../../infra/format-time/format-duration.ts";
import { KeyedAsyncQueue } from "../../plugin-sdk/keyed-async-queue.js";
import { reactMessageDiscord } from "../send.js";
import { materializeDiscordInboundJob, type DiscordInboundJob } from "./inbound-job.js";
import type { RuntimeEnv } from "./message-handler.preflight.types.js";
import { processDiscordMessage } from "./message-handler.process.js";
import { resolveDiscordStatusReactionProjection } from "./status-reaction-lifecycle.js";
import type { DiscordMonitorStatusSink } from "./status.js";
import { normalizeDiscordInboundWorkerTimeoutMs, runDiscordTaskWithTimeout } from "./timeouts.js";

type DiscordInboundWorkerParams = {
  runtime: RuntimeEnv;
  setStatus?: DiscordMonitorStatusSink;
  abortSignal?: AbortSignal;
  runTimeoutMs?: number;
};

export type DiscordInboundWorker = {
  enqueue: (job: DiscordInboundJob) => void;
  deactivate: () => void;
};

function formatDiscordRunContextSuffix(job: DiscordInboundJob): string {
  const channelId = job.payload.messageChannelId?.trim();
  const messageId = job.payload.data?.message?.id?.trim();
  const details = [
    channelId ? `channelId=${channelId}` : null,
    messageId ? `messageId=${messageId}` : null,
  ].filter((entry): entry is string => Boolean(entry));
  if (details.length === 0) {
    return "";
  }
  return ` (${details.join(", ")})`;
}

async function processDiscordInboundJob(params: {
  job: DiscordInboundJob;
  runtime: RuntimeEnv;
  lifecycleSignal?: AbortSignal;
  runTimeoutMs?: number;
}) {
  const timeoutMs = normalizeDiscordInboundWorkerTimeoutMs(params.runTimeoutMs);
  const contextSuffix = formatDiscordRunContextSuffix(params.job);
  await runDiscordTaskWithTimeout({
    run: async (abortSignal) => {
      await processDiscordMessage(materializeDiscordInboundJob(params.job, abortSignal));
    },
    timeoutMs,
    abortSignals: [params.job.runtime.abortSignal, params.lifecycleSignal],
    onTimeout: (resolvedTimeoutMs) => {
      params.runtime.error?.(
        danger(
          `discord inbound worker timed out after ${formatDurationSeconds(resolvedTimeoutMs, {
            decimals: 1,
            unit: "seconds",
          })}${contextSuffix}`,
        ),
      );
    },
    onErrorAfterTimeout: (error) => {
      params.runtime.error?.(
        danger(`discord inbound worker failed after timeout: ${String(error)}${contextSuffix}`),
      );
    },
  });
}

async function maybeShowQueuedBacklogReaction(job: DiscordInboundJob): Promise<void> {
  if (job.payload.cfg?.messages?.statusReactions?.enabled !== true) {
    return;
  }

  const messageId = job.payload.message?.id?.trim();
  const channelId = job.payload.messageChannelId?.trim();
  if (!messageId || !channelId) {
    return;
  }

  const emoji = resolveDiscordStatusReactionProjection(
    job.payload.cfg.messages?.statusReactions?.emojis,
  ).waitingBacklog;
  await reactMessageDiscord(channelId, messageId, emoji, {
    rest: job.runtime.client.rest as unknown as RequestClient,
  });
}

export function createDiscordInboundWorker(
  params: DiscordInboundWorkerParams,
): DiscordInboundWorker {
  const runQueue = new KeyedAsyncQueue();
  const runState = createRunStateMachine({
    setStatus: params.setStatus,
    abortSignal: params.abortSignal,
  });
  const queuedRunsByKey = new Map<string, number>();

  return {
    enqueue(job) {
      const existingRuns = queuedRunsByKey.get(job.queueKey) ?? 0;
      queuedRunsByKey.set(job.queueKey, existingRuns + 1);
      if (existingRuns > 0) {
        void maybeShowQueuedBacklogReaction(job).catch((error) => {
          params.runtime.error?.(
            danger(`discord queued backlog reaction failed: ${String(error)}`),
          );
        });
      }
      void runQueue
        .enqueue(job.queueKey, async () => {
          if (!runState.isActive()) {
            return;
          }
          runState.onRunStart();
          try {
            if (!runState.isActive()) {
              return;
            }
            await processDiscordInboundJob({
              job,
              runtime: params.runtime,
              lifecycleSignal: params.abortSignal,
              runTimeoutMs: params.runTimeoutMs,
            });
          } finally {
            runState.onRunEnd();
          }
        })
        .catch((error) => {
          params.runtime.error?.(danger(`discord inbound worker failed: ${String(error)}`));
        })
        .finally(() => {
          const remainingRuns = Math.max(0, (queuedRunsByKey.get(job.queueKey) ?? 1) - 1);
          if (remainingRuns === 0) {
            queuedRunsByKey.delete(job.queueKey);
            return;
          }
          queuedRunsByKey.set(job.queueKey, remainingRuns);
        });
    },
    deactivate: runState.deactivate,
  };
}
