/**
 * UnrealClaude Dynamic Context Loader
 *
 * Loads UE 5.7 context files based on:
 * 1. Tool names (automatic injection)
 * 2. Query keywords (explicit request)
 *
 * Context files are stored in ./contexts/*.md
 */

import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONTEXTS_DIR = join(__dirname, "contexts");

/**
 * Context configuration
 * Maps categories to files and matching patterns
 */
const CONTEXT_CONFIG = {
  animation: {
    files: ["animation.md"],
    // Tool name patterns that trigger this context
    toolPatterns: [/^anim/, /animation/, /state_machine/],
    // Keywords in user queries that trigger this context
    keywords: [
      "animation",
      "anim",
      "state machine",
      "blend",
      "transition",
      "animinstance",
      "montage",
      "sequence",
      "blendspace",
    ],
  },
  blueprint: {
    files: ["blueprint.md"],
    toolPatterns: [/^blueprint/, /^bp_/],
    keywords: [
      "blueprint",
      "graph",
      "node",
      "pin",
      "uk2node",
      "variable",
      "function",
      "event graph",
    ],
  },
  slate: {
    files: ["slate.md"],
    toolPatterns: [/widget/, /editor.*ui/, /slate/],
    keywords: [
      "slate",
      "widget",
      "snew",
      "sassign",
      "ui",
      "editor window",
      "tab",
      "panel",
      "sverticalbox",
      "shorizontalbox",
    ],
  },
  actor: {
    files: ["actor.md"],
    toolPatterns: [/spawn/, /actor/, /move/, /delete/, /level/, /open_level/],
    keywords: [
      "actor",
      "spawn",
      "component",
      "transform",
      "location",
      "rotation",
      "attach",
      "destroy",
      "iterate",
      "level",
      "map",
      "open level",
      "new level",
      "load map",
      "switch level",
      "template map",
      "save level",
      "save map",
      "save as",
    ],
  },
  assets: {
    files: ["assets.md"],
    toolPatterns: [/asset/, /load/, /reference/],
    keywords: [
      "asset",
      "load",
      "soft pointer",
      "tsoftobjectptr",
      "async",
      "stream",
      "reference",
      "registry",
      "tobjectptr",
    ],
  },
  replication: {
    files: ["replication.md"],
    toolPatterns: [/replicate/, /network/, /rpc/],
    keywords: [
      "replicate",
      "replication",
      "network",
      "rpc",
      "server",
      "client",
      "multicast",
      "onrep",
      "doreplifetime",
      "authority",
    ],
  },
  enhanced_input: {
    files: ["enhanced_input.md"],
    toolPatterns: [/enhanced_input/, /input_action/, /mapping_context/],
    keywords: [
      "enhanced input",
      "input action",
      "mapping context",
      "inputaction",
      "inputmappingcontext",
      "trigger",
      "modifier",
      "key binding",
      "keybinding",
      "gamepad",
      "controller",
      "keyboard mapping",
      "input mapping",
      "dead zone",
      "deadzone",
      "axis",
      "chord",
    ],
  },
  character: {
    files: ["character.md"],
    toolPatterns: [/^character/, /character_data/, /movement_param/],
    keywords: [
      "character",
      "acharacter",
      "movement",
      "charactermovement",
      "walk speed",
      "jump velocity",
      "air control",
      "gravity scale",
      "capsule",
      "character data",
      "stats table",
      "character config",
      "health",
      "stamina",
      "damage multiplier",
      "defense",
      "player character",
      "npc",
    ],
  },
  material: {
    files: ["material.md"],
    toolPatterns: [/^material/, /skeletal_mesh_material/, /actor_material/],
    keywords: [
      "material",
      "material instance",
      "materialinstance",
      "mic",
      "mid",
      "scalar parameter",
      "vector parameter",
      "texture parameter",
      "parent material",
      "material slot",
      "roughness",
      "metallic",
      "base color",
      "emissive",
      "opacity",
    ],
  },
  parallel_workflows: {
    files: ["parallel_workflows.md"],
    toolPatterns: [],
    keywords: [
      "parallel",
      "subagent",
      "swarm",
      "agent team",
      "level setup",
      "build a level",
      "set up a level",
      "create a level",
      "build a scene",
      "set up scene",
      "scene setup",
      "character pipeline",
      "set up character",
      "create character pipeline",
      "multiple agents",
      "decompose",
      "parallelize",
      "concurrent",
      "batch operations",
      "bulk create",
    ],
  },
  ue_core: {
    files: ["ue-core-api.md"],
    toolPatterns: [], // Not auto-triggered by any tool
    keywords: [
      "uproperty",
      "ufunction",
      "uclass",
      "ustruct",
      "uenum",
      "include path",
      "header",
      "specifier",
      "api reference",
      "class hierarchy",
      "base class",
      "fvector",
      "ftransform",
      "core api",
    ],
  },
};

// Cache for loaded context files (raw content)
const contextCache = new Map();

