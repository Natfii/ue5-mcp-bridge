/**
 * Integration tests for the ListTools handler logic.
 *
 * These tests compose the extracted lib functions with the context-loader
 * to replicate the ListTools handler behavior from index.js, verifying
 * the full integration between HTTP client, schema conversion, and context system.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  fetchUnrealTools,
  checkUnrealConnection,
  convertToMCPSchema,
  convertAnnotations,
} from "../../lib.js";
import { classifyTool, ROUTER_TOOL_SCHEMA } from "../../tool-router.js";
import {
  installFetchMock,
  installFetchReject,
} from "../helpers/mock-fetch.js";
import {
  UNREAL_STATUS_RESPONSE,
  UNREAL_TOOLS_RESPONSE,
} from "../helpers/fixtures.js";

// Mock fs so context-loader doesn't hit disk
vi.mock("fs", () => ({
  readFileSync: vi.fn(() => "# Mock Context"),
  existsSync: vi.fn(() => true),
}));

import { listCategories } from "../../context-loader.js";

const BASE_URL = "http://localhost:3000";
const TIMEOUT_MS = 5000;
const DEFAULT_TTL_MS = 30000;

// Simulated tool cache (mirrors toolCache in index.js)
let toolCache = { tools: [], timestamp: 0 };

beforeEach(() => {
  vi.unstubAllGlobals();
  toolCache = { tools: [], timestamp: 0 };
});

/**
 * Replicate the ListTools handler logic from index.js (with TTL cache)
 */
async function simulateListTools({ toolCacheTtlMs = DEFAULT_TTL_MS } = {}) {
  const status = await checkUnrealConnection(BASE_URL, TIMEOUT_MS);

  if (!status.connected) {
    return {
      tools: [
        {
          name: "unreal_status",
          description:
            "Check if Unreal Editor is running with the plugin. Currently: NOT CONNECTED. Please start Unreal Editor with the plugin enabled.",
          inputSchema: { type: "object", properties: {} },
        },
      ],
    };
  }

  let unrealTools;
  const cacheAge = Date.now() - toolCache.timestamp;
  if (toolCache.tools.length > 0 && cacheAge < toolCacheTtlMs) {
    unrealTools = toolCache.tools;
  } else {
    unrealTools = await fetchUnrealTools(BASE_URL, TIMEOUT_MS);
    toolCache = { tools: unrealTools, timestamp: Date.now() };
  }

  const mcpTools = [];

  // 1. Status first
  mcpTools.push({
    name: "unreal_status",
    description: `Check Unreal Editor connection status. Currently: CONNECTED to ${status.projectName || "Unknown Project"} (${status.engineVersion || "Unknown"})`,
    inputSchema: { type: "object", properties: {} },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  });

  // 2. Simple tools only
  for (const tool of unrealTools) {
    if (classifyTool(tool.name) === "simple") {
      mcpTools.push({
        name: `unreal_${tool.name}`,
        description: tool.description,
        inputSchema: convertToMCPSchema(tool.parameters, true),
        annotations: convertAnnotations(tool.annotations),
      });
    }
  }

  // 3. Router tool
  mcpTools.push(ROUTER_TOOL_SCHEMA);

  // 4. Context tool last
  mcpTools.push({
    name: "unreal_get_ue_context",
    description: `Get Unreal Engine 5.7 API context/documentation. Categories: ${listCategories().join(", ")}.`,
    inputSchema: {
      type: "object",
      properties: {
        category: { type: "string" },
        query: { type: "string" },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  });

  return { tools: mcpTools };
}

// ─── Disconnected state ──────────────────────────────────────────────

describe("ListTools — disconnected", () => {
  it("returns only unreal_status tool when Unreal is not connected", async () => {
    installFetchReject(new Error("ECONNREFUSED"));
    const result = await simulateListTools();
    expect(result.tools).toHaveLength(1);
    expect(result.tools[0].name).toBe("unreal_status");
    expect(result.tools[0].description).toContain("NOT CONNECTED");
  });
});

// ─── Connected state ─────────────────────────────────────────────────

describe("ListTools — connected", () => {
  beforeEach(() => {
    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);
  });

  it("puts unreal_status first", async () => {
    const result = await simulateListTools();
    expect(result.tools[0].name).toBe("unreal_status");
  });

  it("includes unreal_status description with project info", async () => {
    const result = await simulateListTools();
    expect(result.tools[0].description).toContain("CONNECTED");
    expect(result.tools[0].description).toContain("MyGame");
  });

  it("maps Unreal tools with unreal_ prefix and original description", async () => {
    const result = await simulateListTools();
    const spawnTool = result.tools.find((t) => t.name === "unreal_spawn_actor");
    expect(spawnTool).toBeDefined();
    expect(spawnTool.description).toBe("Spawn an actor in the current level");
  });

  it("puts unreal_get_ue_context last", async () => {
    const result = await simulateListTools();
    const last = result.tools[result.tools.length - 1];
    expect(last.name).toBe("unreal_get_ue_context");
  });

  it("total count = simple tools + 3 (status + router + context)", async () => {
    const result = await simulateListTools();
    const simpleCount = UNREAL_TOOLS_RESPONSE.tools.filter(
      t => classifyTool(t.name) === "simple"
    ).length;
    expect(result.tools).toHaveLength(simpleCount + 3);
  });

  it("converts tool parameters to MCP inputSchema", async () => {
    const result = await simulateListTools();
    const spawnTool = result.tools.find((t) => t.name === "unreal_spawn_actor");
    expect(spawnTool.inputSchema.type).toBe("object");
    expect(spawnTool.inputSchema.properties.class_name.type).toBe("string");
    expect(spawnTool.inputSchema.required).toContain("class_name");
  });

  it("converts tool annotations", async () => {
    const result = await simulateListTools();
    const statusTool = result.tools.find((t) => t.name === "unreal_status");
    expect(statusTool.annotations.readOnlyHint).toBe(true);
    expect(statusTool.annotations.destructiveHint).toBe(false);
  });
});

// ─── Empty tools ─────────────────────────────────────────────────────

describe("ListTools — empty tool list from Unreal", () => {
  it("returns status + router + context tools when Unreal has no tools", async () => {
    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: { tools: [] } },
    ]);
    const result = await simulateListTools();
    expect(result.tools).toHaveLength(3);
    expect(result.tools[0].name).toBe("unreal_status");
    expect(result.tools[1].name).toBe("unreal_ue");
    expect(result.tools[2].name).toBe("unreal_get_ue_context");
  });
});

