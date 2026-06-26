import { describe, it, expect } from "vitest";
import { resolveUeContextRequest, resolveProjectContextRequest } from "../../context-handler.js";

// ─── Minimal loader stubs ────────────────────────────────────────────

const CATEGORIES = ["animation", "blueprint", "slate"];

const SECTIONS = {
  animation: ["State Machines", "Blending", "Montages"],
  blueprint: ["Core Classes", "Graph Editing"],
  slate: [], // no ## headings
};

const SECTION_BODIES = {
  animation: {
    "State Machines": "## State Machines\nState machine content.",
    "Blending": "## Blending\nBlend space content.",
    "Montages": "## Montages\nMontage content.",
  },
  blueprint: {
    "Core Classes": "## Core Classes\nUBlueprint, UEdGraph.",
    "Graph Editing": "## Graph Editing\nAdding nodes.",
  },
};

const FULL_FILES = {
  animation: "# Animation\nFull animation file content.",
  blueprint: "# Blueprint\nFull blueprint file content.",
  slate: "# Slate\nSlate content (no sections).",
};

function makeLoaders(overrides = {}) {
  return {
    listCategories: () => CATEGORIES,
    listSections: (cat) => SECTIONS[cat] ?? [],
    getSectionByHeading: (cat, heading) => {
      const lowerTarget = heading.toLowerCase();
      const bodies = SECTION_BODIES[cat] ?? {};
      // exact match first
      const exactKey = Object.keys(bodies).find((k) => k.toLowerCase() === lowerTarget);
      if (exactKey) return bodies[exactKey];
      // substring fallback
      const partialKey = Object.keys(bodies).find((k) => k.toLowerCase().includes(lowerTarget));
      return partialKey ? bodies[partialKey] : null;
    },
    loadContextForCategory: (cat) => FULL_FILES[cat] ?? null,
    getSectionsForQuery: (query, { category, maxSections = 3 } = {}) => {
      const cats = category ? [category] : CATEGORIES;
      const results = [];
      for (const cat of cats) {
        for (const heading of (SECTIONS[cat] ?? [])) {
          const body = SECTION_BODIES[cat]?.[heading] ?? "";
          if (body.toLowerCase().includes(query.toLowerCase()) ||
              heading.toLowerCase().includes(query.toLowerCase())) {
            results.push({ category: cat, heading, body });
          }
        }
      }
      if (results.length === 0) return null;
      return {
        sections: results.slice(0, maxSections),
        categories: [...new Set(results.slice(0, maxSections).map((r) => r.category))],
        totalScanned: results.length,
      };
    },
    getCategoryInfo: (cat) => ({
      name: cat,
      files: [`${cat}.md`],
      keywords: [cat, `${cat}_keyword`],
      toolPatterns: [],
    }),
    ...overrides,
  };
}

// ─── Global outline (no args) ────────────────────────────────────────

describe("global outline — no args", () => {
  it("returns global TOC when no args given", () => {
    const res = resolveUeContextRequest({}, makeLoaders());
    expect(res.content[0].text).toContain("Available Sections");
    expect(res.content[0].text).toContain("**animation**");
    expect(res.content[0].text).toContain("**blueprint**");
  });

  it("returns global TOC when mode=outline and no category", () => {
    const res = resolveUeContextRequest({ mode: "outline" }, makeLoaders());
    expect(res.content[0].text).toContain("Available Sections");
  });

  it("lists section headings under each category", () => {
    const res = resolveUeContextRequest({}, makeLoaders());
    expect(res.content[0].text).toContain("State Machines");
    expect(res.content[0].text).toContain("Core Classes");
  });

  it("shows keywords for categories with no ## headings", () => {
    const res = resolveUeContextRequest({}, makeLoaders());
    expect(res.content[0].text).toContain("slate_keyword");
  });
});

// ─── Per-category outline ────────────────────────────────────────────

