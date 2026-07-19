# CodeGraph Usage Instructions

## When to Use CodeGraph

CodeGraph is initialized and indexed for this project. Always use CodeGraph tools BEFORE grep/find or reading files when you need to understand or locate code:

### Primary Tools (MCP - when available):
- `codegraph_explore` — Answers most code questions in one call: relevant symbols' verbatim source + call paths
- `codegraph_node` — Returns one symbol's source + callers, or reads a whole file with line numbers + dependents

### Shell Fallback (always works):
- `codegraph explore "<symbol names or question>"` — Same output as the MCP tool
- `codegraph node <symbol-or-file>` — Same output as the MCP tool

### Additional CLI Commands:
- `codegraph query <search>` — Search for symbols
- `codegraph callers <symbol>` — Find all callers of a symbol
- `codegraph callees <symbol>` — Find all callees of a symbol
- `codegraph impact <symbol>` — Analyze impact of changing a symbol
- `codegraph sync` — Sync changes since last index (for git hooks)

## Auto-Indexing

CodeGraph does NOT automatically re-index when code changes. To keep the index up to date:

1. **Manual sync**: Run `codegraph sync` after making changes
2. **Git hook setup** (optional): Add to your git hooks:
   ```bash
   # post-commit hook
   codegraph sync --quiet
   ```
3. **Before queries**: If you suspect the index is stale, run `codegraph sync` first

## Query Best Practices

- Prefer `codegraph_explore` for broad questions ("how does X work", "find all Y")
- Prefer `codegraph_node` for specific symbol lookups
- Use natural language queries: `codegraph explore "how does the viewer render blocks"`
- For TypeScript/JavaScript projects, CodeGraph indexes imports, functions, classes, methods, properties, and types

## Current Index Stats

- **Files**: 49 (45 TypeScript, 2 JavaScript, 2 YAML)
- **Nodes**: 561 (methods, functions, classes, interfaces, etc.)
- **Edges**: 1,403 (call relationships, imports, etc.)