// ─── TTL cache ────────────────────────────────────────────────────────

describe("ListTools — TTL cache", () => {
  it("uses cached tools on second call within TTL", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);

    // First call — populates cache
    await simulateListTools();
    const toolsFetchCount1 = spy.mock.calls.filter(c => c[0].includes("/mcp/tools")).length;
    expect(toolsFetchCount1).toBe(1);

    // Second call — should use cache, no new /mcp/tools fetch
    await simulateListTools();
    const toolsFetchCount2 = spy.mock.calls.filter(c => c[0].includes("/mcp/tools")).length;
    expect(toolsFetchCount2).toBe(1); // still 1, no re-fetch
  });

  it("re-fetches tools after cache expires", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);

    // First call — populates cache
    await simulateListTools({ toolCacheTtlMs: 1 });

    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));

    // Second call — cache expired, should re-fetch
    await simulateListTools({ toolCacheTtlMs: 1 });
    const toolsFetchCount = spy.mock.calls.filter(c => c[0].includes("/mcp/tools")).length;
    expect(toolsFetchCount).toBe(2);
  });

  it("still checks connection on every call even with cached tools", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);

    await simulateListTools();
    await simulateListTools();

    const statusFetchCount = spy.mock.calls.filter(c => c[0].includes("/mcp/status")).length;
    expect(statusFetchCount).toBe(2);
  });

  it("returns same tool count from cache as from fresh fetch", async () => {
    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);

    const result1 = await simulateListTools();
    const result2 = await simulateListTools();
    expect(result1.tools).toHaveLength(result2.tools.length);
  });
});

// ─── Router filtering ───────────────────────────────────────────────

describe("ListTools — router filtering", () => {
  beforeEach(() => {
    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);
  });

  it("includes unreal_ue router tool", async () => {
    const result = await simulateListTools();
    const router = result.tools.find(t => t.name === "unreal_ue");
    expect(router).toBeDefined();
    expect(router.inputSchema.required).toContain("domain");
    expect(router.inputSchema.required).toContain("operation");
  });

  it("includes simple tools (spawn_actor)", async () => {
    const result = await simulateListTools();
    expect(result.tools.find(t => t.name === "unreal_spawn_actor")).toBeDefined();
  });

  it("excludes mega tools (blueprint_modify, get_actors)", async () => {
    const result = await simulateListTools();
    expect(result.tools.find(t => t.name === "unreal_blueprint_modify")).toBeUndefined();
    expect(result.tools.find(t => t.name === "unreal_get_actors")).toBeUndefined();
  });

  it("excludes hidden tools (task_submit)", async () => {
    const result = await simulateListTools();
    expect(result.tools.find(t => t.name === "unreal_task_submit")).toBeUndefined();
    expect(result.tools.find(t => t.name === "unreal_execute_script")).toBeUndefined();
  });
});
