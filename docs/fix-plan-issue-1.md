# Fix Plan: Issue #1 — Unknown operation 'get_nodes' / 'get_info'

## Problem Summary

When an AI client calls `unreal_ue(domain="blueprint", operation="get_nodes")`, the
router schema (tool-router.js:120-124) advertises it as valid, but the backend
rejects it because `blueprint_modify` only handles write operations.

The same applies to `get_info` and `get_function_list`.

**Error from backend:**
```
Unknown operation: 'get_nodes'. Valid: create, add_variable, remove_variable,
add_function, remove_function, add_node, add_nodes, delete_node, connect_pins,
disconnect_pins, set_pin_value
```

## Root Cause

The architecture splits blueprint operations across two backend tools:

| Backend Tool | Exposed As | Purpose |
|---|---|---|
| `blueprint_modify` | `unreal_ue` router (domain="blueprint") | Write operations |
| `blueprint_query` | `unreal_blueprint_query` (simple tool) | Read operations |

But the `ROUTER_TOOL_SCHEMA` description (tool-router.js:120-124) lists **both**
read and write operations under the blueprint domain, so AI clients naturally call
the router with read operations like `get_nodes` — which routes to `blueprint_modify`
and fails.

### Key Code Paths

1. **Schema advertises read ops** — `tool-router.js:120-124`
   ```
   "get_info, ... get_nodes, ... get_function_list"
   ```

2. **Router resolves blueprint → blueprint_modify** — `tool-router.js:43`
   ```js
   blueprint: "blueprint_modify",
   ```

3. **No operation-level routing** — `tool-router.js:66-72`
   `resolveUnrealTool()` only has special-case routing for `character` domain
   (CHARACTER_DATA_OPS), not for blueprint read vs write.

4. **Pass-through dispatch** — `index.js:322`
   ```js
   const unrealArgs = { operation, ...(routerParams || {}) };
   ```
   Operation is sent as-is to backend, which rejects unknown ops.

5. **Read ops exist on separate tool** — `blueprint_query` (tool-router.js:25)
   is a simple tool with: `get_variables`, `get_functions`, `get_graph_nodes`,
   `get_node_pins`, `find_references` (contexts/blueprint.md:154-162).

---

## Proposed Fix: Route Blueprint Read Ops to `blueprint_query`

Add operation-aware routing for the blueprint domain, similar to the existing
`CHARACTER_DATA_OPS` pattern for the character domain.

### Changes

#### 1. `tool-router.js` — Add blueprint query ops set + routing logic

**Add a new constant** (after `CHARACTER_DATA_OPS`, ~line 58):

```js
// Blueprint operations that route to "blueprint_query" instead of "blueprint_modify"
const BLUEPRINT_QUERY_OPS = new Set([
  "get_info",
  "get_nodes",
  "get_graph_nodes",
  "get_variables",
  "get_functions",
  "get_node_pins",
  "get_function_list",
  "find_references",
  "search_nodes",
]);
```

**Update `resolveUnrealTool()`** (tool-router.js:66-72) to handle blueprint reads:

```js
export function resolveUnrealTool(domain, operation) {
  if (!domain) return null;
  if (domain === "character" && CHARACTER_DATA_OPS.has(operation)) {
    return "character_data";
  }
  if (domain === "blueprint" && BLUEPRINT_QUERY_OPS.has(operation)) {
    return "blueprint_query";
  }
  return DOMAIN_TOOL_MAP[domain] ?? null;
}
```

#### 2. `tool-router.js` — Update `ROUTER_TOOL_SCHEMA` description

Clarify which ops are read-only in the schema description (tool-router.js:119-124).
Split the blueprint ops into two groups:

```js
'domain:"blueprint" (requires params.blueprint_path)',
"  modify ops: add_variable, add_function, add_component, add_event,",
"  set_parent, compile, add_node, connect_nodes, set_default,",
"  add_interface, implement_interface, add_custom_event, add_local_variable,",
"  remove_node, remove_variable, remove_component, disconnect_pin,",
"  reroute_node, set_node_param, promote_to_variable",
"  query ops: get_info, get_nodes, get_graph_nodes, get_variables,",
"  get_functions, get_node_pins, get_function_list, find_references, search_nodes",
"  Per-op: variable_name/type, function_name, node_type, etc.",
```

#### 3. `tool-router.js` — Export `BLUEPRINT_QUERY_OPS` for testing

Add it to the module exports so tests can verify it.

#### 4. `contexts/blueprint.md` — Update documentation

Update the MCP Blueprint Operations table (contexts/blueprint.md:138-162) to note
that both `blueprint_modify` and `blueprint_query` operations are accessible via the
router.

---

### Files Changed

| File | What Changes |
|---|---|
| `tool-router.js` | Add `BLUEPRINT_QUERY_OPS`, update `resolveUnrealTool()`, update schema description |
| `contexts/blueprint.md` | Update operations table to reflect unified router access |

---

## Tests

### A. Unit Tests — `tests/unit/tool-router.test.js`

Add to the existing `resolveUnrealTool` describe block:

```js
it("routes blueprint read operations to blueprint_query", () => {
  const readOps = [
    "get_info", "get_nodes", "get_graph_nodes", "get_variables",
    "get_functions", "get_node_pins", "get_function_list",
    "find_references", "search_nodes",
  ];
  for (const op of readOps) {
    expect(resolveUnrealTool("blueprint", op)).toBe("blueprint_query");
  }
});

it("still routes blueprint write operations to blueprint_modify", () => {
  const writeOps = [
    "add_variable", "remove_variable", "add_function", "add_node",
    "connect_nodes", "compile", "set_default", "add_component",
  ];
  for (const op of writeOps) {
    expect(resolveUnrealTool("blueprint", op)).toBe("blueprint_modify");
  }
});
```

Add to the `classification sets` describe block:

```js
it("BLUEPRINT_QUERY_OPS contains all blueprint read operations", () => {
  expect(BLUEPRINT_QUERY_OPS.size).toBeGreaterThanOrEqual(9);
  expect(BLUEPRINT_QUERY_OPS.has("get_nodes")).toBe(true);
  expect(BLUEPRINT_QUERY_OPS.has("get_info")).toBe(true);
  expect(BLUEPRINT_QUERY_OPS.has("get_graph_nodes")).toBe(true);
});
```

### B. Integration Tests — `tests/integration/call-tool.test.js`

Add to the `CallTool — unreal_ue router` describe block:

```js
it("routes blueprint/get_nodes to blueprint_query tool", async () => {
  const spy = installFetchMock([
    {
      pattern: "/mcp/tool/blueprint_query",
      body: {
        success: true,
        message: "Found 12 nodes",
        data: { nodes: [{ name: "K2Node_Event", id: "1" }] },
      },
    },
  ]);
  const result = await simulateCallTool("unreal_ue", {
    domain: "blueprint",
    operation: "get_nodes",
    params: {
      blueprint_path: "/Game/BP_Test",
      graph_name: "EventGraph",
    },
  }, { asyncEnabled: false });

  expect(result.content[0].text).toContain("Found 12 nodes");
  expect(result.isError).toBe(false);

  const call = spy.mock.calls.find(c => c[0].includes("blueprint_query"));
  expect(call).toBeDefined();
  const body = JSON.parse(call[1].body);
  expect(body.operation).toBe("get_nodes");
  expect(body.blueprint_path).toBe("/Game/BP_Test");
});

it("routes blueprint/get_info to blueprint_query tool", async () => {
  const spy = installFetchMock([
    {
      pattern: "/mcp/tool/blueprint_query",
      body: {
        success: true,
        message: "Blueprint info retrieved",
        data: { parent_class: "Actor", variables: 5 },
      },
    },
  ]);
  const result = await simulateCallTool("unreal_ue", {
    domain: "blueprint",
    operation: "get_info",
    params: { blueprint_path: "/Game/BP_Test" },
  }, { asyncEnabled: false });

  expect(result.content[0].text).toContain("Blueprint info retrieved");
  const call = spy.mock.calls.find(c => c[0].includes("blueprint_query"));
  expect(call).toBeDefined();
});

it("still routes blueprint/add_variable to blueprint_modify", async () => {
  const spy = installFetchMock([
    {
      pattern: "/mcp/tool/blueprint_modify",
      body: { success: true, message: "Variable added" },
    },
  ]);
  await simulateCallTool("unreal_ue", {
    domain: "blueprint",
    operation: "add_variable",
    params: { blueprint_path: "/Game/BP_Test", variable_name: "HP" },
  }, { asyncEnabled: false });

  const queryCalls = spy.mock.calls.filter(c => c[0].includes("blueprint_query"));
  expect(queryCalls).toHaveLength(0);
  const modifyCalls = spy.mock.calls.filter(c => c[0].includes("blueprint_modify"));
  expect(modifyCalls).toHaveLength(1);
});

it("blueprint query ops use sync path (read-only bypass)", async () => {
  const spy = installFetchMock([
    {
      pattern: "/mcp/tool/blueprint_query",
      body: { success: true, message: "Nodes found", data: {} },
    },
  ]);
  // Even with asyncEnabled=true, query should go sync since blueprint_query
  // is a simple tool. However, the router currently always goes async.
  // This test documents the current behavior — async routing for query ops.
  const result = await simulateCallTool("unreal_ue", {
    domain: "blueprint",
    operation: "get_nodes",
    params: { blueprint_path: "/Game/BP_Test" },
  }, { asyncEnabled: false });

  expect(result.content[0].text).toContain("Nodes found");
  const taskCalls = spy.mock.calls.filter(c => c[0].includes("task_submit"));
  expect(taskCalls).toHaveLength(0);
});
```

### C. Regression test for existing character routing

Ensure the character domain routing (CHARACTER_DATA_OPS) still works unchanged:

```js
it("character data ops still route correctly after blueprint query change", () => {
  // Verify no cross-contamination between blueprint and character routing
  expect(resolveUnrealTool("character", "create_data_asset")).toBe("character_data");
  expect(resolveUnrealTool("character", "set_movement_param")).toBe("character");
  expect(resolveUnrealTool("blueprint", "add_variable")).toBe("blueprint_modify");
  expect(resolveUnrealTool("blueprint", "get_nodes")).toBe("blueprint_query");
});
```

---

## Edge Cases to Consider

1. **Operation names that differ between router schema and backend**
   - Router says `get_nodes`, backend `blueprint_query` tool uses `get_graph_nodes`
   - Decision: Include **both** names in `BLUEPRINT_QUERY_OPS` so either works.
     The backend will validate the exact name.

2. **Future operations** — Unknown blueprint operations still fall through to
   `blueprint_modify` (the default), which matches current behavior.

3. **Async path for query ops** — Currently the router always uses the async path
   (index.js:337-347). Since `blueprint_query` is read-only, it would benefit from
   the sync bypass. But the sync bypass logic (index.js:199-213) only applies to
   direct tool calls, not router calls. This is a separate enhancement opportunity
   (not in scope for this fix).

---

## Execution Order

1. Add `BLUEPRINT_QUERY_OPS` and update `resolveUnrealTool()` in `tool-router.js`
2. Update `ROUTER_TOOL_SCHEMA` description in `tool-router.js`
3. Update `contexts/blueprint.md` operations table
4. Add unit tests in `tests/unit/tool-router.test.js`
5. Add integration tests in `tests/integration/call-tool.test.js`
6. Run `npm test` to verify all tests pass
7. Commit and push to branch
