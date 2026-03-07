/**
 * Integration tests for the CallTool handler logic.
 *
 * These tests compose the extracted lib functions with the context-loader
 * to replicate the CallTool handler behavior from index.js.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  executeUnrealTool,
  executeUnrealToolAsync,
  checkUnrealConnection,
  fetchUnrealTools,
} from "../../lib.js";
import { resolveUnrealTool } from "../../tool-router.js";
import {
  installFetchMock,
  installFetchReject,
} from "../helpers/mock-fetch.js";
import {
  UNREAL_STATUS_RESPONSE,
  UNREAL_TOOLS_RESPONSE,
  TOOL_EXECUTE_SUCCESS,
  TOOL_EXECUTE_FAILURE,
} from "../helpers/fixtures.js";

// Mock fs so context-loader works without disk
vi.mock("fs", () => ({
  readFileSync: vi.fn((filepath) => {
    const filename = filepath.replace(/\\/g, "/").split("/").pop();
    const stubs = {
      "animation.md": "# Animation Context\nAnimation content.",
      "blueprint.md": "# Blueprint Context\nBlueprint content.",
      "slate.md": "# Slate Context",
      "actor.md": "# Actor Context",
      "assets.md": "# Assets Context",
      "replication.md": "# Replication Context",
      "enhanced_input.md": "# Enhanced Input Context",
      "character.md": "# Character Context",
      "material.md": "# Material Context",
    };
    if (stubs[filename]) return stubs[filename];
    throw new Error(`ENOENT: ${filepath}`);
  }),
  existsSync: vi.fn(() => true),
}));

import {
  getContextForTool,
  getContextForQuery,
  listCategories,
  getCategoryInfo,
  loadContextForCategory,
  clearCache,
} from "../../context-loader.js";

const BASE_URL = "http://localhost:3000";
const TIMEOUT_MS = 5000;

// Simulated tool cache (mirrors toolCache in index.js)
let toolCache = { tools: [], timestamp: 0 };

beforeEach(() => {
  vi.unstubAllGlobals();
  clearCache();
  toolCache = { tools: [], timestamp: 0 };
});

/**
 * Replicate the CallTool handler logic from index.js
 * (updated to match lightweight status + read-only bypass)
 */
