import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchWithTimeout,
  fetchUnrealTools,
  executeUnrealTool,
  checkUnrealConnection,
} from "../../lib.js";
import {
  installFetchMock,
  installFetchReject,
  mockResponse,
} from "../helpers/mock-fetch.js";
import {
  UNREAL_TOOLS_RESPONSE,
  UNREAL_STATUS_RESPONSE,
  TOOL_EXECUTE_SUCCESS,
  TOOL_EXECUTE_FAILURE,
} from "../helpers/fixtures.js";

const BASE_URL = "http://localhost:3000";
const TIMEOUT_MS = 5000;

beforeEach(() => {
  vi.unstubAllGlobals();
});

// ─── fetchWithTimeout ────────────────────────────────────────────────

describe("fetchWithTimeout", () => {
  it("returns the fetch response on success", async () => {
    installFetchMock([{ pattern: /example/, body: { ok: true } }]);
    const res = await fetchWithTimeout("http://example.com", {}, 5000);
    expect(res.ok).toBe(true);
    const json = await res.json();
    expect(json).toEqual({ ok: true });
  });

  it("aborts when the timeout elapses", async () => {
    vi.useFakeTimers();
    // fetch that never resolves until abort
    const spy = vi.fn((url, opts) => {
      return new Promise((resolve, reject) => {
        opts.signal.addEventListener("abort", () => {
          const err = new Error("The operation was aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    });
    vi.stubGlobal("fetch", spy);

    const promise = fetchWithTimeout("http://example.com", {}, 100);
    vi.advanceTimersByTime(101);

    await expect(promise).rejects.toThrow("aborted");
    vi.useRealTimers();
  });

  it("clears the timeout on success", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    installFetchMock([{ pattern: /example/, body: {} }]);
    await fetchWithTimeout("http://example.com", {}, 5000);
    expect(clearSpy).toHaveBeenCalled();
  });

  it("clears the timeout on fetch error", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    installFetchReject(new Error("network down"));
    await expect(fetchWithTimeout("http://example.com", {}, 5000)).rejects.toThrow("network down");
    expect(clearSpy).toHaveBeenCalled();
  });
});

// ─── fetchUnrealTools ────────────────────────────────────────────────

describe("fetchUnrealTools", () => {
  it("returns parsed tools array on success", async () => {
    installFetchMock([
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);
    const tools = await fetchUnrealTools(BASE_URL, TIMEOUT_MS);
    expect(tools).toHaveLength(UNREAL_TOOLS_RESPONSE.tools.length);
    expect(tools[0].name).toBe("spawn_actor");
  });

  it("returns empty array on HTTP error", async () => {
    installFetchMock([
      { pattern: "/mcp/tools", body: {}, response: { status: 500, statusText: "Internal Server Error" } },
    ]);
    const tools = await fetchUnrealTools(BASE_URL, TIMEOUT_MS);
    expect(tools).toEqual([]);
  });

  it("returns empty array on network error", async () => {
    installFetchReject(new Error("ECONNREFUSED"));
    const tools = await fetchUnrealTools(BASE_URL, TIMEOUT_MS);
    expect(tools).toEqual([]);
  });

  it("returns empty array on abort/timeout", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    installFetchReject(abortErr);
    const tools = await fetchUnrealTools(BASE_URL, TIMEOUT_MS);
    expect(tools).toEqual([]);
  });

  it("calls the correct URL", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tools", body: { tools: [] } },
    ]);
    await fetchUnrealTools(BASE_URL, TIMEOUT_MS);
    expect(spy).toHaveBeenCalled();
    const calledUrl = spy.mock.calls[0][0];
    expect(calledUrl).toBe(`${BASE_URL}/mcp/tools`);
  });
});

// ─── executeUnrealTool ───────────────────────────────────────────────

describe("executeUnrealTool", () => {
  it("sends a POST with JSON body", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/spawn_actor", body: TOOL_EXECUTE_SUCCESS },
    ]);
    await executeUnrealTool(BASE_URL, TIMEOUT_MS, "spawn_actor", { class_name: "BP_Enemy" });
    const [, opts] = spy.mock.calls[0];
    expect(opts.method).toBe("POST");
    expect(opts.headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(opts.body)).toEqual({ class_name: "BP_Enemy" });
  });

  it("calls the correct URL with tool name", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/get_actors", body: TOOL_EXECUTE_SUCCESS },
    ]);
    await executeUnrealTool(BASE_URL, TIMEOUT_MS, "get_actors", {});
    expect(spy.mock.calls[0][0]).toBe(`${BASE_URL}/mcp/tool/get_actors`);
  });

  it("returns the parsed JSON response on success", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/spawn_actor", body: TOOL_EXECUTE_SUCCESS },
    ]);
    const result = await executeUnrealTool(BASE_URL, TIMEOUT_MS, "spawn_actor", {});
    expect(result.success).toBe(true);
    expect(result.data.actorName).toBe("BP_Enemy_42");
  });

  it("returns error object on network failure", async () => {
    installFetchReject(new Error("ECONNREFUSED"));
    const result = await executeUnrealTool(BASE_URL, TIMEOUT_MS, "spawn_actor", {});
    expect(result.success).toBe(false);
    expect(result.message).toContain("ECONNREFUSED");
  });

  it("includes timeout ms in abort error message", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    installFetchReject(abortErr);
    const result = await executeUnrealTool(BASE_URL, TIMEOUT_MS, "spawn_actor", {});
    expect(result.success).toBe(false);
    expect(result.message).toContain(`${TIMEOUT_MS}ms`);
  });

  it("sends empty object when args is null", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/test", body: TOOL_EXECUTE_SUCCESS },
    ]);
    await executeUnrealTool(BASE_URL, TIMEOUT_MS, "test", null);
    const body = JSON.parse(spy.mock.calls[0][1].body);
    expect(body).toEqual({});
  });
});

// ─── checkUnrealConnection ───────────────────────────────────────────

describe("checkUnrealConnection", () => {
  it("returns connected:true with spread data on success", async () => {
    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
    ]);
    const status = await checkUnrealConnection(BASE_URL, TIMEOUT_MS);
    expect(status.connected).toBe(true);
    expect(status.projectName).toBe("MyGame");
    expect(status.engineVersion).toBe("5.7.1");
  });

  it("returns connected:false with HTTP status reason on non-ok", async () => {
    installFetchMock([
      { pattern: "/mcp/status", body: {}, response: { status: 503, statusText: "Service Unavailable" } },
    ]);
    const status = await checkUnrealConnection(BASE_URL, TIMEOUT_MS);
    expect(status.connected).toBe(false);
    expect(status.reason).toBe("HTTP 503");
  });

  it("returns connected:false with timeout reason on abort", async () => {
    const abortErr = new Error("The operation was aborted");
    abortErr.name = "AbortError";
    installFetchReject(abortErr);
    const status = await checkUnrealConnection(BASE_URL, TIMEOUT_MS);
    expect(status.connected).toBe(false);
    expect(status.reason).toBe("timeout");
  });

  it("returns connected:false with error message on network error", async () => {
    installFetchReject(new Error("ECONNREFUSED"));
    const status = await checkUnrealConnection(BASE_URL, TIMEOUT_MS);
    expect(status.connected).toBe(false);
    expect(status.reason).toBe("ECONNREFUSED");
  });
});
