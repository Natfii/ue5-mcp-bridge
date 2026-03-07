import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs before importing the module under test
vi.mock("fs", () => ({
  readFileSync: vi.fn((filepath) => {
    // Return stub content keyed by filename
    const filename = filepath.replace(/\\/g, "/").split("/").pop();
    const stubs = {
      "animation.md": "# Animation Context\nAnimation content here.",
      "blueprint.md": "# Blueprint Context\nBlueprint content here.",
      "slate.md": "# Slate Context\nSlate content here.",
      "actor.md": "# Actor Context\nActor content here.",
      "assets.md": "# Assets Context\nAssets content here.",
      "replication.md": "# Replication Context\nReplication content here.",
      "enhanced_input.md": "# Enhanced Input Context\nEnhanced input content here.",
      "character.md": "# Character Context\nCharacter content here.",
      "material.md": "# Material Context\nMaterial content here.",
      "parallel_workflows.md": "# Parallel Tool Execution & Subagent Workflow Patterns\n\n## Level Setup\nLevel setup content.\n\n## Anti-Patterns\nAnti-patterns content.",
    };
    if (stubs[filename]) return stubs[filename];
    throw new Error(`ENOENT: no such file or directory, open '${filepath}'`);
  }),
  existsSync: vi.fn((filepath) => {
    const filename = filepath.replace(/\\/g, "/").split("/").pop();
    const valid = [
      "animation.md", "blueprint.md", "slate.md", "actor.md",
      "assets.md", "replication.md", "enhanced_input.md", "character.md",
      "material.md", "parallel_workflows.md",
    ];
    return valid.includes(filename);
  }),
}));

// Import after mocking
import {
  getCategoryFromTool,
  getCategoriesFromQuery,
  loadContextForCategory,
  getContextForTool,
  getContextForQuery,
  listCategories,
  getCategoryInfo,
  clearCache,
} from "../../context-loader.js";

import { readFileSync } from "fs";

beforeEach(() => {
  clearCache();
  vi.mocked(readFileSync).mockClear();
});

// ─── getCategoryFromTool ─────────────────────────────────────────────

describe("getCategoryFromTool", () => {
  it("maps anim_blueprint_xxx to animation", () => {
    expect(getCategoryFromTool("anim_blueprint_create")).toBe("animation");
  });

  it("maps animation_play to animation", () => {
    expect(getCategoryFromTool("animation_play")).toBe("animation");
  });

  it("maps state_machine_add to animation", () => {
    expect(getCategoryFromTool("state_machine_add")).toBe("animation");
  });

  it("maps blueprint_compile to blueprint", () => {
    expect(getCategoryFromTool("blueprint_compile")).toBe("blueprint");
  });

  it("maps bp_create to blueprint", () => {
    expect(getCategoryFromTool("bp_create")).toBe("blueprint");
  });

  it("maps spawn_actor to actor", () => {
    expect(getCategoryFromTool("spawn_actor")).toBe("actor");
  });

  it("maps asset_load to assets", () => {
    expect(getCategoryFromTool("asset_load")).toBe("assets");
  });

  it("maps replicate_property to replication", () => {
    expect(getCategoryFromTool("replicate_property")).toBe("replication");
  });

  it("maps material_set to material", () => {
    expect(getCategoryFromTool("material_set")).toBe("material");
  });

  it("returns null for unknown tool", () => {
    expect(getCategoryFromTool("totally_unknown_tool")).toBeNull();
  });

  it("is case insensitive", () => {
    expect(getCategoryFromTool("BLUEPRINT_Compile")).toBe("blueprint");
  });
});

// ─── getCategoriesFromQuery ──────────────────────────────────────────

describe("getCategoriesFromQuery", () => {
  it("matches a single keyword", () => {
    const cats = getCategoriesFromQuery("animation blending");
    expect(cats).toContain("animation");
  });

  it("matches multiple categories from one query", () => {
    const cats = getCategoriesFromQuery("blueprint graph with animation transitions");
    expect(cats).toContain("animation");
    expect(cats).toContain("blueprint");
  });

  it("returns empty array when nothing matches", () => {
    const cats = getCategoriesFromQuery("zzz_nonexistent_zzz");
    expect(cats).toEqual([]);
  });

  it("is case insensitive", () => {
    const cats = getCategoriesFromQuery("SLATE Widget Creation");
    expect(cats).toContain("slate");
  });

  it("matches multi-word keywords", () => {
    const cats = getCategoriesFromQuery("how to set up enhanced input");
    expect(cats).toContain("enhanced_input");
  });

  it("matches 'set up a level' to parallel_workflows", () => {
    const cats = getCategoriesFromQuery("set up a level");
    expect(cats).toContain("parallel_workflows");
  });

  it("matches 'parallel subagent' to parallel_workflows", () => {
    const cats = getCategoriesFromQuery("parallel subagent");
    expect(cats).toContain("parallel_workflows");
  });
});