async function simulateCallTool(name, args, { injectContext = false, asyncEnabled = true } = {}) {
  // Handle UE context request
  if (name === "unreal_get_ue_context") {
    const { category, query } = args || {};

    let result = null;
    let matchedCategories = [];

    if (category) {
      const content = loadContextForCategory(category);
      if (content) {
        result = content;
        matchedCategories = [category];
      } else {
        return {
          content: [{ type: "text", text: `Unknown category: ${category}. Available categories: ${listCategories().join(", ")}` }],
          isError: true,
        };
      }
    } else if (query) {
      const queryResult = getContextForQuery(query);
      if (queryResult) {
        result = queryResult.content;
        matchedCategories = queryResult.categories;
      } else {
        return {
          content: [{ type: "text", text: `No context found for query: "${query}". Try categories: ${listCategories().join(", ")}` }],
          isError: false,
        };
      }
    } else {
      const categoryList = listCategories().map((cat) => {
        const info = getCategoryInfo(cat);
        return `- **${cat}**: Keywords: ${info.keywords.slice(0, 5).join(", ")}...`;
      });
      return {
        content: [{ type: "text", text: `# Available UE 5.7 Context Categories\n\n${categoryList.join("\n")}\n\nUse \`category\` param for specific context or \`query\` to search by keywords.` }],
      };
    }

    return {
      content: [{ type: "text", text: `# UE 5.7 Context: ${matchedCategories.join(", ")}\n\n${result}` }],
    };
  }

  // Handle status check (lightweight — uses cached tools, no context probe)
  if (name === "unreal_status") {
    const status = await checkUnrealConnection(BASE_URL, TIMEOUT_MS);
    if (status.connected) {
      const unrealTools = toolCache.tools;
      const categories = {};

      for (const tool of unrealTools) {
        let category = "utility";
        if (tool.name.startsWith("blueprint_")) category = "blueprint";
        else if (tool.name.startsWith("anim_blueprint")) category = "animation";
        else if (tool.name.startsWith("asset_")) category = "asset";
        else if (tool.name.startsWith("task_")) category = "task_queue";
        else if (tool.name.includes("actor") || tool.name.includes("spawn") || tool.name.includes("move") || tool.name.includes("level")) category = "actor";
        categories[category] = (categories[category] || 0) + 1;
      }

      const contextCategories = listCategories();

      const response = {
        connected: true,
        project: status.projectName,
        engine: status.engineVersion,
        context_categories: contextCategories.length,
        tool_summary: categories,
        total_tools: unrealTools.length,
        message: "Unreal Editor connected. All tools operational.",
      };
      return {
        content: [{ type: "text", text: JSON.stringify(response, null, 2) }],
      };
    } else {
      return {
        content: [{ type: "text", text: JSON.stringify({ connected: false, reason: status.reason, message: "Unreal Editor is not running or the plugin is not enabled. Please start Unreal Editor with the plugin." }, null, 2) }],
        isError: true,
      };
    }
  }

  // Router tool
  if (name === "unreal_ue") {
    const { domain, operation, params: routerParams } = args || {};

    if (!domain || !operation) {
      return {
        content: [{ type: "text", text: "Error: unreal_ue requires 'domain' and 'operation' parameters." }],
        isError: true,
      };
    }

    const targetTool = resolveUnrealTool(domain, operation);
    if (!targetTool) {
      return {
        content: [{ type: "text", text: `Error: Unknown domain "${domain}". Valid domains: blueprint, anim, character, enhanced_input, material, asset` }],
        isError: true,
      };
    }

    const unrealArgs = { operation, ...(routerParams || {}) };

    let result;
    if (asyncEnabled) {
      result = await executeUnrealToolAsync(BASE_URL, TIMEOUT_MS, targetTool, unrealArgs, {
        pollIntervalMs: 100,
        asyncTimeoutMs: 5000,
      });
    } else {
      result = await executeUnrealTool(BASE_URL, TIMEOUT_MS, targetTool, unrealArgs);
    }

    let responseText = result.success
      ? result.message + (result.data ? "\n\n" + JSON.stringify(result.data) : "")
      : `Error: ${result.message}`;

    if (injectContext && result.success) {
      const context = getContextForTool(targetTool);
      if (context) {
        responseText += `\n\n---\n\n## Relevant UE 5.7 API Context\n\n${context}`;
      }
    }

    return {
      content: [{ type: "text", text: responseText }],
      isError: !result.success,
    };
  }

  // Unknown tool
  if (!name.startsWith("unreal_")) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  // Proxy to Unreal (with read-only bypass)
  const toolName = name.substring(7);
  const isTaskTool = toolName.startsWith("task_");
  const cachedTool = toolCache.tools.find(t => t.name === toolName);
  const isReadOnly = cachedTool?.annotations?.readOnlyHint === true;

  let result;
  if (asyncEnabled && !isTaskTool && !isReadOnly) {
    result = await executeUnrealToolAsync(BASE_URL, TIMEOUT_MS, toolName, args, {
      pollIntervalMs: 100,
      asyncTimeoutMs: 5000,
    });
  } else {
    result = await executeUnrealTool(BASE_URL, TIMEOUT_MS, toolName, args);
  }

  let responseText = result.success
    ? result.message + (result.data ? "\n\n" + JSON.stringify(result.data) : "")
    : `Error: ${result.message}`;

  if (injectContext && result.success) {
    const context = getContextForTool(toolName);
    if (context) {
      responseText += `\n\n---\n\n## Relevant UE 5.7 API Context\n\n${context}`;
    }
  }

  return {
    content: [{ type: "text", text: responseText }],
    isError: !result.success,
  };
}

// ─── unreal_get_ue_context ───────────────────────────────────────────

