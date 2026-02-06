import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  sleep,
  executeUnrealToolAsync,
  executeUnrealTool,
} from "../../lib.js";
import { installFetchMock, installFetchReject } from "../helpers/mock-fetch.js";

const BASE_URL = "http://localhost:3000";
const TIMEOUT_MS = 5000;

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ─── sleep ───────────────────────────────────────────────────────────

describe("sleep", () => {
  it("resolves after the given delay", async () => {
    vi.useFakeTimers();
    const promise = sleep(100);
    vi.advanceTimersByTime(100);
    await expect(promise).resolves.toBeUndefined();
    vi.useRealTimers();
  });
});

// ─── executeUnrealToolAsync ──────────────────────────────────────────

describe("executeUnrealToolAsync", () => {
  it("submits task, polls, and returns result on completion", async () => {
    let callCount = 0;
    const spy = vi.fn(async (url, options) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "test-task-123" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        callCount++;
        const status = callCount >= 2 ? "completed" : "running";
        return {
          ok: true,
          json: async () => ({
            data: {
              status,
              progress: callCount,
              total: 3,
              progress_message: `Step ${callCount}/3`,
            },
          }),
        };
      }
      if (url.includes("/task_result")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "Actors found",
            data: { actors: ["Actor1", "Actor2"] },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "get_actors", {},
      { pollIntervalMs: 10, asyncTimeoutMs: 5000 }
    );

    expect(result.success).toBe(true);
    expect(result.data.actors).toEqual(["Actor1", "Actor2"]);
    // Verify task_submit was called
    const submitCall = spy.mock.calls.find((c) => c[0].includes("/task_submit"));
    expect(submitCall).toBeDefined();
    const submitBody = JSON.parse(submitCall[1].body);
    expect(submitBody.tool_name).toBe("get_actors");
  });

  it("falls back to sync when task_submit returns no task_id", async () => {
    const spy = vi.fn(async (url, options) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({ success: false, message: "Task queue unavailable" }),
        };
      }
      // Sync fallback call to /mcp/tool/get_actors
      if (url.includes("/mcp/tool/get_actors")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "Actors found (sync)",
            data: { actors: ["SyncActor"] },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "get_actors", {},
      { pollIntervalMs: 10 }
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("sync");
  });

  it("falls back to sync when task_submit throws a network error", async () => {
    let firstCall = true;
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit") && firstCall) {
        firstCall = false;
        throw new Error("ECONNREFUSED");
      }
      // Sync fallback
      if (url.includes("/mcp/tool/spawn_actor")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "Spawned (sync fallback)",
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "spawn_actor", {},
      { pollIntervalMs: 10 }
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("sync fallback");
  });

  it("invokes onProgress callback during polling", async () => {
    let callCount = 0;
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "progress-task" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            data: {
              status: callCount >= 3 ? "completed" : "running",
              progress: callCount,
              total: 3,
              progress_message: `Step ${callCount}`,
            },
          }),
        };
      }
      if (url.includes("/task_result")) {
        return {
          ok: true,
          json: async () => ({ success: true, message: "Done" }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const progressUpdates = [];
    const onProgress = (update) => progressUpdates.push(update);

    await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "some_tool", {},
      { onProgress, pollIntervalMs: 10, asyncTimeoutMs: 5000 }
    );

    expect(progressUpdates.length).toBeGreaterThanOrEqual(2);
    expect(progressUpdates[0]).toHaveProperty("progress");
    expect(progressUpdates[0]).toHaveProperty("total");
    expect(progressUpdates[0]).toHaveProperty("message");
  });

  it("returns timeout error when async timeout is exceeded", async () => {
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "timeout-task" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        return {
          ok: true,
          json: async () => ({
            data: { status: "running", progress: 1, total: 100, progress_message: "Still running" },
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "slow_tool", {},
      { pollIntervalMs: 10, asyncTimeoutMs: 50 }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("timed out");
    expect(result.message).toContain("timeout-task");
  });

  it("handles failed task status correctly", async () => {
    let callCount = 0;
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "fail-task" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        callCount++;
        return {
          ok: true,
          json: async () => ({
            data: {
              status: callCount >= 2 ? "failed" : "running",
              progress: callCount,
              total: 0,
              progress_message: "Running...",
            },
          }),
        };
      }
      if (url.includes("/task_result")) {
        return {
          ok: true,
          json: async () => ({
            success: false,
            message: "Blueprint compilation failed",
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "blueprint_compile", {},
      { pollIntervalMs: 10, asyncTimeoutMs: 5000 }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("compilation failed");
  });

  it("handles cancelled task status correctly", async () => {
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "cancel-task" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        return {
          ok: true,
          json: async () => ({
            data: { status: "cancelled", progress: 0, total: 0, progress_message: "Cancelled" },
          }),
        };
      }
      if (url.includes("/task_result")) {
        return {
          ok: true,
          json: async () => ({
            success: false,
            message: "Task was cancelled",
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "some_tool", {},
      { pollIntervalMs: 10, asyncTimeoutMs: 5000 }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("cancelled");
  });

  it("continues polling when task_status request fails", async () => {
    let callCount = 0;
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "retry-task" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        callCount++;
        if (callCount === 1) {
          throw new Error("Network blip");
        }
        return {
          ok: true,
          json: async () => ({
            data: { status: "completed", progress: 2, total: 2, progress_message: "Done" },
          }),
        };
      }
      if (url.includes("/task_result")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            message: "Completed after retry",
          }),
        };
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "some_tool", {},
      { pollIntervalMs: 10, asyncTimeoutMs: 5000 }
    );

    expect(result.success).toBe(true);
    expect(result.message).toContain("Completed after retry");
  });

  it("returns error when task_result fetch fails", async () => {
    let callCount = 0;
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            data: { task_id: "result-fail-task" },
          }),
        };
      }
      if (url.includes("/task_status")) {
        return {
          ok: true,
          json: async () => ({
            data: { status: "completed", progress: 1, total: 1, progress_message: "Done" },
          }),
        };
      }
      if (url.includes("/task_result")) {
        throw new Error("Connection reset");
      }
      return { ok: false, json: async () => ({}) };
    });
    vi.stubGlobal("fetch", spy);

    const result = await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "some_tool", {},
      { pollIntervalMs: 10, asyncTimeoutMs: 5000 }
    );

    expect(result.success).toBe(false);
    expect(result.message).toContain("failed to retrieve result");
  });

  it("sends correct payload in task_submit request", async () => {
    const spy = vi.fn(async (url) => {
      if (url.includes("/task_submit")) {
        return {
          ok: true,
          json: async () => ({ success: false }),
        };
      }
      // Sync fallback
      return {
        ok: true,
        json: async () => ({ success: true, message: "Fallback" }),
      };
    });
    vi.stubGlobal("fetch", spy);

    await executeUnrealToolAsync(
      BASE_URL, TIMEOUT_MS, "asset_search",
      { query: "BP_*", path: "/Game" },
      { asyncTimeoutMs: 60000 }
    );

    const submitCall = spy.mock.calls.find((c) => c[0].includes("/task_submit"));
    const body = JSON.parse(submitCall[1].body);
    expect(body.tool_name).toBe("asset_search");
    expect(body.params).toEqual({ query: "BP_*", path: "/Game" });
    expect(body.timeout_ms).toBe(60000);
  });
});