// ─── loadContextForCategory ──────────────────────────────────────────

describe("loadContextForCategory", () => {
  it("loads content for a valid category", () => {
    const content = loadContextForCategory("animation");
    expect(content).toContain("Animation Context");
  });

  it("returns null for unknown category", () => {
    expect(loadContextForCategory("nonexistent")).toBeNull();
  });

  it("loads parallel_workflows content with expected sections", () => {
    const content = loadContextForCategory("parallel_workflows");
    expect(content).toContain("Level Setup");
    expect(content).toContain("Anti-Patterns");
  });

  it("returns null when context file is missing from disk", async () => {
    // Temporarily override existsSync for this test
    const { existsSync } = await import("fs");
    vi.mocked(existsSync).mockReturnValueOnce(false);
    clearCache();
    expect(loadContextForCategory("animation")).toBeNull();
  });

  it("caches loaded files (readFileSync called once per file)", () => {
    loadContextForCategory("blueprint");
    loadContextForCategory("blueprint");
    // readFileSync should be called only once for blueprint.md
    const calls = vi.mocked(readFileSync).mock.calls.filter(
      (c) => c[0].toString().includes("blueprint.md")
    );
    expect(calls).toHaveLength(1);
  });
});

// ─── getContextForTool ───────────────────────────────────────────────

describe("getContextForTool", () => {
  it("returns context for a tool matching a known category", () => {
    const ctx = getContextForTool("blueprint_compile");
    expect(ctx).toContain("Blueprint Context");
  });

  it("returns null for an unknown tool", () => {
    expect(getContextForTool("totally_unknown")).toBeNull();
  });
});

// ─── getContextForQuery ──────────────────────────────────────────────

describe("getContextForQuery", () => {
  it("returns merged content with separator for multi-category match", () => {
    const result = getContextForQuery("animation and blueprint graph");
    expect(result).not.toBeNull();
    expect(result.categories).toContain("animation");
    expect(result.categories).toContain("blueprint");
    expect(result.content).toContain("Animation Context");
    expect(result.content).toContain("Blueprint Context");
    expect(result.content).toContain("---");
  });

  it("returns null when no keywords match", () => {
    expect(getContextForQuery("zzz_nothing_zzz")).toBeNull();
  });
});

// ─── listCategories ──────────────────────────────────────────────────

describe("listCategories", () => {
  it("returns all 11 category names", () => {
    const cats = listCategories();
    expect(cats).toHaveLength(11);
    expect(cats).toContain("animation");
    expect(cats).toContain("blueprint");
    expect(cats).toContain("slate");
    expect(cats).toContain("actor");
    expect(cats).toContain("assets");
    expect(cats).toContain("replication");
    expect(cats).toContain("enhanced_input");
    expect(cats).toContain("character");
    expect(cats).toContain("material");
    expect(cats).toContain("parallel_workflows");
    expect(cats).toContain("ue_core");
  });
});

// ─── getCategoryInfo ─────────────────────────────────────────────────

describe("getCategoryInfo", () => {
  it("returns metadata object for valid category", () => {
    const info = getCategoryInfo("animation");
    expect(info).not.toBeNull();
    expect(info.name).toBe("animation");
    expect(info.files).toEqual(["animation.md"]);
    expect(info.keywords).toContain("animation");
    expect(Array.isArray(info.toolPatterns)).toBe(true);
    // toolPatterns should be stringified regex
    expect(info.toolPatterns[0]).toMatch(/^\//);
  });

  it("returns null for unknown category", () => {
    expect(getCategoryInfo("nonexistent")).toBeNull();
  });
});

// ─── clearCache ──────────────────────────────────────────────────────

describe("clearCache", () => {
  it("causes files to be re-read from disk", () => {
    loadContextForCategory("actor");
    const callsBefore = vi.mocked(readFileSync).mock.calls.filter(
      (c) => c[0].toString().includes("actor.md")
    ).length;

    clearCache();
    loadContextForCategory("actor");
    const callsAfter = vi.mocked(readFileSync).mock.calls.filter(
      (c) => c[0].toString().includes("actor.md")
    ).length;

    expect(callsAfter).toBe(callsBefore + 1);
  });
});