describe("CallTool — unreal_get_ue_context", () => {
  it("returns category listing when no params provided", async () => {
    const result = await simulateCallTool("unreal_get_ue_context", {});
    expect(result.content[0].text).toContain("Available UE 5.7 Context Categories");
    expect(result.isError).toBeUndefined();
  });

  it("returns content for a valid category", async () => {
    const result = await simulateCallTool("unreal_get_ue_context", { category: "animation" });
    expect(result.content[0].text).toContain("Animation Context");
    expect(result.isError).toBeUndefined();
  });

  it("returns error for unknown category", async () => {
    const result = await simulateCallTool("unreal_get_ue_context", { category: "nonexistent" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown category");
  });

  it("returns query results for matching keywords", async () => {
    const result = await simulateCallTool("unreal_get_ue_context", { query: "animation blend" });
    expect(result.content[0].text).toContain("Animation Context");
  });

  it("returns no-match message for query with no hits", async () => {
    const result = await simulateCallTool("unreal_get_ue_context", { query: "zzz_nothing_zzz" });
    expect(result.content[0].text).toContain("No context found");
    expect(result.isError).toBe(false);
  });
});

// ─── unreal_status (lightweight) ─────────────────────────────────────

describe("CallTool — unreal_status", () => {
  it("returns connected JSON with context_categories and tool_summary from cache", async () => {
    // Pre-populate the tool cache (as list_tools would have done)
    toolCache = { tools: UNREAL_TOOLS_RESPONSE.tools, timestamp: Date.now() };

    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
    ]);
    const result = await simulateCallTool("unreal_status", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(true);
    expect(parsed.tool_summary).toBeDefined();
    expect(parsed.context_categories).toBeTypeOf("number");
    expect(parsed.total_tools).toBe(UNREAL_TOOLS_RESPONSE.tools.length);
    expect(result.isError).toBeUndefined();
  });

  it("does not fetch /mcp/tools (uses cache)", async () => {
    toolCache = { tools: UNREAL_TOOLS_RESPONSE.tools, timestamp: Date.now() };

    const spy = installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
      { pattern: "/mcp/tools", body: UNREAL_TOOLS_RESPONSE },
    ]);
    await simulateCallTool("unreal_status", {});
    const toolsFetched = spy.mock.calls.filter(c => c[0].includes("/mcp/tools")).length;
    expect(toolsFetched).toBe(0);
  });

  it("returns 0 total_tools when cache is empty", async () => {
    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
    ]);
    const result = await simulateCallTool("unreal_status", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.total_tools).toBe(0);
  });

  it("returns disconnected JSON with isError", async () => {
    installFetchReject(new Error("ECONNREFUSED"));
    const result = await simulateCallTool("unreal_status", {});
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.connected).toBe(false);
    expect(result.isError).toBe(true);
  });
});

// ─── unreal_* proxy ──────────────────────────────────────────────────

describe("CallTool — unreal tool proxy", () => {
  it("strips unreal_ prefix and proxies to Unreal", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/spawn_actor", body: TOOL_EXECUTE_SUCCESS },
    ]);
    const result = await simulateCallTool("unreal_spawn_actor", { class_name: "BP_Enemy" }, { asyncEnabled: false });
    expect(spy.mock.calls[0][0]).toContain("/mcp/tool/spawn_actor");
    expect(result.content[0].text).toContain("Actor spawned successfully");
    expect(result.isError).toBe(false);
  });

  it("returns formatted error on failure", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_compile", body: TOOL_EXECUTE_FAILURE },
    ]);
    const result = await simulateCallTool("unreal_blueprint_compile", { blueprint_path: "/Game/Bad" }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Error:");
    expect(result.isError).toBe(true);
  });

  it("injects context when enabled and tool matches", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_compile", body: { success: true, message: "Compiled" } },
    ]);
    const result = await simulateCallTool("unreal_blueprint_compile", {}, { injectContext: true, asyncEnabled: false });
    expect(result.content[0].text).toContain("Relevant UE 5.7 API Context");
    expect(result.content[0].text).toContain("Blueprint Context");
  });

  it("does not inject context when disabled", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_compile", body: { success: true, message: "Compiled" } },
    ]);
    const result = await simulateCallTool("unreal_blueprint_compile", {}, { asyncEnabled: false });
    expect(result.content[0].text).not.toContain("Relevant UE 5.7 API Context");
  });
});

