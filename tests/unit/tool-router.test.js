import { describe, it, expect } from "vitest";
import {
  classifyTool,
  resolveUnrealTool,
  categorizeToolForStatus,
  ROUTER_TOOL_SCHEMA,
  SIMPLE_TOOL_NAMES,
  HIDDEN_TOOL_NAMES,
  DOMAIN_TOOL_MAP,
  BLUEPRINT_QUERY_OPS,
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
  it("resolves non-character, non-blueprint-query domains", () => {
    expect(resolveUnrealTool("blueprint", "add_variable")).toBe("blueprint_modify");
    expect(resolveUnrealTool("anim", "add_state")).toBe("anim_blueprint_modify");
    expect(resolveUnrealTool("enhanced_input", "create_action")).toBe("enhanced_input");
    expect(resolveUnrealTool("material", "create_material_instance")).toBe("material");
    expect(resolveUnrealTool("asset", "duplicate")).toBe("asset");
  });

  it("routes blueprint domain to 'blueprint_query' for read ops", () => {
    for (const op of BLUEPRINT_QUERY_OPS) {
      expect(resolveUnrealTool("blueprint", op)).toBe("blueprint_query");
    }
  });

  it("routes blueprint domain to 'blueprint_modify' for write ops", () => {
    const writeOps = [
      "create", "add_variable", "remove_variable", "add_function",
      "remove_function", "add_node", "add_nodes", "delete_node",
      "connect_pins", "disconnect_pins", "set_pin_value",
    ];
    for (const op of writeOps) {
      expect(resolveUnrealTool("blueprint", op)).toBe("blueprint_modify");
    }
  });

  it("routes character domain to 'character' for actor/config ops", () => {
    expect(resolveUnrealTool("character", "set_movement_params")).toBe("character");
    expect(resolveUnrealTool("character", "get_movement_params")).toBe("character");
    expect(resolveUnrealTool("character", "list_characters")).toBe("character");
    expect(resolveUnrealTool("character", "get_character_config")).toBe("character");
    expect(resolveUnrealTool("character", "assign_anim_bp")).toBe("character");
  });

  it("routes character domain to 'character_data' for data asset ops", () => {
    expect(resolveUnrealTool("character", "create_character_data")).toBe("character_data");
    expect(resolveUnrealTool("character", "query_character_data")).toBe("character_data");
    expect(resolveUnrealTool("character", "get_character_data")).toBe("character_data");
    expect(resolveUnrealTool("character", "update_character_data")).toBe("character_data");
    expect(resolveUnrealTool("character", "apply_character_data")).toBe("character_data");
    expect(resolveUnrealTool("character", "add_stats_row")).toBe("character_data");
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

  it("description splits blueprint ops into modify and query", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    expect(desc).toContain("modify ops:");
    expect(desc).toContain("query ops:");
    // Verify real backend op names are present
    expect(desc).toContain("add_variable");
    expect(desc).toContain("inspect");
    expect(desc).toContain("get_graph");
  });

  it("description includes key param names for discoverability", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    expect(desc).toContain("blueprint_path");
    expect(desc).toContain("asset_path");
    expect(desc).toContain("material_path");
    expect(desc).toContain("action_name");
    expect(desc).toContain("character_name");
  });

  it("description warns off the wrong anim variable param names", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    // Guards the v0.1.x friction-fix: anim variable ops use 'variable_name'/'variable_type'
    // (NOT var_name/var_type — which is the blueprint domain's spelling). Schema text
    // should steer LLMs to the canonical names so they don't hit the alias warning.
    expect(desc).toMatch(/variable_name.*variable_type/);
    expect(desc).toContain("var_name");
  });

  it("description disambiguates duplicate vs move destination params", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    // duplicate uses 'destination_path' (full path); move uses 'destination_directory' (folder).
    // Both should be present in the asset block so users don't confuse them.
    expect(desc).toContain("destination_path");
    expect(desc).toContain("destination_directory");
  });

  it("description tells users that state_machine accepts node_id too", () => {
    const desc = ROUTER_TOOL_SCHEMA.description;
    // Guards Fix 3: get_states/get_transitions/get_conduits resolve `state_machine`
    // against either the bound graph name or the node_id surfaced by get_info.
    expect(desc).toMatch(/state_machine.*node_id/);
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

  it("BLUEPRINT_QUERY_OPS has 9 entries", () => {
    expect(BLUEPRINT_QUERY_OPS.size).toBe(9);
  });

  it("no overlap between simple and hidden sets", () => {
    for (const name of SIMPLE_TOOL_NAMES) {
      expect(HIDDEN_TOOL_NAMES.has(name)).toBe(false);
    }
  });
});

describe("categorizeToolForStatus", () => {
  it("categorizes actor tools", () => {
    for (const name of ["spawn_actor", "move_actor", "delete_actors", "set_property", "get_level_actors"]) {
      expect(categorizeToolForStatus(name)).toBe("actor");
    }
  });

  it("categorizes level tools", () => {
    expect(categorizeToolForStatus("open_level")).toBe("level");
  });

  it("categorizes simple asset tools", () => {
    for (const name of ["asset_search", "asset_dependencies", "asset_referencers"]) {
      expect(categorizeToolForStatus(name)).toBe("asset");
    }
  });

  it("categorizes blueprint_query as blueprint", () => {
    expect(categorizeToolForStatus("blueprint_query")).toBe("blueprint");
  });

  it("categorizes utility tools", () => {
    for (const name of ["capture_viewport", "get_output_log"]) {
      expect(categorizeToolForStatus(name)).toBe("utility");
    }
  });

  it("categorizes mega tools by domain", () => {
    expect(categorizeToolForStatus("blueprint_modify")).toBe("blueprint");
    expect(categorizeToolForStatus("anim_blueprint_modify")).toBe("anim");
    expect(categorizeToolForStatus("character")).toBe("character");
    expect(categorizeToolForStatus("character_data")).toBe("character");
    expect(categorizeToolForStatus("enhanced_input")).toBe("enhanced_input");
    expect(categorizeToolForStatus("material")).toBe("material");
    expect(categorizeToolForStatus("asset")).toBe("asset");
  });

  it("categorizes task queue tools", () => {
    for (const name of ["task_submit", "task_status", "task_result", "task_list", "task_cancel"]) {
      expect(categorizeToolForStatus(name)).toBe("task_queue");
    }
  });

  it("categorizes scripting tools", () => {
    for (const name of ["execute_script", "cleanup_scripts", "get_script_history", "run_console_command"]) {
      expect(categorizeToolForStatus(name)).toBe("scripting");
    }
  });

  it("returns utility for unknown tools", () => {
    expect(categorizeToolForStatus("future_unknown_tool")).toBe("utility");
  });
});
