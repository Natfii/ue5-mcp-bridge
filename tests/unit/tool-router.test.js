import { describe, it, expect } from "vitest";
import {
  classifyTool,
  resolveUnrealTool,
  ROUTER_TOOL_SCHEMA,
  SIMPLE_TOOL_NAMES,
  HIDDEN_TOOL_NAMES,
  DOMAIN_TOOL_MAP,
} from "../../tool-router.js";

describe("classifyTool", () => {
  it("classifies all 12 simple tools", () => {
    const expected = [
      "spawn_actor", "move_actor", "delete_actors", "set_property",
      "get_level_actors", "open_level", "asset_search", "asset_dependencies",
      "asset_referencers", "capture_viewport", "get_output_log", "blueprint_query",
    ];
    for (const name of expected) {
      expect(classifyTool(name)).toBe("simple");
    }
  });

  it("classifies all 9 hidden tools", () => {
    const expected = [
      "task_submit", "task_status", "task_result", "task_list", "task_cancel",
      "execute_script", "cleanup_scripts", "get_script_history", "run_console_command",
    ];
    for (const name of expected) {
      expect(classifyTool(name)).toBe("hidden");
    }
  });

  it("classifies mega tools (not simple, not hidden)", () => {
    const megas = [
      "blueprint_modify", "anim_blueprint_modify", "character",
      "character_data", "enhanced_input", "material", "asset",
    ];
    for (const name of megas) {
      expect(classifyTool(name)).toBe("mega");
    }
  });

  it("classifies unknown tools as mega (safe default)", () => {
    expect(classifyTool("future_tool")).toBe("mega");
    expect(classifyTool("")).toBe("mega");
  });
});

describe("resolveUnrealTool", () => {
  it("resolves all non-character domains", () => {
    expect(resolveUnrealTool("blueprint", "add_variable")).toBe("blueprint_modify");
    expect(resolveUnrealTool("anim", "add_state")).toBe("anim_blueprint_modify");
    expect(resolveUnrealTool("enhanced_input", "create_action")).toBe("enhanced_input");
    expect(resolveUnrealTool("material", "create_material_instance")).toBe("material");
    expect(resolveUnrealTool("asset", "duplicate")).toBe("asset");
  });

  it("routes character domain to 'character' for movement ops", () => {
    expect(resolveUnrealTool("character", "set_movement_param")).toBe("character");
    expect(resolveUnrealTool("character", "create_character_bp")).toBe("character");
    expect(resolveUnrealTool("character", "get_character_config")).toBe("character");
  });

  it("routes character domain to 'character_data' for data asset ops", () => {
    expect(resolveUnrealTool("character", "create_data_asset")).toBe("character_data");
    expect(resolveUnrealTool("character", "update_stats")).toBe("character_data");
    expect(resolveUnrealTool("character", "get_data_asset")).toBe("character_data");
    expect(resolveUnrealTool("character", "list_data_assets")).toBe("character_data");
    expect(resolveUnrealTool("character", "assign_data_asset")).toBe("character_data");
  });

  it("returns null for unknown domain", () => {
    expect(resolveUnrealTool("unknown", "op")).toBeNull();
  });

  it("returns null for null/undefined domain", () => {
    expect(resolveUnrealTool(null, "op")).toBeNull();
    expect(resolveUnrealTool(undefined, "op")).toBeNull();
  });
});

describe("ROUTER_TOOL_SCHEMA", () => {
  it("has name unreal_ue", () => {
    expect(ROUTER_TOOL_SCHEMA.name).toBe("unreal_ue");
  });

  it("requires domain and operation", () => {
    expect(ROUTER_TOOL_SCHEMA.inputSchema.required).toEqual(["domain", "operation"]);
  });

  it("has params as optional object", () => {
    const props = ROUTER_TOOL_SCHEMA.inputSchema.properties;
    expect(props.params.type).toBe("object");
    expect(ROUTER_TOOL_SCHEMA.inputSchema.required).not.toContain("params");
  });

  it("description mentions all six domains", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    expect(desc).toContain('"blueprint"');
    expect(desc).toContain('"anim"');
    expect(desc).toContain('"character"');
    expect(desc).toContain('"enhanced_input"');
    expect(desc).toContain('"material"');
    expect(desc).toContain('"asset"');
  });

  it("is not read-only (mega-tools mutate state)", () => {
    expect(ROUTER_TOOL_SCHEMA.annotations.readOnlyHint).toBe(false);
    expect(ROUTER_TOOL_SCHEMA.annotations.destructiveHint).toBe(true);
  });

  it("description includes key param names for discoverability", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    expect(desc).toContain("blueprint_path");
    expect(desc).toContain("asset_path");
    expect(desc).toContain("material_path");
    expect(desc).toContain("action_name");
    expect(desc).toContain("character_name");
  });
});

describe("classification sets", () => {
  it("SIMPLE_TOOL_NAMES has 12 entries", () => {
    expect(SIMPLE_TOOL_NAMES.size).toBe(12);
  });

  it("HIDDEN_TOOL_NAMES has 9 entries", () => {
    expect(HIDDEN_TOOL_NAMES.size).toBe(9);
  });

  it("DOMAIN_TOOL_MAP has 6 domains with correct values", () => {
    expect(Object.keys(DOMAIN_TOOL_MAP)).toHaveLength(6);
    expect(DOMAIN_TOOL_MAP.blueprint).toBe("blueprint_modify");
    expect(DOMAIN_TOOL_MAP.anim).toBe("anim_blueprint_modify");
    expect(DOMAIN_TOOL_MAP.character).toBe("character");
    expect(DOMAIN_TOOL_MAP.enhanced_input).toBe("enhanced_input");
    expect(DOMAIN_TOOL_MAP.material).toBe("material");
    expect(DOMAIN_TOOL_MAP.asset).toBe("asset");
  });

  it("no overlap between simple and hidden sets", () => {
    for (const name of SIMPLE_TOOL_NAMES) {
      expect(HIDDEN_TOOL_NAMES.has(name)).toBe(false);
    }
  });
});