// ─── Read-only sync bypass ──────────────────────────────────────────

describe("CallTool — read-only sync bypass", () => {
  it("routes read-only tools to sync path even with async enabled", async () => {
    // Pre-populate cache with tool that has readOnlyHint: true
    toolCache = { tools: UNREAL_TOOLS_RESPONSE.tools, timestamp: Date.now() };

    const spy = installFetchMock([
      { pattern: "/mcp/tool/get_actors", body: { success: true, message: "Found 5 actors", data: { count: 5 } } },
    ]);

    // get_actors is readOnlyHint: true in fixtures, so even with asyncEnabled=true
    // it should call /mcp/tool/get_actors directly (not task_submit)
    const result = await simulateCallTool("unreal_get_actors", { class_filter: "StaticMeshActor" }, { asyncEnabled: true });

    expect(result.content[0].text).toContain("Found 5 actors");
    expect(result.isError).toBe(false);

    // Should NOT have called task_submit
    const taskSubmitCalls = spy.mock.calls.filter(c => c[0].includes("task_submit"));
    expect(taskSubmitCalls).toHaveLength(0);

    // Should have called the direct tool endpoint
    const directCalls = spy.mock.calls.filter(c => c[0].includes("/mcp/tool/get_actors"));
    expect(directCalls).toHaveLength(1);
  });

  it("routes non-read-only tools to async path when enabled", async () => {
    // spawn_actor has readOnlyHint: false
    toolCache = { tools: UNREAL_TOOLS_RESPONSE.tools, timestamp: Date.now() };

    const taskId = "test-task-123";
    const spy = installFetchMock([
      { pattern: "/mcp/tool/task_submit", body: { success: true, message: "Task submitted", data: { task_id: taskId } } },
      { pattern: "/mcp/tool/task_status", body: { success: true, message: "completed", data: { task_id: taskId, status: "completed" } } },
      { pattern: "/mcp/tool/task_result", body: { success: true, message: "Actor spawned successfully", data: { actorName: "BP_Enemy_42" } } },
    ]);

    const result = await simulateCallTool("unreal_spawn_actor", { class_name: "BP_Enemy" }, { asyncEnabled: true });

    expect(result.content[0].text).toContain("Actor spawned successfully");

    // Should have called task_submit (async path)
    const taskSubmitCalls = spy.mock.calls.filter(c => c[0].includes("task_submit"));
    expect(taskSubmitCalls).toHaveLength(1);
  });

  it("routes tool not in cache to async path (unknown annotation)", async () => {
    // Empty cache — tool not found, isReadOnly = false
    toolCache = { tools: [], timestamp: 0 };

    const taskId = "test-task-456";
    const spy = installFetchMock([
      { pattern: "/mcp/tool/task_submit", body: { success: true, message: "Task submitted", data: { task_id: taskId } } },
      { pattern: "/mcp/tool/task_status", body: { success: true, message: "completed", data: { task_id: taskId, status: "completed" } } },
      { pattern: "/mcp/tool/task_result", body: { success: true, message: "Done", data: {} } },
    ]);

    await simulateCallTool("unreal_some_unknown_tool", {}, { asyncEnabled: true });

    const taskSubmitCalls = spy.mock.calls.filter(c => c[0].includes("task_submit"));
    expect(taskSubmitCalls).toHaveLength(1);
  });
});

// ─── unreal_ue router ───────────────────────────────────────────────

