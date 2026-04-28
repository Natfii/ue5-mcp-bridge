[![MseeP.ai Security Assessment Badge](https://mseep.net/pr/natfii-ue5-mcp-bridge-badge.png)](https://mseep.ai/app/natfii-ue5-mcp-bridge)

# UE5 MCP Server

[![Tests](https://img.shields.io/badge/tests-87%20passed-brightgreen)](tests/) [![Coverage](https://img.shields.io/badge/coverage-97%25-brightgreen)](vitest.config.js) [![Node](https://img.shields.io/badge/node-%3E%3D18-blue)](package.json) [![License: MIT](https://img.shields.io/badge/license-MIT-yellow)](LICENSE)

An MCP (Model Context Protocol) server that bridges AI assistants to Unreal Engine 5's editor, enabling direct manipulation of levels, actors, Blueprints, and Animation Blueprints.

## Why a Standalone Repository?

This MCP server was originally part of the [UnrealClaude](https://github.com/Natfii/UnrealClaude) plugin, but has been moved to its own repository because:

1. **Expanded Scope**: The MCP protocol is an open standard now supported by many AI providers
2. **Easier Forking**: Developers can fork and adapt this bridge for other AI services without pulling the entire Unreal plugin
3. **Community Contributions**: Standalone repo makes it easier to accept PRs for new features, bug fixes, and support for additional MCP clients

## Compatible AI Clients

This server uses the standard [Model Context Protocol](https://modelcontextprotocol.io/) and works with **any MCP-compatible AI client**, including:

- **Claude Code** (CLI)
- **Claude Desktop App**
- **OpenAI ChatGPT Desktop** (MCP support added March 2025)
- **Cursor** (AI-powered IDE)
- **Replit** (AI coding platform)
- **Sourcegraph Cody**
- **Windsurf**
- **And any other MCP-compliant tool**

The protocol was [donated to the Linux Foundation](https://en.wikipedia.org/wiki/Model_Context_Protocol) in December 2025 and continues to see broad adoption across the AI industry.

---

## Important: What This Tool Is (and Isn't)

**This is NOT a "text-to-game" tool.** It will not generate 3D models, textures, animations, or replace the work of artists, animators, and asset creators.

**This IS a workflow accelerator** for Unreal Engine developers. It helps with:

- **Project setup monotony**: Quickly scaffold Blueprints, set up state machines, configure input bindings
- **Repetitive editor tasks**: Spawn actors, set properties, organize levels using natural language
- **Rapid prototyping**: Test ideas faster by describing what you want instead of clicking through menus
- **Learning UE5**: Query the built-in API documentation while working

The goal is to speed up the tedious parts of game development so you can focus on the creative work that actually matters.

---

## Requirements

- **Node.js** 18.0.0 or higher
- An HTTP endpoint that implements the expected REST API (default: `http://localhost:3000`)

> **Note**: This MCP server is designed to work with the [UnrealClaude plugin](https://github.com/Natfii/UnrealClaude), but can be adapted for other HTTP backends that implement the same API.

## Quick Start

### 1. Install

```bash
git clone https://github.com/Natfii/unrealclaude-mcp-bridge.git
cd unrealclaude-mcp-bridge
npm install
```

### 2. Configure Your MCP Client

Add to your MCP client's configuration:

**Claude Code** (`~/.claude/settings.json`):
```json
{
  "mcpServers": {
    "unreal": {
      "command": "node",
      "args": ["/path/to/unrealclaude-mcp-bridge/index.js"],
      "env": {
        "UNREAL_MCP_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Claude Desktop** (`claude_desktop_config.json`):
```json
{
  "mcpServers": {
    "unreal": {
      "command": "node",
      "args": ["/path/to/unrealclaude-mcp-bridge/index.js"],
      "env": {
        "UNREAL_MCP_URL": "http://localhost:3000"
      }
    }
  }
}
```

**Other MCP Clients**: Consult your client's documentation for MCP server configuration. The server uses stdio transport.

### 3. Use It

Once connected, you can interact with Unreal Editor through natural language:

```
"Spawn a point light at position 0, 0, 500"
"List all StaticMeshActors in the level"
"Create a new Actor Blueprint called BP_Enemy"
"Add a float variable called Health to BP_Player"
"Create a state machine called Locomotion in my Animation Blueprint"
```

---

## Available Tools

### Connection & Context

| Tool | Description |
|------|-------------|
| `unreal_status` | Check connection to Unreal Editor |
| `unreal_get_ue_context` | Get UE 5.7 API documentation by category or query |

### Level & Actor Tools

| Tool | Description |
|------|-------------|
| `unreal_open_level` | Open, create, or list level maps in the editor |
| `unreal_spawn_actor` | Spawn actors in the level |
| `unreal_get_level_actors` | List actors in the current level |
| `unreal_set_property` | Set properties on actors |
| `unreal_move_actor` | Move/rotate/scale actors |
| `unreal_delete_actors` | Delete actors from the level |
| `unreal_run_console_command` | Run Unreal console commands |
| `unreal_get_output_log` | Get recent output log entries |

### Asset Tools

| Tool | Description |
|------|-------------|
| `unreal_asset_search` | Search for assets by class, path, or name |
| `unreal_asset_dependencies` | Get all assets that a specific asset depends on |
| `unreal_asset_referencers` | Get all assets that reference a specific asset |

### Script Execution

| Tool | Description |
|------|-------------|
| `unreal_execute_script` | Execute C++, Python, or console scripts |
| `unreal_cleanup_scripts` | Remove generated scripts |
| `unreal_get_script_history` | Get script execution history |

### Viewport

| Tool | Description |
|------|-------------|
| `unreal_capture_viewport` | Capture screenshot of active viewport |

### Blueprint Tools

| Tool | Description |
|------|-------------|
| `unreal_blueprint_query` | Query Blueprint information (list, inspect, get_graph) |
| `unreal_blueprint_modify` | Modify Blueprints (create, add variables/functions, add nodes, connect pins) |

### Animation Blueprint Tools

| Tool | Description |
|------|-------------|
| `unreal_anim_blueprint_modify` | Full Animation Blueprint manipulation |

### Character Tools

| Tool | Description |
|------|-------------|
| `unreal_character` | Query and modify ACharacter actors in the current level |
| `unreal_character_data` | Create and manage character configuration DataAssets and stats DataTables |

### Material Tools

| Tool | Description |
|------|-------------|
| `unreal_material` | Material instance creation and assignment for Skeletal Meshes |

### Enhanced Input Tools

| Tool | Description |
|------|-------------|
| `unreal_enhanced_input` | Create and modify Enhanced Input assets (InputAction, InputMappingContext) |

### Async Task Queue

| Tool | Description |
|------|-------------|
| `unreal_task_submit` | Submit an MCP tool for async background execution |
| `unreal_task_status` | Check status of a submitted async task |
| `unreal_task_result` | Get the result of a completed async task |
| `unreal_task_list` | List all async tasks |
| `unreal_task_cancel` | Cancel a running async task |

---

## Animation Blueprint Operations

The `unreal_anim_blueprint_modify` tool provides comprehensive control over Animation Blueprints:

### State Machine Operations

| Operation | Description |
|-----------|-------------|
| `get_info` | Get AnimBlueprint structure overview |
| `get_state_machine` | Get detailed state machine info |
| `create_state_machine` | Create new state machine |
| `add_state` | Add state to state machine |
| `remove_state` | Remove state from state machine |
| `set_entry_state` | Set entry state for state machine |
| `connect_state_machine_to_output` | Connect state machine to AnimGraph output pose |

### Transition Operations

| Operation | Description |
|-----------|-------------|
| `add_transition` | Create transition between states |
| `remove_transition` | Remove transition |
| `set_transition_duration` | Set blend duration |
| `set_transition_priority` | Set evaluation priority |

### Transition Condition Graph

| Operation | Description |
|-----------|-------------|
| `add_condition_node` | Add logic node (TimeRemaining, Greater, Less, And, Or, Not, GetVariable) |
| `delete_condition_node` | Remove node from transition graph |
| `connect_condition_nodes` | Connect nodes in transition graph |
| `connect_to_result` | Connect condition to transition result |

### Node/Pin Introspection

| Operation | Description |
|-----------|-------------|
| `get_transition_nodes` | List all nodes in transition graph(s) with their pins |
| `inspect_node_pins` | Get detailed pin info (types, connections, default values) |
| `set_pin_default_value` | Set pin default value with type validation |
| `add_comparison_chain` | Add GetVariable -> Comparison -> Result chain |
| `validate_blueprint` | Return compile status and diagnostics |

### Animation Assignment

| Operation | Description |
|-----------|-------------|
| `set_state_animation` | Assign AnimSequence, BlendSpace, BlendSpace1D, or Montage |
| `find_animations` | Search compatible animation assets |

### Batch Operations

| Operation | Description |
|-----------|-------------|
| `batch` | Execute multiple operations atomically |

---

## UE 5.7 Context System

The server includes built-in UE 5.7 API documentation that can be queried:

### Available Categories

| Category | Description |
|----------|-------------|
| `animation` | Animation Blueprint, state machines, transitions, UAnimInstance |
| `blueprint` | Blueprint graphs, UK2Node, FBlueprintEditorUtils |
| `slate` | Slate UI widgets, SNew/SAssignNew, layout patterns |
| `actor` | Actor spawning, components, transforms, iteration |
| `assets` | Asset loading, TSoftObjectPtr, FStreamableManager, async loading |
| `replication` | Network replication, RPCs, DOREPLIFETIME, OnRep |
| `enhanced_input` | Enhanced Input System, Input Actions, Mapping Contexts |
| `character` | Character movement, configuration, stats |
| `material` | Material instances, parameters, slots |

### Usage

```json
// Get specific category
{ "category": "animation" }

// Search by keywords
{ "query": "state machine transitions" }

// List all categories
{}
```

### Automatic Context Injection

Enable automatic context injection by setting:

```json
{
  "env": {
    "INJECT_CONTEXT": "true"
  }
}
```

---

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `UNREAL_MCP_URL` | `http://localhost:3000` | Unreal plugin HTTP server URL |
| `MCP_REQUEST_TIMEOUT_MS` | `30000` | Request timeout in milliseconds |
| `INJECT_CONTEXT` | `false` | Auto-inject UE5 context on tool responses |
| `DEBUG` | - | Enable debug logging |

---

## Troubleshooting

### Tools show "NOT CONNECTED"

- Ensure your HTTP backend is running and accessible
- Verify the `UNREAL_MCP_URL` environment variable points to the correct endpoint
- Check that the endpoint responds to `/mcp/status`

### stdin/stdout errors

- Ensure Node.js 18+ is installed and in PATH
- Run `npm install` to ensure dependencies are present
- Verify the path in your MCP client config points to the correct `index.js`

### Running the Test Suite

This repo includes a Vitest test suite (87 tests) that validates bridge behavior without a running Unreal Editor:

```bash
npm install
npm test              # run all tests
npm run test:watch    # watch mode
npm run test:coverage # with coverage report
```

Tests mock the Unreal HTTP server and cover schema conversion, HTTP client logic, context loading, tool listing, and call routing.

---

## Contributing

Contributions are welcome! Feel free to:

- Add support for additional MCP client configurations
- Improve the UE5 context documentation
- Fix bugs or add new features
- Submit documentation improvements

---

## License

MIT with Attribution - see [LICENSE](LICENSE) for details.

**Attribution Required**: If you use this project, please credit:
- Project: UE5 MCP Server
- Author: Natali Caggiano (Natfii)
- Link: https://github.com/Natfii/unrealclaude-mcp-bridge

**Disclosure Required**: If you build another MCP server or AI integration using this code, please disclose its use in your documentation.

---

## Related

- [UnrealClaude Plugin](https://github.com/Natfii/UnrealClaude) - Unreal Engine plugin that provides the HTTP backend for this MCP server
- [Model Context Protocol](https://modelcontextprotocol.io/) - The protocol specification
- [MCP GitHub](https://github.com/modelcontextprotocol) - Official MCP repositories and SDKs
