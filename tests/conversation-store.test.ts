import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ConversationStore } from "../src/core/conversation-store.ts";

const TEST_DIR = join(import.meta.dir, ".test-projects");

const makeJsonlLine = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    type: "user",
    message: { role: "user", content: "test message" },
    timestamp: "2026-03-25T12:00:00.000Z",
    uuid: "uuid-1",
    sessionId: "session-1",
    cwd: "/Users/test/my-project",
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

describe("ConversationStore", () => {
  beforeEach(() => {
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it("discovers conversations from project directories", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-1", [
      makeJsonlLine({
        uuid: "u1",
        timestamp: "2026-03-20T10:00:00.000Z",
        message: { role: "user", content: "hello" },
      }),
      makeJsonlLine({
        type: "assistant",
        uuid: "u2",
        timestamp: "2026-03-20T10:05:00.000Z",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hi there" }],
        },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();

    // Assert
    const conversations = store.listConversations();
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.sessionId).toBe("sess-1");
    expect(conversations[0]!.project).toBe("-Users-test-Projects-foo");
    expect(conversations[0]!.messageCount).toBe(2);
  });

  it("lists conversations sorted by most recent first", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-old", [
      makeJsonlLine({
        uuid: "u1",
        timestamp: "2026-03-01T10:00:00.000Z",
        message: { role: "user", content: "old" },
      }),
    ]);
    setupFixture("-Users-test-Projects-foo", "sess-new", [
      makeJsonlLine({
        uuid: "u2",
        timestamp: "2026-03-25T10:00:00.000Z",
        message: { role: "user", content: "new" },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const conversations = store.listConversations();

    // Assert
    expect(conversations[0]!.sessionId).toBe("sess-new");
    expect(conversations[1]!.sessionId).toBe("sess-old");
  });

  it("filters conversations by project", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-foo", [
      makeJsonlLine({
        uuid: "u1",
        message: { role: "user", content: "foo msg" },
      }),
    ]);
    setupFixture("-Users-test-Projects-bar", "sess-bar", [
      makeJsonlLine({
        uuid: "u2",
        message: { role: "user", content: "bar msg" },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const fooConversations = store.listConversations({ project: "foo" });

    // Assert
    expect(fooConversations).toHaveLength(1);
    expect(fooConversations[0]!.sessionId).toBe("sess-foo");
  });

  it("filters conversations by date range", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-old", [
      makeJsonlLine({
        uuid: "u1",
        timestamp: "2026-01-15T10:00:00.000Z",
        message: { role: "user", content: "january" },
      }),
    ]);
    setupFixture("-Users-test-Projects-foo", "sess-new", [
      makeJsonlLine({
        uuid: "u2",
        timestamp: "2026-03-25T10:00:00.000Z",
        message: { role: "user", content: "march" },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const marchConversations = store.listConversations({
      after: "2026-03-01T00:00:00.000Z",
    });

    // Assert
    expect(marchConversations).toHaveLength(1);
    expect(marchConversations[0]!.sessionId).toBe("sess-new");
  });

  it("reads a specific conversation by session ID", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-1", [
      makeJsonlLine({
        uuid: "u1",
        message: { role: "user", content: "hello" },
      }),
      makeJsonlLine({
        type: "assistant",
        uuid: "u2",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "hi!" }],
        },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const conversation = store.getConversation("sess-1");

    // Assert
    expect(conversation).toBeDefined();
    expect(conversation!.messages).toHaveLength(2);
    expect(conversation!.messages[0]!.content).toBe("hello");
    expect(conversation!.messages[1]!.content).toBe("hi!");
  });

  it("returns undefined for unknown session ID", async () => {
    // Arrange
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();

    // Assert
    expect(store.getConversation("nonexistent")).toBeUndefined();
  });

  it("provides project stats", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-1", [
      makeJsonlLine({
        uuid: "u1",
        timestamp: "2026-03-20T10:00:00.000Z",
        message: { role: "user", content: "first" },
      }),
    ]);
    setupFixture("-Users-test-Projects-foo", "sess-2", [
      makeJsonlLine({
        uuid: "u2",
        timestamp: "2026-03-25T10:00:00.000Z",
        message: { role: "user", content: "second" },
      }),
    ]);
    setupFixture("-Users-test-Projects-bar", "sess-3", [
      makeJsonlLine({
        uuid: "u3",
        timestamp: "2026-03-22T10:00:00.000Z",
        message: { role: "user", content: "bar" },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const stats = store.getStats();

    // Assert
    expect(stats.totalConversations).toBe(3);
    expect(stats.totalMessages).toBe(3);
    expect(stats.projects).toHaveLength(2);

    const fooStats = stats.projects.find((p) => p.project.includes("foo"));
    expect(fooStats!.conversationCount).toBe(2);
  });

  it("limits results with limit parameter", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-1", [
      makeJsonlLine({
        uuid: "u1",
        timestamp: "2026-03-20T10:00:00.000Z",
        message: { role: "user", content: "first" },
      }),
    ]);
    setupFixture("-Users-test-Projects-foo", "sess-2", [
      makeJsonlLine({
        uuid: "u2",
        timestamp: "2026-03-25T10:00:00.000Z",
        message: { role: "user", content: "second" },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const conversations = store.listConversations({ limit: 1 });

    // Assert
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.sessionId).toBe("sess-2");
  });

  it("skips subagent directories", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-1", [
      makeJsonlLine({ uuid: "u1", message: { role: "user", content: "main" } }),
    ]);
    const subagentDir = join(
      TEST_DIR,
      "-Users-test-Projects-foo",
      "sess-1",
      "subagents",
    );
    mkdirSync(subagentDir, { recursive: true });
    writeFileSync(
      join(subagentDir, "agent-abc123.jsonl"),
      makeJsonlLine({
        uuid: "u2",
        sessionId: "agent-abc123",
        message: { role: "user", content: "subagent" },
      }),
    );
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const conversations = store.listConversations();

    // Assert
    expect(conversations).toHaveLength(1);
    expect(conversations[0]!.sessionId).toBe("sess-1");
  });

  it("generates preview from first user message", async () => {
    // Arrange
    setupFixture("-Users-test-Projects-foo", "sess-1", [
      makeJsonlLine({
        uuid: "u1",
        message: {
          role: "user",
          content: "Can you help me refactor the authentication module?",
        },
      }),
      makeJsonlLine({
        type: "assistant",
        uuid: "u2",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "Sure!" }],
        },
      }),
    ]);
    const store = new ConversationStore(TEST_DIR);

    // Act
    await store.load();
    const conversations = store.listConversations();

    // Assert
    expect(conversations[0]!.preview).toBe(
      "Can you help me refactor the authentication module?",
    );
  });
});
