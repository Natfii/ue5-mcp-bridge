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
  formatToolResponse,
} from "../../lib.js";
import { resolveUnrealTool, classifyTool, categorizeToolForStatus } from "../../tool-router.js";
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
      "parallel_workflows.md": "# Parallel Workflows Context",
      "ue-core-api.md": "# UE Core API Context",
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
        const category = categorizeToolForStatus(tool.name);
        categories[category] = (categories[category] || 0) + 1;
      }

      const contextCategories = listCategories();
      const simpleCount = unrealTools.filter(t => classifyTool(t.name) === "simple").length;

      const response = {
        connected: true,
        project: status.projectName,
        engine: status.engineVersion,
        context_categories: contextCategories.length,
        tool_summary: categories,
        total_tools: unrealTools.length,
        exposed_tools: simpleCount + 3,
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

    return formatToolResponse(targetTool, result, injectContext ? getContextForTool : null);
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

  return formatToolResponse(toolName, result, injectContext ? getContextForTool : null);
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

  it("returns exposed_tools count (simple + 3 meta tools)", async () => {
    toolCache = { tools: UNREAL_TOOLS_RESPONSE.tools, timestamp: Date.now() };

    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
    ]);
    const result = await simulateCallTool("unreal_status", {});
    const parsed = JSON.parse(result.content[0].text);

    // Count simple tools in fixtures
    const simpleCount = UNREAL_TOOLS_RESPONSE.tools.filter(t => classifyTool(t.name) === "simple").length;
    expect(parsed.exposed_tools).toBe(simpleCount + 3);
  });

  it("tool_summary uses categorizeToolForStatus categories", async () => {
    toolCache = { tools: UNREAL_TOOLS_RESPONSE.tools, timestamp: Date.now() };

    installFetchMock([
      { pattern: "/mcp/status", body: UNREAL_STATUS_RESPONSE },
    ]);
    const result = await simulateCallTool("unreal_status", {});
    const parsed = JSON.parse(result.content[0].text);

    // Verify categories match what categorizeToolForStatus would produce
    const expectedCategories = {};
    for (const tool of UNREAL_TOOLS_RESPONSE.tools) {
      const cat = categorizeToolForStatus(tool.name);
      expectedCategories[cat] = (expectedCategories[cat] || 0) + 1;
    }
    expect(parsed.tool_summary).toEqual(expectedCategories);
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
      operation: "create_character_data",
      params: { asset_name: "Hero" },
    }, { asyncEnabled: false });

    const call = spy.mock.calls.find(c => c[0].includes("character_data"));
    expect(call).toBeDefined();
  });

  it("routes character/set_movement_params to character tool", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/character", body: { success: true, message: "Param set" } },
    ]);
    await simulateCallTool("unreal_ue", {
      domain: "character",
      operation: "set_movement_params",
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

  it("routes blueprint/inspect to blueprint_query", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/blueprint_query", body: { success: true, message: "Blueprint info for: BP_Test", data: { name: "BP_Test" } } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "inspect",
      params: { blueprint_path: "/Game/BP_Test", include_variables: true },
    }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Blueprint info");
    expect(result.isError).toBe(false);
    const call = spy.mock.calls.find(c => c[0].includes("blueprint_query"));
    expect(call).toBeDefined();
    const body = JSON.parse(call[1].body);
    expect(body.operation).toBe("inspect");
    expect(body.blueprint_path).toBe("/Game/BP_Test");
  });

  it("routes blueprint/list to blueprint_query", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/blueprint_query", body: { success: true, message: "Found 5 Blueprints (showing 5)", data: { blueprints: [], count: 5 } } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "list",
      params: { path_filter: "/Game/", name_filter: "BP_" },
    }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Found 5 Blueprints");
    expect(result.isError).toBe(false);
    const modifyCalls = spy.mock.calls.filter(c => c[0].includes("blueprint_modify"));
    expect(modifyCalls).toHaveLength(0);
  });

  it("routes blueprint/get_graph to blueprint_query", async () => {
    installFetchMock([
      { pattern: "/mcp/tool/blueprint_query", body: { success: true, message: "Graph info for: BP_Test", data: { total_nodes: 12 } } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "get_graph",
      params: { blueprint_path: "/Game/BP_Test" },
    }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Graph info");
    expect(result.isError).toBe(false);
  });

  it("still routes blueprint/add_variable to blueprint_modify", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/blueprint_modify", body: { success: true, message: "Variable added", data: { variable: "Speed" } } },
    ]);
    const result = await simulateCallTool("unreal_ue", {
      domain: "blueprint",
      operation: "add_variable",
      params: { blueprint_path: "/Game/BP_Test", variable_name: "Speed", variable_type: "float" },
    }, { asyncEnabled: false });
    expect(result.content[0].text).toContain("Variable added");
    const queryCalls = spy.mock.calls.filter(c => c[0].includes("blueprint_query"));
    expect(queryCalls).toHaveLength(0);
  });

  it("character domain routing is unaffected by blueprint changes", async () => {
    const spy = installFetchMock([
      { pattern: "/mcp/tool/character_data", body: { success: true, message: "Asset created" } },
      { pattern: "/mcp/tool/character", body: { success: true, message: "Param set" } },
    ]);
    // Data asset op → character_data
    await simulateCallTool("unreal_ue", {
      domain: "character",
      operation: "create_character_data",
      params: { asset_name: "Hero" },
    }, { asyncEnabled: false });
    const dataCall = spy.mock.calls.find(c => c[0].includes("character_data"));
    expect(dataCall).toBeDefined();

    // Movement op → character
    await simulateCallTool("unreal_ue", {
      domain: "character",
      operation: "set_movement_params",
      params: { character_name: "Hero" },
    }, { asyncEnabled: false });
    const charCall = spy.mock.calls.find(c => c[0].includes("/mcp/tool/character") && !c[0].includes("character_data"));
    expect(charCall).toBeDefined();
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

// ─── formatToolResponse (image content) ─────────────────────────────

describe("formatToolResponse", () => {
  it("returns MCP image content block for capture_viewport with image_base64", () => {
    const result = {
      success: true,
      message: "Viewport captured",
      data: {
        image_base64: "iVBORw0KGgoAAAANS...",
        format: "jpeg",
        width: 1920,
        height: 1080,
      },
    };
    const response = formatToolResponse("capture_viewport", result, null);
    expect(response.isError).toBe(false);
    expect(response.content).toHaveLength(2);
    expect(response.content[0].type).toBe("image");
    expect(response.content[0].data).toBe("iVBORw0KGgoAAAANS...");
    expect(response.content[0].mimeType).toBe("image/jpeg");
    // Text block should have metadata but NOT the base64 string
    expect(response.content[1].type).toBe("text");
    expect(response.content[1].text).toContain("1920");
    expect(response.content[1].text).not.toContain("iVBORw0KGgoAAAANS...");
  });

  it("defaults to image/jpeg when format is missing", () => {
    const result = {
      success: true,
      message: "Captured",
      data: { image_base64: "abc123" },
    };
    const response = formatToolResponse("capture_viewport", result, null);
    expect(response.content[0].mimeType).toBe("image/jpeg");
  });

  it("returns text content for non-capture_viewport tools", () => {
    const result = {
      success: true,
      message: "Actor spawned",
      data: { actorName: "BP_Enemy_1" },
    };
    const response = formatToolResponse("spawn_actor", result, null);
    expect(response.isError).toBe(false);
    expect(response.content).toHaveLength(1);
    expect(response.content[0].type).toBe("text");
    expect(response.content[0].text).toContain("Actor spawned");
  });

  it("returns error content for failed results", () => {
    const result = { success: false, message: "Actor not found" };
    const response = formatToolResponse("set_property", result, null);
    expect(response.isError).toBe(true);
    expect(response.content[0].text).toContain("Error: Actor not found");
  });

  it("injects context when getContext function is provided", () => {
    const result = { success: true, message: "Compiled" };
    const mockGetContext = (name) => name === "blueprint_modify" ? "# BP Context" : null;
    const response = formatToolResponse("blueprint_modify", result, mockGetContext);
    expect(response.content[0].text).toContain("# BP Context");
  });

  it("does not inject context for capture_viewport (image path)", () => {
    const result = {
      success: true,
      message: "Captured",
      data: { image_base64: "abc", format: "png" },
    };
    const mockGetContext = () => "# Some Context";
    const response = formatToolResponse("capture_viewport", result, mockGetContext);
    // Image path should not have context injected
    expect(response.content[0].type).toBe("image");
    expect(response.content[1].type).toBe("text");
    expect(response.content[1].text).not.toContain("Some Context");
  });

  it("surfaces warnings array in text output", () => {
    const result = {
      success: true,
      message: "Found 5 assets",
      data: { count: 5 },
      warnings: [
        "Parameter 'asset_type' is not recognized — use 'class_filter' instead.",
        "Unknown parameter 'foo' was ignored.",
      ],
    };
    const response = formatToolResponse("asset_search", result, null);
    expect(response.isError).toBe(false);
    expect(response.content[0].text).toContain("Warnings:");
    expect(response.content[0].text).toContain("asset_type");
    expect(response.content[0].text).toContain("class_filter");
    expect(response.content[0].text).toContain("Unknown parameter 'foo'");
  });

  it("does not emit warnings block when warnings array is empty", () => {
    const result = {
      success: true,
      message: "OK",
      data: {},
      warnings: [],
    };
    const response = formatToolResponse("asset_search", result, null);
    expect(response.content[0].text).not.toContain("Warnings:");
  });

  it("does not emit warnings block when warnings field is missing", () => {
    const result = { success: true, message: "OK", data: {} };
    const response = formatToolResponse("asset_search", result, null);
    expect(response.content[0].text).not.toContain("Warnings:");
  });

  it("surfaces warnings for capture_viewport response too", () => {
    const result = {
      success: true,
      message: "Captured",
      data: { image_base64: "abc", format: "png" },
      warnings: ["Parameter 'foo' was ignored."],
    };
    const response = formatToolResponse("capture_viewport", result, null);
    expect(response.content[1].type).toBe("text");
    expect(response.content[1].text).toContain("Warnings:");
    expect(response.content[1].text).toContain("Parameter 'foo'");
  });
});
