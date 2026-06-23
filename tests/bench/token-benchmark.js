#!/usr/bin/env node
/**
 * Token reduction benchmark for unreal_get_ue_context
 *
 * Measures character counts (≈ tokens × 4) for representative UE documentation
 * queries using the OLD behavior (full files) vs the NEW behavior (targeted sections).
 *
 * Run:  node tests/bench/token-benchmark.js
 */

import {
  getContextForQuery,
  getSectionsForQuery,
  loadContextForCategory,
  clearCache,
} from "../../context-loader.js";

// Estimated tokens from character count (Claude tokenizer: ~4 chars/token)
const charsToTokens = (chars) => Math.round(chars / 4);

const SCENARIOS = [
  {
    label: "Document Actor Blueprint",
    query: "document this Actor blueprint UCLASS",
  },
  {
    label: "UPROPERTY / UCLASS specifiers",
    query: "how to use UPROPERTY and UCLASS specifiers",
  },
  {
    label: "Animation state machine transitions",
    query: "animation state machine transitions and blending",
  },
  {
    label: "Character movement walk speed",
    query: "character movement walk speed and capsule",
  },
  {
    label: "Material instance parameters",
    query: "material instance parameters base color roughness",
  },
  {
    label: "Blueprint graph node creation",
    query: "blueprint graph node pin connection",
  },
];

const MAX_SECTIONS_NEW = 3;

function padEnd(str, len) {
  return String(str).padEnd(len);
}

function padStart(str, len) {
  return String(str).padStart(len);
}

function formatNum(n) {
  return n.toLocaleString("fr-FR");
}

function run() {
  clearCache();

  console.log("\n=== Token Reduction Benchmark — unreal_get_ue_context ===");
  console.log(`   New mode: targeted sections (max ${MAX_SECTIONS_NEW})\n`);

  const header = [
    padEnd("Scenario", 38),
    padStart("Before (chars)", 16),
    padStart("Before (~tok)", 14),
    padStart("After (chars)", 14),
    padStart("After (~tok)", 13),
    padStart("Reduction", 10),
  ].join(" | ");

  const separator = "-".repeat(header.length);
  console.log(header);
  console.log(separator);

  let totalBefore = 0;
  let totalAfter = 0;

  for (const { label, query } of SCENARIOS) {
    clearCache();

    // BEFORE: full files for all matching categories (old getContextForQuery behaviour)
    const oldResult = getContextForQuery(query);
    const beforeChars = oldResult ? oldResult.content.length : 0;

    // AFTER: targeted sections only
    const newResult = getSectionsForQuery(query, { maxSections: MAX_SECTIONS_NEW });
    const afterContent = newResult
      ? newResult.sections.map((s) => `## [${s.category}] ${s.heading}\n\n${s.body}`).join("\n\n---\n\n")
      : "";
    const afterChars = afterContent.length;

    const reduction =
      beforeChars > 0 ? (((beforeChars - afterChars) / beforeChars) * 100).toFixed(1) : "n/a";

    totalBefore += beforeChars;
    totalAfter += afterChars;

    console.log(
      [
        padEnd(label, 38),
        padStart(formatNum(beforeChars), 16),
        padStart(formatNum(charsToTokens(beforeChars)), 14),
        padStart(formatNum(afterChars), 14),
        padStart(formatNum(charsToTokens(afterChars)), 13),
        padStart(`${reduction}%`, 10),
      ].join(" | ")
    );
  }

  console.log(separator);

  const totalReduction =
    totalBefore > 0 ? (((totalBefore - totalAfter) / totalBefore) * 100).toFixed(1) : "n/a";

  console.log(
    [
      padEnd("TOTAL (all scenarios)", 38),
      padStart(formatNum(totalBefore), 16),
      padStart(formatNum(charsToTokens(totalBefore)), 14),
      padStart(formatNum(totalAfter), 14),
      padStart(formatNum(charsToTokens(totalAfter)), 13),
      padStart(`${totalReduction}%`, 10),
    ].join(" | ")
  );

  console.log(`\n  Estimated token savings per scenario set: ~${formatNum(charsToTokens(totalBefore - totalAfter))} tokens`);
  console.log(`  Project context (#3): removed from system prompt (saves ~2 000–8 000 tokens/turn depending on project size)`);
  console.log(`  Tool list (#already done): 28 → 16 exposed tools saves ~15 000 tokens/session baseline\n`);
}

run();