describe("category + mode=outline", () => {
  it("returns only headings for the requested category", () => {
    const res = resolveUeContextRequest({ category: "animation", mode: "outline" }, makeLoaders());
    expect(res.content[0].text).toContain("animation — Sections");
    expect(res.content[0].text).toContain("State Machines");
    expect(res.content[0].text).not.toContain("Core Classes");
  });

  it("does NOT return global TOC when category is set", () => {
    const res = resolveUeContextRequest({ category: "animation", mode: "outline" }, makeLoaders());
    expect(res.content[0].text).not.toContain("Available Sections");
  });

  it("falls back gracefully when category has no sections", () => {
    const res = resolveUeContextRequest({ category: "slate", mode: "outline" }, makeLoaders());
    expect(res.content[0].text).toContain("no sub-sections");
  });
});

// ─── category + section ──────────────────────────────────────────────

describe("category + section", () => {
  it("returns specific section body", () => {
    const res = resolveUeContextRequest({ category: "animation", section: "State Machines" }, makeLoaders());
    expect(res.content[0].text).toContain("State machine content");
    expect(res.isError).toBeFalsy();
  });

  it("returns error with available list when section not found", () => {
    const res = resolveUeContextRequest({ category: "animation", section: "zzz_nonexistent" }, makeLoaders());
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("not found");
    expect(res.content[0].text).toContain("State Machines");
  });
});

// ─── category + mode=full ────────────────────────────────────────────

describe("category + mode=full", () => {
  it("returns entire file content", () => {
    const res = resolveUeContextRequest({ category: "animation", mode: "full" }, makeLoaders());
    expect(res.content[0].text).toContain("Full animation file content");
  });

  it("returns error for unknown category", () => {
    const res = resolveUeContextRequest({ category: "nonexistent", mode: "full" }, makeLoaders());
    expect(res.isError).toBe(true);
  });
});

// ─── query → targeted sections ───────────────────────────────────────

