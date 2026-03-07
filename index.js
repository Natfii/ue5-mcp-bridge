#!/usr/bin/env node

/**
 * UE5 MCP Server
 *
 * Bridges MCP-compatible AI clients to Unreal Engine 5's editor via HTTP REST API.
 * The UnrealClaude plugin runs an HTTP server (default port 3000) with editor manipulation tools.
 *
 * Environment Variables:
 *   UNREAL_MCP_URL - Base URL for Unreal MCP server (default: http://localhost:3000)
 *   MCP_REQUEST_TIMEOUT_MS - HTTP request timeout in milliseconds (default: 30000)
 *   INJECT_CONTEXT - Enable automatic context injection on tool calls (default: false)
 *   MCP_TOOL_CACHE_TTL_MS - TTL for tool list cache in milliseconds (default: 30000)
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

// Dynamic context loader for UE 5.7 API documentation
import {
  getContextForTool,
  getContextForQuery,
  listCategories,
  getCategoryInfo,
  loadContextForCategory,
} from "./context-loader.js";

// Extracted library functions
import {
  log,
  fetchUnrealTools as _fetchUnrealTools,
  executeUnrealTool as _executeUnrealTool,
  executeUnrealToolAsync as _executeUnrealToolAsync,
  checkUnrealConnection as _checkUnrealConnection,
  convertToMCPSchema,
  convertAnnotations,
} from "./lib.js";

// Tool router for mega-tool collapsing
import {
  classifyTool,
  resolveUnrealTool,
  ROUTER_TOOL_SCHEMA,
} from "./tool-router.js";

// Configuration with defaults
const CONFIG = {
  unrealMcpUrl: process.env.UNREAL_MCP_URL || "http://localhost:3000",
  requestTimeoutMs: parseInt(process.env.MCP_REQUEST_TIMEOUT_MS, 10) || 30000,
  injectContext: process.env.INJECT_CONTEXT === "true",
  asyncEnabled: process.env.MCP_ASYNC_ENABLED !== "false",
  asyncTimeoutMs: parseInt(process.env.MCP_ASYNC_TIMEOUT_MS, 10) || 300000,
  pollIntervalMs: parseInt(process.env.MCP_POLL_INTERVAL_MS, 10) || 2000,
  toolCacheTtlMs: parseInt(process.env.MCP_TOOL_CACHE_TTL_MS, 10) || 30000,
};

// Bind CONFIG values to library functions for convenience
const fetchUnrealTools = () => _fetchUnrealTools(CONFIG.unrealMcpUrl, CONFIG.requestTimeoutMs);
const executeUnrealTool = (toolName, args) => _executeUnrealTool(CONFIG.unrealMcpUrl, CONFIG.requestTimeoutMs, toolName, args);
const checkUnrealConnection = () => _checkUnrealConnection(CONFIG.unrealMcpUrl, CONFIG.requestTimeoutMs);

// Create the MCP server
const server = new Server(
  {
    name: "ue5-mcp-server",
    version: "1.3.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Cache for tools with TTL (avoids re-fetching the full tool list on every list_tools call)
let toolCache = { tools: [], timestamp: 0 };

// Handle list_tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  const status = await checkUnrealConnection();

  if (!status.connected) {
    log.info("Unreal not connected", { reason: status.reason });
    return {
      tools: [
        {
          name: "unreal_status",
          description: "Check if Unreal Editor is running with the plugin. Currently: NOT CONNECTED. Please start Unreal Editor with the plugin enabled.",
          inputSchema: {
            type: "object",
            properties: {},
          },
        },
      ],
    };
  }

  let unrealTools;
  const cacheAge = Date.now() - toolCache.timestamp;
  if (toolCache.tools.length > 0 && cacheAge < CONFIG.toolCacheTtlMs) {
    unrealTools = toolCache.tools;
    log.debug("Using cached tool list", { ageMs: cacheAge });
  } else {
    unrealTools = await fetchUnrealTools();
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

  // 2. Simple tools only (mega and hidden filtered out)
  for (const tool of toolCache.tools) {
    if (classifyTool(tool.name) === "simple") {
      mcpTools.push({
        name: `unreal_${tool.name}`,
        description: tool.description,
        inputSchema: convertToMCPSchema(tool.parameters, true),
        annotations: convertAnnotations(tool.annotations),
      });
    }
  }

  // 3. Router tool (static schema for all mega-tools)
  mcpTools.push(ROUTER_TOOL_SCHEMA);

  // 4. Context tool last
  mcpTools.push({
    name: "unreal_get_ue_context",
    description: `Get UE 5.7 API context. Categories: ${listCategories().join(", ")}`,
    inputSchema: {
      type: "object",
      properties: {
        category: {
          type: "string",
          description: `Specific category to load: ${listCategories().join(", ")}`,
        },
        query: {
          type: "string",
          description: "Search query to find relevant context (e.g., 'state machine transitions', 'async loading')",
        },
      },
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  });

  log.info("Tools listed", { exposed: mcpTools.length, cached: toolCache.tools.length, connected: true });
  return { tools: mcpTools };
});

// Handle call_tool request
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

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
          content: [
            {
              type: "text",
              text: `Unknown category: ${category}. Available categories: ${listCategories().join(", ")}`,
            },
          ],
          isError: true,
        };
      }
    }
    else if (query) {
      const queryResult = getContextForQuery(query);
      if (queryResult) {
        result = queryResult.content;
        matchedCategories = queryResult.categories;
      } else {
        return {
          content: [
            {
              type: "text",
              text: `No context found for query: "${query}". Try categories: ${listCategories().join(", ")}`,
            },
          ],
          isError: false,
        };
      }
    }
    else {
      const categoryList = listCategories().map((cat) => {
        const info = getCategoryInfo(cat);
        return `- **${cat}**: Keywords: ${info.keywords.slice(0, 5).join(", ")}...`;
      });

      return {
        content: [
          {
            type: "text",
            text: `# Available UE 5.7 Context Categories\n\n${categoryList.join("\n")}\n\nUse \`category\` param for specific context or \`query\` to search by keywords.`,
          },
        ],
      };
    }

    log.info("UE context loaded", { categories: matchedCategories });

    return {
      content: [
        {
          type: "text",
          text: `# UE 5.7 Context: ${matchedCategories.join(", ")}\n\n${result}`,
        },
      ],
    };
  }

  // Handle status check (lightweight — uses cached tools, no context probe)
  if (name === "unreal_status") {
    const status = await checkUnrealConnection();
    if (status.connected) {
      // Use cached tool list instead of re-fetching
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
        content: [
          {
            type: "text",
            text: JSON.stringify(response, null, 2),
          },
        ],
      };
    } else {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              connected: false,
              reason: status.reason,
              message: "Unreal Editor is not running or the plugin is not enabled. Please start Unreal Editor with the plugin.",
            }, null, 2),
          },
        ],
        isError: true,
      };
    }
  }

  // Strip "unreal_" prefix to get actual tool name
  if (!name.startsWith("unreal_")) {
    return {
      content: [
        {
          type: "text",
          text: `Unknown tool: ${name}`,
        },
      ],
      isError: true,
    };
  }

  const toolName = name.substring(7);

  // Tools excluded from auto-async: task_* tools and read-only tools
  const isTaskTool = toolName.startsWith("task_");
  const cachedTool = toolCache.tools.find(t => t.name === toolName);
  const isReadOnly = cachedTool?.annotations?.readOnlyHint === true;

  let result;
  if (CONFIG.asyncEnabled && !isTaskTool && !isReadOnly) {
    const progressToken = request.params._meta?.progressToken;
    const onProgress = progressToken
      ? ({ progress, total, message }) => {
          server.notification({
            method: "notifications/progress",
            params: { progressToken, progress, total: total || 0, message },
          });
        }
      : undefined;

    result = await _executeUnrealToolAsync(
      CONFIG.unrealMcpUrl,
      CONFIG.requestTimeoutMs,
      toolName,
      args,
      {
        onProgress,
        pollIntervalMs: CONFIG.pollIntervalMs,
        asyncTimeoutMs: CONFIG.asyncTimeoutMs,
      }
    );
  } else {
    result = await executeUnrealTool(toolName, args);
  }

  let responseText = result.success
    ? result.message + (result.data ? "\n\n" + JSON.stringify(result.data) : "")
    : `Error: ${result.message}`;

  if (CONFIG.injectContext && result.success) {
    const context = getContextForTool(toolName);
    if (context) {
      responseText += `\n\n---\n\n## Relevant UE 5.7 API Context\n\n${context}`;
      log.debug("Injected context for tool", { tool: toolName });
    }
  }

  return {
    content: [
      {
        type: "text",
        text: responseText,
      },
    ],
    isError: !result.success,
  };
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  const categories = listCategories();
  const testContext = loadContextForCategory("animation");
  const contextStatus = testContext ? `OK (${categories.length} categories loaded)` : "FAILED";

  log.info("UE5 MCP Server started", {
    version: "1.3.0",
    unrealUrl: CONFIG.unrealMcpUrl,
    timeoutMs: CONFIG.requestTimeoutMs,
    asyncEnabled: CONFIG.asyncEnabled,
    asyncTimeoutMs: CONFIG.asyncTimeoutMs,
    pollIntervalMs: CONFIG.pollIntervalMs,
    contextInjection: CONFIG.injectContext,
    contextSystem: contextStatus,
    contextCategories: categories,
  });
}

main().catch((error) => {
  log.error("Fatal error", { error: error.message, stack: error.stack });
  process.exit(1);
});
