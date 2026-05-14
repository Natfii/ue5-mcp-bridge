/**
 * Router <-> C++ op parity guard.
 *
 * Catches the bug class where ROUTER_TOOL_SCHEMA advertises a domain operation
 * that has no matching `Operation == TEXT("...")` branch in the C++ dispatcher
 * - the original v0.0.x silent-breakage bug we shipped before this test existed.
 *
 * Skips when the parent UE source tree isn't reachable (e.g. when the bridge
 * submodule is cloned standalone without its parent repo).
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { ROUTER_TOOL_SCHEMA } from "../../tool-router.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

// Bridge tests/unit/ -> bridge/ -> Resources/ -> repo root -> Source/...
const TOOLS_DIR = resolve(
  __dirname,
  "../../../../Source/UnrealClaude/Private/MCP/Tools"
);
const PARENT_REPO_AVAILABLE = existsSync(TOOLS_DIR);

// router domain name -> C++ source files that dispatch its operations
const DOMAIN_SOURCES = {
  anim: ["MCPTool_AnimBlueprintModify.cpp"],
  character: ["MCPTool_Character.cpp", "MCPTool_CharacterData.cpp"],
  enhanced_input: ["MCPTool_EnhancedInput.cpp"],
  material: ["MCPTool_Material.cpp"],
  asset: ["MCPTool_Asset.cpp"],
  blueprint: [
    "MCPTool_BlueprintModify.cpp",
    "MCPTool_BlueprintQuery.cpp",
    "MCPTool_BlueprintQueryList.cpp",
  ],
};

// Extract op strings dispatched by a C++ tool. Two styles are recognized:
//   1. inline:   if (Operation == TEXT("op_name"))      <- anim, character, etc.
//   2. namespace: static const FString Foo = TEXT("op_name");  <- BlueprintModify pattern
function extractCppOps(filename) {
  const fullPath = resolve(TOOLS_DIR, filename);
  if (!existsSync(fullPath)) return new Set();
  const src = readFileSync(fullPath, "utf-8");
  const ops = new Set();
  for (const match of src.matchAll(/Operation\s*==\s*TEXT\("([a-z][a-z0-9_]*)"\)/g)) {
    ops.add(match[1]);
  }
  for (const match of src.matchAll(
    /static\s+const\s+FString\s+\w+\s*=\s*TEXT\("([a-z][a-z0-9_]*)"\)/g
  )) {
    ops.add(match[1]);
  }
  return ops;
}

// Parse the ops list from a `domain:"<name>"` block in the schema description.
// Stops at the next domain block, blank line, or any prose line (uppercase / punctuation).
function extractRouterOpsForDomain(domain) {
  const lines = ROUTER_TOOL_SCHEMA.description.split("\n");
  const startIdx = lines.findIndex((l) => l.startsWith(`domain:"${domain}"`));
  if (startIdx === -1) return new Set();

  const ops = new Set();
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith("domain:") || line.trim() === "") break;
    const cleaned = line.replace(/^\s*(modify ops:|query ops:|ops:)?\s*/i, "");
    // If the line contains anything other than ops-list characters (a-z, 0-9, _, comma, whitespace),
    // it's prose (e.g. "Modify requires blueprint_path.") - stop parsing this domain.
    if (!/^[a-z0-9_,\s]+$/i.test(cleaned)) break;
    for (const token of cleaned.split(",")) {
      const trimmed = token.trim();
      if (/^[a-z][a-z0-9_]*$/.test(trimmed)) ops.add(trimmed);
    }
  }
  return ops;
}

describe.skipIf(!PARENT_REPO_AVAILABLE)("router <-> C++ op parity", () => {
  it("can locate every advertised domain block in the schema", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    for (const domain of Object.keys(DOMAIN_SOURCES)) {
      expect(
        desc,
        `ROUTER_TOOL_SCHEMA.description missing block for domain "${domain}"`
      ).toContain(`domain:"${domain}"`);
    }
  });

  for (const [domain, files] of Object.entries(DOMAIN_SOURCES)) {
    it(`every router-advertised "${domain}" op has a matching C++ Operation handler`, () => {
      const cppOps = new Set();
      for (const filename of files) {
        for (const op of extractCppOps(filename)) cppOps.add(op);
      }
      expect(
        cppOps.size,
        `no C++ ops extracted from ${files.join(", ")} - check the regex or path resolution`
      ).toBeGreaterThan(0);

      const routerOps = extractRouterOpsForDomain(domain);
      expect(
        routerOps.size,
        `parsed zero router ops for domain "${domain}" - schema format may have changed`
      ).toBeGreaterThan(0);

      const orphans = [...routerOps].filter((op) => !cppOps.has(op));
      expect(
        orphans,
        `Router schema advertises ops with no C++ handler in domain "${domain}". ` +
          `Either implement them, rename the schema entry, or remove from the schema.`
      ).toEqual([]);
    });
  }
});

describe.skipIf(PARENT_REPO_AVAILABLE)(
  "router <-> C++ op parity (skipped - standalone bridge clone)",
  () => {
    it("is informational only when running outside the parent repo", () => {
      expect(PARENT_REPO_AVAILABLE).toBe(false);
    });
  }
);
