# mcp-claude-code-memory

MCP server that gives Claude Code access to its own conversation history. Search, browse, and read past conversations across all projects.

## The Problem

Every Claude Code session starts fresh. You can't ask "what did we discuss about auth last week?" or "show me that refactoring conversation in evolve". Your conversation history sits in JSONL files on disk, invisible to Claude.

## The Solution

One MCP tool — `claude_code_history` — with four actions:

| Action | What it does | Key params |
|--------|-------------|------------|
| `stats` | Overview of all conversations and projects | — |
| `list` | Browse conversations by project/date | `project`, `after`, `before`, `limit` |
| `search` | BM25 keyword search across all history | `query`, `project`, `limit` |
| `read` | Read full conversation by session ID | `session_id`, `offset`, `limit` |

**The flow:** stats → list → search → read

## Install

```bash
npm install -g mcp-claude-code-memory
```

Or run directly with npx:

```bash
npx mcp-claude-code-memory
```

## Configure

Add to `~/.claude.json`:

```json
{
  "mcpServers": {
    "mcp-claude-code-memory": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "mcp-claude-code-memory"]
    }
  }
}
```

Or if running from source:

```json
{
  "mcpServers": {
    "mcp-claude-code-memory": {
      "type": "stdio",
      "command": "bun",
      "args": ["run", "/path/to/mcp-claude-code-memory/src/index.ts"]
    }
  }
}
```

Restart Claude Code to pick up the new server.

## Usage Examples

```
# "How many conversations do I have?"
→ action: stats

# "What was I working on in evolve last week?"
→ action: list, project: "evolve", after: "2026-03-18"

# "Find where we discussed the auth migration"
→ action: search, query: "auth migration"

# "Show me that full conversation"
→ action: read, session_id: "<id from search results>"
```

## How It Works

- Reads Claude Code's JSONL conversation files from `~/.claude/projects/`
- Indexes messages with [MiniSearch](https://github.com/lucaong/minisearch) (BM25 ranking)
- Background indexing on startup — server is available immediately
- Filters noise: skips thinking blocks, tool calls, system messages, meta content
- Deduplicates streamed assistant messages

## Development

```bash
# Install
bun install

# Dev (watch mode)
bun run dev

# Test
bun test

# Typecheck + lint
bun run check

# Build for npm
bun run build
```

## License

MIT