describe("CallTool — unreal_ue router", () => {
  it("routes blueprint domain to blueprint_modify", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_modify", body: { success: true, message: "Variable added", data: { variable: "Speed" } } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "add_variable",
      params: { blueprint_path: "/Game/BP_Test", variable_name: "Speed", variable_type: "float" },
    }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Variable added");
    expect(result.isError).toBe(false);
  });

  it("sends operation inside flat args to Unreal", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/blueprint_modify", body: { success: true, message: "Done" } },
    ]);
    await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "compile",
      params: { blueprint_path: "/Game/BP_Test" },
    }, { asyncEnabled: false });

    const call = spy.mock.calls.find(c => c[0].includes("blueprint_modify"));
    const body = JSON.parse(call[1].body);
    expect(body.operation).toBe("compile");
    expect(body.blueprint_path).toBe("/Game/BP_Test");
  });

  it("routes character/create_data_asset to character_data tool", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/character_data", body: { success: true, message: "Asset created" } },
    ]);
    await simulateCallTool("unreal_ue", {
      domain: "character",
      operation: "create_data_asset",
      params: { asset_name: "Hero" },
    }, { asyncEnabled: false });

    const call = spy.mock.calls.find(c => c[0].includes("character_data"));
    expect(call).toBeDefined();
  });

  it("routes character/set_movement_param to character tool", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/character", body: { success: true, message: "Param set" } },
    ]);
    await simulateCallTool("unreal_ue", {
      domain: "character",
      operation: "set_movement_param",
      params: { character_name: "Hero" },
    }, { asyncEnabled: false });

    const dataCalls = spy.mock.calls.filter(c => c[0].includes("character_data"));
    expect(dataCalls).toHaveLength(0);
    const charCalls = spy.mock.calls.filter(c => c[0].includes("/mcp/tool/character"));
    expect(charCalls).toHaveLength(1);
  });

  it("returns error for unknown domain", async () => {
    const result = await simulateCallTool("unreal_ue", {
      domain: "invalid_domain",
      operation: "do_thing",
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("Unknown domain");
  });

  it("returns error when domain or operation missing", async () => {
    const result1 = await simulateCallTool("unreal_ue", { operation: "add_variable" });
    expect(result1.isError).toBe(true);
    expect(result1.content[0].text).toContain("requires");

    const result2 = await simulateCallTool("unreal_ue", { domain: "blueprint" });
    expect(result2.isError).toBe(true);
  });

  it("handles null args gracefully", async () => {
    const result = await simulateCallTool("unreal_ue", null);
    expect(result.isError).toBe(true);
  });

  it("works with empty params object", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_modify", body: { success: true, message: "Compiled" } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "compile",
    }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Compiled");
    expect(result.isError).toBe(false);
  });

  it("injects context for resolved tool name when enabled", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_modify", body: { success: true, message: "Done" } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "compile",
      params: { blueprint_path: "/Game/BP_Test" },
    }, { injectContext: true, asyncEnabled: false });
    expect(result.content[0].text).toContain("Blueprint Context");
  });

  it("routes through async path when enabled", async () => {
    const taskId = "router-task-1";
    const spy = installFetchMock([
      { pattern: "/mcp/tool/task_submit", body: { success: true, message: "Submitted", data: { task_id: taskId } } },
      { pattern: "/mcp/tool/task_status", body: { success: true, data: { status: "completed" } } },
      { pattern: "/mcp/tool/task_result", body: { success: true, message: "Variable added", data: {} } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "add_variable",
      params: { blueprint_path: "/Game/BP_Test" },
    }, { asyncEnabled: true });

    expect(result.content[0].text).toContain("Variable added");
    const submitCall = spy.mock.calls.find(c => c[0].includes("task_submit"));
    expect(submitCall).toBeDefined();
    const body = JSON.parse(submitCall[1].body);
    expect(body.tool_name).toBe("blueprint_modify");
    expect(body.params.operation).toBe("add_variable");
  });
});

// ─── Unknown tool ────────────────────────────────────────────────────

describe("CallTool — unknown tool", () => {
  it("returns isError with tool name for non-unreal_ prefixed tool", async () => {
    const result = await simulateCallTool("some_random_tool", {});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("some_random_tool");
  });
});