describe("query mode", () => {
  it("returns matching sections", () => {
    const res = resolveUeContextRequest({ query: "state machine" }, makeLoaders());
    expect(res.content[0].text).toContain("State Machines");
    expect(res.isError).toBeFalsy();
  });

  it("restricts to category when provided", () => {
    const res = resolveUeContextRequest({ query: "class", category: "blueprint" }, makeLoaders());
    expect(res.content[0].text).toContain("blueprint");
  });

  it("returns no-match message when query finds nothing", () => {
    const res = resolveUeContextRequest({ query: "zzz_nonexistent_unique_zzz" }, makeLoaders());
    expect(res.content[0].text).toContain("No context found");
    expect(res.isError).toBeFalsy();
  });

  it("respects max_sections", () => {
    const loaders = makeLoaders({
      getSectionsForQuery: (query, { maxSections = 3 } = {}) => ({
        sections: Array.from({ length: 5 }, (_, i) => ({
          category: "animation",
          heading: `Section ${i}`,
          body: `body ${i}`,
        })).slice(0, maxSections),
        categories: ["animation"],
        totalScanned: 5,
      }),
    });
    const res = resolveUeContextRequest({ query: "anything", max_sections: 2 }, loaders);
    const matches = res.content[0].text.match(/## \[animation\]/g);
    expect(matches).toHaveLength(2);
  });
});

// ─── category alone (no mode, no query) ─────────────────────────────

describe("category alone", () => {
  it("returns per-category section list with usage hint", () => {
    const res = resolveUeContextRequest({ category: "animation" }, makeLoaders());
    expect(res.content[0].text).toContain("State Machines");
    expect(res.content[0].text).toContain("section");
  });

  it("returns full file for category with no sections", () => {
    const res = resolveUeContextRequest({ category: "slate" }, makeLoaders());
    expect(res.content[0].text).toContain("Slate content (no sections)");
  });
});

// ─── getSectionByHeading — exact-first, substring fallback ──────────

describe("getSectionByHeading matching priority", () => {
  it("exact match wins over substring when both exist", () => {
    const loaders = makeLoaders({
      getSectionByHeading: (cat, heading) => {
        const lowerTarget = heading.toLowerCase();
        const bodies = {
          "UPROPERTY Specifiers": "UPROPERTY body",
          "UFUNCTION Specifiers": "UFUNCTION body",
          "UCLASS Specifiers": "UCLASS body",
        };
        const exactKey = Object.keys(bodies).find((k) => k.toLowerCase() === lowerTarget);
        if (exactKey) return bodies[exactKey];
        const partialKey = Object.keys(bodies).find((k) => k.toLowerCase().includes(lowerTarget));
        return partialKey ? bodies[partialKey] : null;
      },
    });

    const res = resolveUeContextRequest(
      { category: "ue_core", section: "UFUNCTION Specifiers" },
      loaders
    );
    expect(res.content[0].text).toContain("UFUNCTION body");
    expect(res.content[0].text).not.toContain("UPROPERTY body");
  });

  it("substring fallback returns first partial match when no exact match", () => {
    const loaders = makeLoaders({
      getSectionByHeading: (cat, heading) => {
        const bodies = { "Core Classes": "core content" };
        const lowerTarget = heading.toLowerCase();
        const exactKey = Object.keys(bodies).find((k) => k.toLowerCase() === lowerTarget);
        if (exactKey) return bodies[exactKey];
        const partialKey = Object.keys(bodies).find((k) => k.toLowerCase().includes(lowerTarget));
        return partialKey ? bodies[partialKey] : null;
      },
    });
    const res = resolveUeContextRequest({ category: "blueprint", section: "Core" }, loaders);
    expect(res.content[0].text).toContain("core content");
  });
});

// ─── unreal_get_project_context — resolveProjectContextRequest ──────

describe("resolveProjectContextRequest", () => {
  const connected = () => Promise.resolve({ connected: true });
  const disconnected = () => Promise.resolve({ connected: false });
  const baseDeps = { url: "http://localhost:3000", timeoutMs: 5000 };

  it("returns isError guidance when the editor is not connected (and never fetches)", async () => {
    const fetchImpl = () => { throw new Error("fetch must not be called when disconnected"); };
    const res = await resolveProjectContextRequest({ ...baseDeps, checkConnection: disconnected, fetchImpl });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("not connected");
  });

  it("returns the project context text on success", async () => {
    const fetchImpl = async () => ({
      ok: true,
      json: async () => ({ context: "=== PROJECT CONTEXT ===\nEchoOfAshes | 42 files", summary: "EchoOfAshes | ...", success: true }),
    });
    const res = await resolveProjectContextRequest({ ...baseDeps, checkConnection: connected, fetchImpl });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toContain("EchoOfAshes");
  });

  it("falls back when the editor returns an empty context", async () => {
    const fetchImpl = async () => ({ ok: true, json: async () => ({ context: "", success: true }) });
    const res = await resolveProjectContextRequest({ ...baseDeps, checkConnection: connected, fetchImpl });
    expect(res.isError).toBeFalsy();
    expect(res.content[0].text).toBe("No project context available.");
  });

  it("returns isError with the HTTP status on a non-ok response", async () => {
    const fetchImpl = async () => ({ ok: false, status: 503, statusText: "Service Unavailable" });
    const res = await resolveProjectContextRequest({ ...baseDeps, checkConnection: connected, fetchImpl });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Failed to fetch project context: HTTP 503");
    expect(res.content[0].text).toContain("Service Unavailable");
  });

  it("returns isError on a network failure", async () => {
    const fetchImpl = async () => { throw new Error("ECONNREFUSED"); };
    const res = await resolveProjectContextRequest({ ...baseDeps, checkConnection: connected, fetchImpl });
    expect(res.isError).toBe(true);
    expect(res.content[0].text).toContain("Failed to fetch project context: ECONNREFUSED");
  });
});
