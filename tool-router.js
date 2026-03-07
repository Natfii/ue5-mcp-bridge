/**
 * Tool Router for UE5 MCP Bridge
 *
 * Classifies tools into three layers:
 * - Simple: pass through from Unreal unchanged (12 tools)
 * - Hidden: callable but never listed (9 tools)
 * - Mega: collapsed into unreal_ue router (7 tools)
 *
 * Token budget: 28 tools / ~30K tokens -> 16 tools / ~12K tokens
 */

// Simple tools: appear in list_tools with full schema
export const SIMPLE_TOOL_NAMES = new Set([
  "spawn_actor",
  "move_actor",
  "delete_actors",
  "set_property",
  "get_level_actors",
  "open_level",
  "asset_search",
  "asset_dependencies",
  "asset_referencers",
  "capture_viewport",
  "get_output_log",
  "blueprint_query",
]);

// Hidden tools: callable but never listed
export const HIDDEN_TOOL_NAMES = new Set([
  "task_submit",
  "task_status",
  "task_result",
  "task_list",
  "task_cancel",
  "execute_script",
  "cleanup_scripts",
  "get_script_history",
  "run_console_command",
]);

// Domain -> underlying Unreal tool name
export const DOMAIN_TOOL_MAP = {
  blueprint: "blueprint_modify",
  anim: "anim_blueprint_modify",
  character: "character",
  enhanced_input: "enhanced_input",
  material: "material",
  asset: "asset",
};

// Character operations that route to "character_data" instead of "character"
const CHARACTER_DATA_OPS = new Set([
  "create_data_asset",
  "update_stats",
  "get_data_asset",
  "list_data_assets",
  "assign_data_asset",
]);

/**
 * Resolve a router call to the underlying Unreal tool name.
 * @param {string} domain - e.g. "blueprint", "anim", "character"
 * @param {string} operation - e.g. "add_variable", "create_state_machine"
 * @returns {string|null} Underlying tool name, or null if domain unknown
 */
export function resolveUnrealTool(domain, operation) {
  if (!domain) return null;
  if (domain === "character" && CHARACTER_DATA_OPS.has(operation)) {
    return "character_data";
  }
  return DOMAIN_TOOL_MAP[domain] ?? null;
}

/**
 * Classify a tool for list_tools filtering.
 * @param {string} toolName - raw Unreal tool name (no "unreal_" prefix)
 * @returns {"simple"|"hidden"|"mega"}
 */
export function classifyTool(toolName) {
  if (SIMPLE_TOOL_NAMES.has(toolName)) return "simple";
  if (HIDDEN_TOOL_NAMES.has(toolName)) return "hidden";
  return "mega";
}

/**
 * Static MCP schema for the unreal_ue router tool.
 */
export const ROUTER_TOOL_SCHEMA = {
  name: "unreal_ue",
  description: [
    "Route a command to a domain-specific Unreal Editor tool.",
    "",
    'domain:"blueprint" ops: add_variable, add_function, add_component, add_event,',
    "  set_parent, compile, get_info, add_node, connect_nodes, set_default,",
    "  add_interface, implement_interface, add_custom_event, add_local_variable,",
    "  get_nodes, remove_node, remove_variable, remove_component, disconnect_pin,",
    "  reroute_node, set_node_param, promote_to_variable, search_nodes, get_function_list",
    "  Required: blueprint_path. Per-op: variable_name/type, function_name, node_type, etc.",
    "",
    'domain:"anim" ops: create_state_machine, add_state, create_transition,',
    "  set_state_anim, set_blend_space, add_variable, set_variable_default,",
    "  compile, get_info, add_output_pose, connect_nodes, set_transition_rule,",
    "  set_state_notify, add_notify, get_state_machines, get_states, get_transitions,",
    "  set_slot, add_layer, get_layers, add_blend_profile, set_time_remaining_transition",
    "  Required: blueprint_path.",
    "",
    'domain:"character" ops: create_character_bp, setup_enhanced_input,',
    "  get_character_config, assign_anim_bp, set_movement_param, get_movement_params,",
    "  create_data_asset, update_stats, get_data_asset, list_data_assets, assign_data_asset",
    "",
    'domain:"enhanced_input" ops: create_action, create_context, add_mapping,',
    "  set_trigger, set_modifier, assign_to_character, list_actions, list_contexts,",
    "  get_action_info, remove_mapping",
    "",
    'domain:"material" ops: create_instance, set_scalar, set_vector, set_texture,',
    "  apply_to_actor, apply_to_mesh, get_params, list_instances",
    "",
    'domain:"asset" ops: create_blueprint, duplicate, rename, delete, move,',
    "  list_assets, get_asset_info, reimport",
    "",
    "Pass all domain-specific params inside the params object.",
  ].join("\n"),
  inputSchema: {
    type: "object",
    required: ["domain", "operation"],
    properties: {
      domain: {
        type: "string",
        description: "blueprint | anim | character | enhanced_input | material | asset",
      },
      operation: {
        type: "string",
        description: "The specific operation to perform within the domain",
      },
      params: {
        type: "object",
        description: "All domain-specific parameters as key-value pairs",
      },
    },
  },
  annotations: {
    readOnlyHint: false,
    destructiveHint: true,
    idempotentHint: false,
    openWorldHint: false,
  },
};
