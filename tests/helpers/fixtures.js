/**
 * Canned fixture data for MCP bridge tests.
 *
 * Mirrors the JSON shapes returned by the UnrealClaude plugin HTTP server.
 */

export const UNREAL_STATUS_RESPONSE = {
  projectName: "MyGame",
  engineVersion: "5.7.1",
  pluginVersion: "1.2.0",
};

export const UNREAL_TOOLS_RESPONSE = {
  tools: [
    {
      name: "spawn_actor",
      description: "Spawn an actor in the current level",
      parameters: [
        { name: "class_name", type: "string", description: "Actor class to spawn", required: true },
        { name: "location_x", type: "number", description: "X coordinate", required: false, default: 0 },
        { name: "location_y", type: "number", description: "Y coordinate", required: false, default: 0 },
        { name: "location_z", type: "number", description: "Z coordinate", required: false, default: 0 },
      ],
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    {
      name: "blueprint_compile",
      description: "Compile a Blueprint asset",
      parameters: [
        { name: "blueprint_path", type: "string", description: "Asset path of the Blueprint", required: true },
      ],
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    {
      name: "get_actors",
      description: "List actors in the current level",
      parameters: [
        { name: "class_filter", type: "string", description: "Optional class filter", required: false },
        { name: "include_hidden", type: "boolean", description: "Include hidden actors", required: false, default: false },
      ],
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    // --- Mega tool (operation-based, many params) ---
    {
      name: "blueprint_modify",
      description: "Modify a Blueprint asset",
      parameters: [
        { name: "operation", type: "string", description: "Operation to perform", required: true },
        { name: "blueprint_path", type: "string", description: "Blueprint asset path", required: true },
        { name: "variable_name", type: "string", description: "Variable name", required: false },
        { name: "variable_type", type: "string", description: "Variable type", required: false },
      ],
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    // --- Hidden tool (task infrastructure) ---
    {
      name: "task_submit",
      description: "Submit a task to the async queue",
      parameters: [
        { name: "tool_name", type: "string", description: "Tool to execute", required: true },
        { name: "params", type: "object", description: "Tool parameters", required: false },
      ],
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
    // --- Another hidden tool ---
    {
      name: "execute_script",
      description: "Execute a Python script in Unreal",
      parameters: [
        { name: "code", type: "string", description: "Python code to execute", required: true },
      ],
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: false,
      },
    },
  ],
};

export const TOOL_EXECUTE_SUCCESS = {
  success: true,
  message: "Actor spawned successfully",
  data: {
    actorName: "BP_Enemy_42",
    location: { x: 100, y: 200, z: 0 },
  },
};

export const TOOL_EXECUTE_FAILURE = {
  success: false,
  message: "Blueprint not found at specified path",
};

export const MINIMAL_TOOL = {
  name: "minimal_tool",
  description: "A minimal tool",
  parameters: [],
};

export const TOOL_NO_DESCRIPTION = {
  name: "bad_tool",
  description: "",
  parameters: [],
};
