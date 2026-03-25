import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConversationStore } from "../src/core/conversation-store.ts";
import { SearchIndex } from "../src/core/search-index.ts";
import { createHandler } from "../src/tools/handler.ts";

const TEST_DIR = join(import.meta.dir, ".test-projects");

const makeLine = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    type: "user",
    message: { role: "user", content: "test" },
    timestamp: "2026-03-25T12:00:00.000Z",
    uuid: "uuid-1",
    sessionId: "session-1",
    cwd: "/Users/test/project",
    isMeta: false,
    parentUuid: null,
    ...overrides,
  });

function setupFixture(projectDir: string, sessionId: string, lines: string[]) {
  mkdirSync(join(TEST_DIR, projectDir), { recursive: true });
  writeFileSync(
    join(TEST_DIR, projectDir, `${sessionId}.jsonl`),
    lines.join("\n"),
  );
}

describe("claude_code_history tool", () => {
  let store: ConversationStore;
  let index: SearchIndex;
  let handler: ReturnType<typeof createHandler>;

  beforeEach(async () => {
    mkdirSync(TEST_DIR, { recursive: true });

    setupFixture("-Users-test-Projects-auth", "sess-auth", [
      makeLine({
        uuid: "u1",
        timestamp: "2026-03-20T10:00:00.000Z",
        message: {
          role: "user",
          content: "fix the authentication bug in login",
        },
      }),
      makeLine({
        type: "assistant",
        uuid: "u2",
        timestamp: "2026-03-20T10:01:00.000Z",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "I found the issue in the auth middleware" },
          ],
        },
      }),
    ]);

    setupFixture("-Users-test-Projects-ui", "sess-ui", [
      makeLine({
        uuid: "u3",
        timestamp: "2026-03-22T10:00:00.000Z",
        cwd: "/Users/test/Projects/ui",
        message: { role: "user", content: "align the CSS buttons properly" },
      }),
      makeLine({
        type: "assistant",
        uuid: "u4",
        timestamp: "2026-03-22T10:01:00.000Z",
        cwd: "/Users/test/Projects/ui",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I'll fix the button alignment" }],
        },
      }),
      makeLine({
        uuid: "u5",
        timestamp: "2026-03-22T10:02:00.000Z",
        cwd: "/Users/test/Projects/ui",
        message: { role: "user", content: "also fix the header spacing" },
      }),
    ]);

    store = new ConversationStore(TEST_DIR);
    await store.load();
    index = new SearchIndex();
    index.buildFrom(store.getAllConversations());
    handler = createHandler(store, index);
    handler.setReady();
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  describe("action: search", () => {
    it("returns matching conversations with snippets", () => {
      // Act
      const result = handler.handle({
        action: "search",
        query: "authentication",
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.results.length).toBeGreaterThan(0);
      expect(parsed.results[0].sessionId).toBe("sess-auth");
      expect(parsed.results[0].matches.length).toBeGreaterThan(0);
    });

    it("filters by project", () => {
      // Act
      const result = handler.handle({
        action: "search",
        query: "fix",
        project: "ui",
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(
        parsed.results.every((r: { project: string }) =>
          r.project.includes("ui"),
        ),
      ).toBe(true);
    });

    it("respects limit parameter", () => {
      // Act
      const result = handler.handle({
        action: "search",
        query: "fix",
        limit: 1,
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.results.length).toBe(1);
    });

    it("returns empty results for no matches", () => {
      // Act
      const result = handler.handle({
        action: "search",
        query: "nonexistent_xyz",
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.results).toHaveLength(0);
    });

    it("returns error when query is missing", () => {
      // Act
      const result = handler.handle({ action: "search" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("query");
    });
  });

  describe("action: list", () => {
    it("returns conversations sorted by recency", () => {
      // Act
      const result = handler.handle({ action: "list" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.conversations).toHaveLength(2);
      expect(parsed.conversations[0].sessionId).toBe("sess-ui");
    });

    it("filters by project", () => {
      // Act
      const result = handler.handle({ action: "list", project: "auth" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.conversations).toHaveLength(1);
      expect(parsed.conversations[0].sessionId).toBe("sess-auth");
    });

    it("filters by date", () => {
      // Act
      const result = handler.handle({
        action: "list",
        after: "2026-03-21T00:00:00.000Z",
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.conversations).toHaveLength(1);
      expect(parsed.conversations[0].sessionId).toBe("sess-ui");
    });

    it("respects limit", () => {
      // Act
      const result = handler.handle({ action: "list", limit: 1 });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.conversations).toHaveLength(1);
    });
  });

  describe("action: read", () => {
    it("returns full conversation messages", () => {
      // Act
      const result = handler.handle({ action: "read", session_id: "sess-ui" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.messages).toHaveLength(3);
      expect(parsed.messages[0].type).toBe("user");
      expect(parsed.messages[0].content).toContain("CSS buttons");
    });

    it("returns error for unknown session", () => {
      // Act
      const result = handler.handle({
        action: "read",
        session_id: "nonexistent",
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.error).toBeDefined();
    });

    it("supports pagination with offset and limit", () => {
      // Act
      const result = handler.handle({
        action: "read",
        session_id: "sess-ui",
        offset: 1,
        limit: 1,
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.messages).toHaveLength(1);
      expect(parsed.messages[0].content).toContain("button alignment");
    });

    it("returns error when session_id is missing", () => {
      // Act
      const result = handler.handle({ action: "read" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.error).toContain("session_id");
    });
  });

  describe("action: stats", () => {
    it("returns overall stats", () => {
      // Act
      const result = handler.handle({ action: "stats" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.totalConversations).toBe(2);
      expect(parsed.totalMessages).toBe(5);
      expect(parsed.projects.length).toBe(2);
    });

    it("includes per-project breakdown", () => {
      // Act
      const result = handler.handle({ action: "stats" });

      // Assert
      const parsed = JSON.parse(result);
      const uiProject = parsed.projects.find((p: { project: string }) =>
        p.project.includes("ui"),
      );
      expect(uiProject).toBeDefined();
      expect(uiProject.conversationCount).toBe(1);
      expect(uiProject.messageCount).toBe(3);
    });
  });

  describe("indexing in progress", () => {
    it("returns indexing status when not ready", () => {
      // Arrange
      const notReadyHandler = createHandler(store, index);

      // Act
      const result = notReadyHandler.handle({
        action: "search",
        query: "test",
      });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("indexing");
      expect(parsed.message).toContain("indexing");
    });

    it("includes progress info when available", () => {
      // Arrange
      const notReadyHandler = createHandler(store, index);
      notReadyHandler.setProgress(42, 117);

      // Act
      const result = notReadyHandler.handle({ action: "stats" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.status).toBe("indexing");
      expect(parsed.progress).toBe("42/117 conversations indexed");
    });

    it("works normally after setReady", () => {
      // Arrange
      const h = createHandler(store, index);
      h.setReady();

      // Act
      const result = h.handle({ action: "stats" });

      // Assert
      const parsed = JSON.parse(result);
      expect(parsed.totalConversations).toBeDefined();
      expect(parsed.status).toBeUndefined();
    });
  });
});
