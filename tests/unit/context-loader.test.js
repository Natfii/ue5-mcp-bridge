import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock fs before importing the module under test
vi.mock("fs", () => ({
  readFileSync: vi.fn((filepath) => {
    // Return stub content keyed by filename
    const filename = filepath.replace(/\\/g, "/").split("/").pop();
    const stubs = {
      "animation.md": [
        "# Animation Context",
        "Preamble text.",
        "",
        "## State Machines",
        "State machine details and transitions.",
        "",
        "## Blending",
        "Blend space and animation blending content.",
        "",
        "## Montages",
        "Montage and section content.",
      ].join("\n"),
      "blueprint.md": [
        "# Blueprint Context",
        "Blueprint preamble.",
        "",
        "## Core Classes",
        "UBlueprint, UEdGraph, UK2Node hierarchy.",
        "",
        "## Graph Editing",
        "Adding and connecting nodes.",
        "",
        "## Variables",
        "Blueprint variable creation and types.",
      ].join("\n"),
      "slate.md": "# Slate Context\nSlate content here.",
      "actor.md": [
        "# Actor Context",
        "",
        "## Spawning Actors",
        "SpawnActor and deferred spawn.",
        "",
        "## Components",
        "Adding and attaching components.",
      ].join("\n"),
      "assets.md": "# Assets Context\nAssets content here.",
      "replication.md": "# Replication Context\nReplication content here.",
      "enhanced_input.md": "# Enhanced Input Context\nEnhanced input content here.",
      "character.md": [
        "# Character Context",
        "",
        "## Movement",
        "Walk speed, jump velocity, and air control.",
        "",
        "## Capsule",
        "Capsule component sizing.",
      ].join("\n"),
      "material.md": "# Material Context\nMaterial content here.",
      "parallel_workflows.md": "# Parallel Tool Execution & Subagent Workflow Patterns\n\n## Level Setup\nLevel setup content.\n\n## Anti-Patterns\nAnti-patterns content.",
      "ue-core-api.md": [
        "# UE Core API",
        "",
        "## UPROPERTY Specifiers",
        "EditAnywhere, BlueprintReadWrite, and other specifiers.",
        "",
        "## UCLASS Specifiers",
        "Blueprintable, Abstract, and class specifiers.",
        "",
        "## UFUNCTION Specifiers",
        "BlueprintCallable, BlueprintPure, and function specifiers.",
      ].join("\n"),
    };
    if (stubs[filename]) return stubs[filename];
    throw new Error(`ENOENT: no such file or directory, open '${filepath}'`);
  }),
  existsSync: vi.fn((filepath) => {
    const filename = filepath.replace(/\\/g, "/").split("/").pop();
    const valid = [
      "animation.md", "blueprint.md", "slate.md", "actor.md",
      "assets.md", "replication.md", "enhanced_input.md", "character.md",
      "material.md", "parallel_workflows.md", "ue-core-api.md",
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
  listSections,
  getSectionByHeading,
  getSectionsForQuery,
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

// ─── listSections ────────────────────────────────────────────────────

describe("listSections", () => {
  it("returns section headings for a category with ## headings", () => {
    const headings = listSections("animation");
    expect(headings).toContain("State Machines");
    expect(headings).toContain("Blending");
    expect(headings).toContain("Montages");
  });

  it("returns headings for blueprint category", () => {
    const headings = listSections("blueprint");
    expect(headings).toContain("Core Classes");
    expect(headings).toContain("Graph Editing");
    expect(headings).toContain("Variables");
  });

  it("returns empty array for categories without ## headings", () => {
    const headings = listSections("slate"); // stub has no ## headings
    expect(Array.isArray(headings)).toBe(true);
    expect(headings).toHaveLength(0);
  });

  it("returns empty array for unknown category", () => {
    expect(listSections("nonexistent")).toEqual([]);
  });

  it("returns headings for parallel_workflows", () => {
    const headings = listSections("parallel_workflows");
    expect(headings).toContain("Level Setup");
    expect(headings).toContain("Anti-Patterns");
  });
});

// ─── getSectionByHeading ─────────────────────────────────────────────

describe("getSectionByHeading", () => {
  it("returns section body for exact heading match", () => {
    const body = getSectionByHeading("animation", "State Machines");
    expect(body).not.toBeNull();
    expect(body).toContain("State machine details");
  });

  it("returns section body for partial heading match (case-insensitive)", () => {
    const body = getSectionByHeading("blueprint", "core");
    expect(body).not.toBeNull();
    expect(body).toContain("UBlueprint");
  });

  it("returns null for unknown heading", () => {
    expect(getSectionByHeading("animation", "zzz_nonexistent_zzz")).toBeNull();
  });

  it("returns null for unknown category", () => {
    expect(getSectionByHeading("nonexistent", "anything")).toBeNull();
  });
});

// ─── getSectionsForQuery ─────────────────────────────────────────────

describe("getSectionsForQuery", () => {
  it("returns sections matching a query keyword", () => {
    const result = getSectionsForQuery("animation state machine transitions");
    expect(result).not.toBeNull();
    expect(result.sections.length).toBeGreaterThan(0);
    expect(result.categories).toContain("animation");
  });

  it("respects maxSections limit", () => {
    const result = getSectionsForQuery("animation blueprint actor", { maxSections: 2 });
    expect(result).not.toBeNull();
    expect(result.sections.length).toBeLessThanOrEqual(2);
  });

  it("restricts to category when category option is given", () => {
    const result = getSectionsForQuery("class", { category: "blueprint" });
    expect(result).not.toBeNull();
    for (const s of result.sections) {
      expect(s.category).toBe("blueprint");
    }
  });

  it("returns null when nothing matches", () => {
    expect(getSectionsForQuery("zzz_nothing_zzz_unique")).toBeNull();
  });

  it("returns totalScanned count", () => {
    const result = getSectionsForQuery("animation");
    expect(result).not.toBeNull();
    expect(typeof result.totalScanned).toBe("number");
    expect(result.totalScanned).toBeGreaterThan(0);
  });

  it("sections have category, heading, body fields", () => {
    const result = getSectionsForQuery("blueprint graph");
    expect(result).not.toBeNull();
    for (const s of result.sections) {
      expect(typeof s.category).toBe("string");
      expect(typeof s.heading).toBe("string");
      expect(typeof s.body).toBe("string");
    }
  });

  it("targeted sections are smaller than full category content", () => {
    const full = loadContextForCategory("animation");
    const result = getSectionsForQuery("state machine", { category: "animation", maxSections: 1 });
    expect(result).not.toBeNull();
    const sectionContent = result.sections.map((s) => s.body).join("\n");
    expect(sectionContent.length).toBeLessThan(full.length);
  });
});
