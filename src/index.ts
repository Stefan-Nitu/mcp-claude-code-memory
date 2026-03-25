#!/usr/bin/env node

import { homedir } from "node:os";
import { join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ConversationStore } from "./core/conversation-store.js";
import { SearchIndex } from "./core/search-index.js";
import { historyToolSchema } from "./tools/definitions.js";
import { createHandler } from "./tools/handler.js";
import { flushLogs, logger } from "./utils/logger.js";

const PROJECTS_DIR = join(homedir(), ".claude", "projects");

const server = new McpServer({
  name: "mcp-claude-code-memory",
  version: "0.1.0",
});

const store = new ConversationStore(PROJECTS_DIR);
const index = new SearchIndex();
const handler = createHandler(store, index);

server.tool(
  "claude_code_history",
  `Search, browse, and read Claude Code conversation history.

Actions:
- search: BM25 keyword search (requires: query, optional: project, limit)
- list: Browse by project/date (optional: project, after, before, limit)
- read: Read full conversation (requires: session_id, optional: offset, limit)
- stats: Overview of all conversations and projects`,
  historyToolSchema.shape,
  async (args) => ({
    content: [{ type: "text", text: handler.handle(args) }],
  }),
);

async function main() {
  const transport = new StdioServerTransport();

  let cleanupStarted = false;

  const cleanup = async () => {
    if (cleanupStarted) return;
    cleanupStarted = true;

    logger.info("Shutting down...");
    flushLogs();

    const timeoutId = setTimeout(() => {
      logger.error("Cleanup timeout - forcing exit after 5 seconds");
      flushLogs();
      process.exit(1);
    }, 5000);

    try {
      await server.close();
      clearTimeout(timeoutId);
      logger.info("Cleanup completed");
      process.exit(0);
    } catch (error) {
      clearTimeout(timeoutId);
      logger.error({ err: error }, "Error during cleanup");
      flushLogs();
      process.exit(1);
    }
  };

  process.once("SIGINT", cleanup);
  process.once("SIGTERM", cleanup);

  await server.connect(transport);

  process.stdin.once("end", cleanup);
  process.stdin.once("close", cleanup);

  logger.info("Server started, indexing...");

  try {
    await store.load((current, total) => {
      handler.setProgress(current, total);
    });
    index.buildFrom(store.getAllConversations());
    handler.setReady();

    const stats = store.getStats();
    logger.info(
      {
        conversations: stats.totalConversations,
        messages: stats.totalMessages,
        projects: stats.projects.length,
      },
      "Indexing complete",
    );
  } catch (error) {
    logger.error({ err: error }, "Indexing failed");
    handler.setReady();
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  flushLogs();
  process.exit(1);
});
