/**
 * Pure routing logic for unreal_get_ue_context.
 * Extracted from index.js so it can be unit-tested without the MCP server.
 *
 * @param {object} args - Tool call arguments
 * @param {object} loaders - Context-loader functions (injected for testability)
 * @returns {object} MCP response { content: [{type, text}], isError? }
 */
export function resolveUeContextRequest(args, {
  listCategories,
  listSections,
  getSectionByHeading,
  loadContextForCategory,
  getSectionsForQuery,
  getCategoryInfo,
}) {
  const { category, query, section, mode, max_sections } = args || {};
  const maxSections = Math.min(Math.max(1, Number(max_sections) || 3), 8);

  // Global outline OR no arguments (no category)
  if (!category && (mode === "outline" || (!query && !section))) {
    const lines = listCategories().map((cat) => {
      const headings = listSections(cat);
      const info = getCategoryInfo(cat);
      const sectionList = headings.length > 0
        ? headings.map((h) => `  - ${h}`).join("\n")
        : `  (keywords: ${info.keywords.slice(0, 4).join(", ")})`;
      return `**${cat}**\n${sectionList}`;
    });
    return {
      content: [{
        type: "text",
        text: `# UE 5.7 Context — Available Sections\n\nUse \`query\` for targeted loading or \`category\`+\`section\` for a specific section.\n\n${lines.join("\n\n")}`,
      }],
    };
  }

  // Per-category outline
  if (category && mode === "outline") {
    const headings = listSections(category);
    if (headings.length === 0) {
      return {
        content: [{ type: "text", text: `Category "${category}" has no sub-sections. Use mode="full" to load it entirely.` }],
      };
    }
    return {
      content: [{ type: "text", text: `# ${category} — Sections\n\n${headings.map((h) => `- ${h}`).join("\n")}` }],
    };
  }

  // category + section: specific section
  if (category && section) {
    const body = getSectionByHeading(category, section);
    if (!body) {
      const available = listSections(category);
      return {
        content: [{
          type: "text",
          text: `Section "${section}" not found in "${category}". Available: ${available.join(", ") || "(none — use mode=full)"}`,
        }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `# UE 5.7 — ${category} › ${section}\n\n${body}` }],
    };
  }

  // category + mode=full: entire file
  if (category && mode === "full") {
    const content = loadContextForCategory(category);
    if (!content) {
      return {
        content: [{ type: "text", text: `Unknown category: "${category}". Available: ${listCategories().join(", ")}` }],
        isError: true,
      };
    }
    return {
      content: [{ type: "text", text: `# UE 5.7 Context: ${category}\n\n${content}` }],
    };
  }

  // query → targeted sections
  if (query) {
    const result = getSectionsForQuery(query, { category, maxSections });
    if (!result) {
      return {
        content: [{
          type: "text",
          text: `No context found for query: "${query}". Try mode="outline" to see available categories and sections.`,
        }],
      };
    }
    const parts = result.sections.map(
      (s) => `## [${s.category}] ${s.heading}\n\n${s.body}`
    );
    const header = `# UE 5.7 Context — ${result.sections.length} section(s) matching "${query}"` +
      (result.sections.length < result.totalScanned
        ? ` (showing ${result.sections.length}/${result.totalScanned} scored sections)`
        : "");
    return {
      content: [{ type: "text", text: `${header}\n\n${parts.join("\n\n---\n\n")}` }],
    };
  }

  // category alone (no query, no mode): per-category outline
  if (category) {
    const headings = listSections(category);
    if (headings.length === 0) {
      const content = loadContextForCategory(category);
      if (!content) {
        return {
          content: [{ type: "text", text: `Unknown category: "${category}". Available: ${listCategories().join(", ")}` }],
          isError: true,
        };
      }
      return {
        content: [{ type: "text", text: `# UE 5.7 Context: ${category}\n\n${content}` }],
      };
    }
    return {
      content: [{
        type: "text",
        text: `# ${category} — Sections\n\n${headings.map((h) => `- ${h}`).join("\n")}\n\nUse \`section\` param to load a specific section, or add \`query\` to target relevant sections.`,
      }],
    };
  }

  return {
    content: [{ type: "text", text: "Provide at least one of: query, category, section. Use mode=outline to explore available sections." }],
    isError: true,
  };
}

/**
 * Handler for unreal_get_project_context. Probes editor connectivity, then fetches the
 * editor's /mcp/project_context endpoint. Dependencies are injected so the three branches
 * (disconnected, HTTP error, success) can be unit-tested without a live editor.
 *
 * @param {object} deps
 * @param {() => Promise<{connected: boolean}>} deps.checkConnection - editor reachability probe
 * @param {typeof fetch} deps.fetchImpl - fetch implementation (injected for testability)
 * @param {string} deps.url - base Unreal MCP URL (no trailing slash)
 * @param {number} deps.timeoutMs - per-request timeout in milliseconds
 * @returns {Promise<object>} MCP response { content: [{type, text}], isError? }
 */
export async function resolveProjectContextRequest({ checkConnection, fetchImpl, url, timeoutMs }) {
  const status = await checkConnection();
  if (!status.connected) {
    return {
      content: [{ type: "text", text: "Unreal Editor not connected. Start the editor with the plugin enabled." }],
      isError: true,
    };
  }

  try {
    const response = await fetchImpl(`${url}/mcp/project_context`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const data = await response.json();
    return {
      content: [{ type: "text", text: data.context || "No project context available." }],
    };
  } catch (err) {
    return {
      content: [{ type: "text", text: `Failed to fetch project context: ${err.message}` }],
      isError: true,
    };
  }
}