// Cache for parsed sections per file
const parsedSectionCache = new Map();

/**
 * Parse a markdown file into level-2 sections (## headings).
 * Level-3+ headings remain inside their parent section body.
 * @param {string} content - Raw markdown content
 * @returns {{ preamble: string, sections: Array<{heading: string, body: string}> }}
 */
function parseMarkdownSections(content) {
  const sections = [];
  let currentHeading = null;
  let currentLines = [];
  const preambleLines = [];

  for (const line of content.split("\n")) {
    const h2 = line.match(/^##\s+(.+)/);
    if (h2) {
      if (currentHeading !== null) {
        sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
      }
      currentHeading = h2[1].trim();
      currentLines = [line];
    } else if (currentHeading === null) {
      preambleLines.push(line);
    } else {
      currentLines.push(line);
    }
  }

  if (currentHeading !== null) {
    sections.push({ heading: currentHeading, body: currentLines.join("\n").trim() });
  }

  return {
    preamble: preambleLines.join("\n").trim(),
    sections,
  };
}

/**
 * Get parsed sections for a file (with caching).
 * @param {string} filename
 * @returns {{ preamble: string, sections: Array<{heading: string, body: string}> } | null}
 */
function getCachedParsedSections(filename) {
  if (parsedSectionCache.has(filename)) {
    return parsedSectionCache.get(filename);
  }

  const content = loadContextFile(filename);
  if (!content) return null;

  const parsed = parseMarkdownSections(content);
  parsedSectionCache.set(filename, parsed);
  return parsed;
}

/**
 * Score a section's relevance to a query and keyword list.
 * @param {{ heading: string, body: string }} section
 * @param {string[]} queryTerms - lowercase query words (len > 2)
 * @param {string[]} keywords - lowercase config keywords
 * @returns {number}
 */
function scoreSectionRelevance(section, queryTerms, keywords) {
  const headingLower = section.heading.toLowerCase();
  const bodyLower = section.body.toLowerCase();
  let score = 0;

  for (const kw of keywords) {
    if (headingLower.includes(kw)) score += 3;
    else if (bodyLower.includes(kw)) score += 1;
  }

  for (const term of queryTerms) {
    if (headingLower.includes(term)) score += 2;
    else if (bodyLower.includes(term)) score += 1;
  }

  return score;
}

/**
 * Load a context file from disk (with caching)
 */
function loadContextFile(filename) {
  if (contextCache.has(filename)) {
    return contextCache.get(filename);
  }

  const filepath = join(CONTEXTS_DIR, filename);
  if (!existsSync(filepath)) {
    console.error(`[ContextLoader] Context file not found: ${filepath}`);
    return null;
  }

  try {
    const content = readFileSync(filepath, "utf-8");
    contextCache.set(filename, content);
    return content;
  } catch (error) {
    console.error(`[ContextLoader] Error loading ${filename}:`, error.message);
    return null;
  }
}

/**
 * Get context category from tool name
 * @param {string} toolName - The MCP tool name (without unreal_ prefix)
 * @returns {string|null} - Category name or null
 */
export function getCategoryFromTool(toolName) {
  const lowerName = toolName.toLowerCase();

  for (const [category, config] of Object.entries(CONTEXT_CONFIG)) {
    for (const pattern of config.toolPatterns) {
      if (pattern.test(lowerName)) {
        return category;
      }
    }
  }

  return null;
}

/**
 * Get context categories from a query string
 * @param {string} query - User query or search string
 * @returns {string[]} - Array of matching category names
 */
export function getCategoriesFromQuery(query) {
  const lowerQuery = query.toLowerCase();
  const matches = [];

  for (const [category, config] of Object.entries(CONTEXT_CONFIG)) {
    for (const keyword of config.keywords) {
      if (lowerQuery.includes(keyword.toLowerCase())) {
        if (!matches.includes(category)) {
          matches.push(category);
        }
        break; // One match per category is enough
      }
    }
  }

  return matches;
}

/**
 * Load context content for a specific category
 * @param {string} category - Category name (animation, blueprint, etc.)
 * @returns {string|null} - Combined context content or null
 */
export function loadContextForCategory(category) {
  const config = CONTEXT_CONFIG[category];
  if (!config) {
    return null;
  }

  const contents = [];
  for (const file of config.files) {
    const content = loadContextFile(file);
    if (content) {
      contents.push(content);
    }
  }

  return contents.length > 0 ? contents.join("\n\n---\n\n") : null;
}

/**
 * Load context for a tool call (automatic injection)
 * @param {string} toolName - Tool name (without unreal_ prefix)
 * @returns {string|null} - Context to inject or null
 */
export function getContextForTool(toolName) {
  const category = getCategoryFromTool(toolName);
  if (!category) {
    return null;
  }

  return loadContextForCategory(category);
}

/**
 * Load context based on a query (explicit request)
 * @param {string} query - User query
 * @returns {{ categories: string[], content: string }|null} - Matched contexts
 */
export function getContextForQuery(query) {
  const categories = getCategoriesFromQuery(query);
  if (categories.length === 0) {
    return null;
  }

  const contents = [];
  for (const category of categories) {
    const content = loadContextForCategory(category);
    if (content) {
      contents.push(content);
    }
  }

  return {
    categories,
    content: contents.join("\n\n---\n\n"),
  };
}

/**
 * List all available context categories
 * @returns {string[]} - Array of category names
 */
export function listCategories() {
  return Object.keys(CONTEXT_CONFIG);
}

/**
 * Get metadata about a category
 * @param {string} category - Category name
 * @returns {object|null} - Category metadata
 */
export function getCategoryInfo(category) {
  const config = CONTEXT_CONFIG[category];
  if (!config) {
    return null;
  }

  return {
    name: category,
    files: config.files,
    keywords: config.keywords,
    toolPatterns: config.toolPatterns.map((p) => p.toString()),
  };
}

/**
 * List available section headings for a category.
 * Returns [] if the file has no ## headings (single-section document).
 * @param {string} category
 * @returns {string[]}
 */
export function listSections(category) {
  const config = CONTEXT_CONFIG[category];
  if (!config) return [];

  const headings = [];
  for (const file of config.files) {
    const parsed = getCachedParsedSections(file);
    if (parsed) {
      headings.push(...parsed.sections.map((s) => s.heading));
    }
  }
  return headings;
}

/**
 * Retrieve a specific section by heading (case-insensitive match).
 * @param {string} category
 * @param {string} headingText
 * @returns {string | null} Section body (including its ## heading line), or null if not found
 */
export function getSectionByHeading(category, headingText) {
  const config = CONTEXT_CONFIG[category];
  if (!config) return null;

  const lowerTarget = headingText.toLowerCase();

  for (const file of config.files) {
    const parsed = getCachedParsedSections(file);
    if (!parsed) continue;

    // Exact match first, substring fallback
    const exactMatch = parsed.sections.find((s) => s.heading.toLowerCase() === lowerTarget);
    if (exactMatch) return exactMatch.body;

    const partialMatch = parsed.sections.find((s) => s.heading.toLowerCase().includes(lowerTarget));
    if (partialMatch) return partialMatch.body;
  }

  return null;
}

/**
 * Return the top N most relevant sections for a query, across matching categories.
 * Falls back to the full file content for categories whose files have no ## sections.
 *
 * @param {string} query - Natural-language query
 * @param {{ category?: string, maxSections?: number }} options
 * @returns {{ sections: Array<{category: string, heading: string, body: string}>, categories: string[], totalScanned: number } | null}
 */
export function getSectionsForQuery(query, { category, maxSections = 3 } = {}) {
  const lowerQuery = query.toLowerCase();
  const queryTerms = lowerQuery.split(/\s+/).filter((t) => t.length > 2);

  const categoriesToSearch = category
    ? (CONTEXT_CONFIG[category] ? [category] : [])
    : getCategoriesFromQuery(query);

  if (categoriesToSearch.length === 0) return null;

  /** @type {Array<{category: string, heading: string, body: string, score: number}>} */
  const candidates = [];

  for (const cat of categoriesToSearch) {
    const config = CONTEXT_CONFIG[cat];
    const keywords = config.keywords.map((k) => k.toLowerCase());

    for (const file of config.files) {
      const parsed = getCachedParsedSections(file);
      if (!parsed) continue;

      if (parsed.sections.length === 0) {
        // No ## headings — treat the whole file as one section
        const content = loadContextFile(file);
        if (content) {
          candidates.push({ category: cat, heading: cat, body: content, score: 1 });
        }
        continue;
      }

      for (const section of parsed.sections) {
        const score = scoreSectionRelevance(section, queryTerms, keywords);
        if (score > 0) {
          candidates.push({ category: cat, heading: section.heading, body: section.body, score });
        }
      }
    }
  }

  if (candidates.length === 0) return null;

  // Sort by score desc, deduplicate headings, take top N
  candidates.sort((a, b) => b.score - a.score);
  const seen = new Set();
  const top = [];
  for (const c of candidates) {
    const key = `${c.category}::${c.heading}`;
    if (!seen.has(key)) {
      seen.add(key);
      top.push(c);
      if (top.length >= maxSections) break;
    }
  }

  return {
    sections: top.map(({ category: cat, heading, body }) => ({ category: cat, heading, body })),
    categories: [...new Set(top.map((c) => c.category))],
    totalScanned: candidates.length,
  };
}

/**
 * Clear the context cache (useful for hot-reloading)
 */
export function clearCache() {
  contextCache.clear();
  parsedSectionCache.clear();
}

export default {
  getCategoryFromTool,
  getCategoriesFromQuery,
  loadContextForCategory,
  getContextForTool,
  getContextForQuery,
  listCategories,
  getCategoryInfo,
  listSections,
  getSectionByHeading,
  getSectionsForQuery,
  clearCache,
};
