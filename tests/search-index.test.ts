import { describe, expect, it } from "bun:test";
import { SearchIndex } from "../src/core/search-index.ts";
import type { Conversation } from "../src/types.ts";

function makeConversation(
  overrides: Partial<Conversation> & { sessionId: string },
): Conversation {
  return {
    project: "-Users-test-Projects-foo",
    cwd: "/Users/test/Projects/foo",
    messages: [],
    startedAt: "2026-03-25T10:00:00.000Z",
    lastMessageAt: "2026-03-25T10:05:00.000Z",
    messageCount: 0,
    ...overrides,
  };
}

describe("SearchIndex", () => {
  it("finds conversations by keyword", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([
      makeConversation({
        sessionId: "sess-1",
        messages: [
          {
            type: "user",
            content: "help me refactor the authentication module",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u1",
          },
          {
            type: "assistant",
            content: "I can help with the auth refactoring",
            timestamp: "2026-03-25T10:01:00.000Z",
            uuid: "u2",
          },
        ],
        messageCount: 2,
      }),
      makeConversation({
        sessionId: "sess-2",
        messages: [
          {
            type: "user",
            content: "fix the CSS button alignment",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u3",
          },
        ],
        messageCount: 1,
      }),
    ]);

    // Act
    const results = index.search("authentication");

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0]!.sessionId).toBe("sess-1");
  });

  it("returns results ranked by relevance", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([
      makeConversation({
        sessionId: "sess-low",
        messages: [
          {
            type: "user",
            content: "the database is slow today",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u1",
          },
        ],
        messageCount: 1,
      }),
      makeConversation({
        sessionId: "sess-high",
        messages: [
          {
            type: "user",
            content:
              "database migration failed on the database server, database logs show errors",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u2",
          },
        ],
        messageCount: 1,
      }),
    ]);

    // Act
    const results = index.search("database");

    // Assert
    expect(results.length).toBeGreaterThanOrEqual(2);
    expect(results[0]!.sessionId).toBe("sess-high");
    expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
  });

  it("filters results by project", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([
      makeConversation({
        sessionId: "sess-foo",
        project: "-Users-test-Projects-foo",
        messages: [
          {
            type: "user",
            content: "deploy the application",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u1",
          },
        ],
        messageCount: 1,
      }),
      makeConversation({
        sessionId: "sess-bar",
        project: "-Users-test-Projects-bar",
        cwd: "/Users/test/Projects/bar",
        messages: [
          {
            type: "user",
            content: "deploy the application",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u2",
          },
        ],
        messageCount: 1,
      }),
    ]);

    // Act
    const results = index.search("deploy", { project: "foo" });

    // Assert
    expect(results).toHaveLength(1);
    expect(results[0]!.sessionId).toBe("sess-foo");
  });

  it("limits number of results", () => {
    // Arrange
    const index = new SearchIndex();
    const conversations = Array.from({ length: 10 }, (_, i) =>
      makeConversation({
        sessionId: `sess-${i}`,
        messages: [
          {
            type: "user",
            content: "deploy the application",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: `u${i}`,
          },
        ],
        messageCount: 1,
      }),
    );
    index.buildFrom(conversations);

    // Act
    const results = index.search("deploy", { limit: 3 });

    // Assert
    expect(results).toHaveLength(3);
  });

  it("returns matching message snippets", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([
      makeConversation({
        sessionId: "sess-1",
        messages: [
          {
            type: "user",
            content: "how do I configure webpack",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u1",
          },
          {
            type: "assistant",
            content: "Here is the webpack configuration guide",
            timestamp: "2026-03-25T10:01:00.000Z",
            uuid: "u2",
          },
          {
            type: "user",
            content: "thanks that works",
            timestamp: "2026-03-25T10:02:00.000Z",
            uuid: "u3",
          },
        ],
        messageCount: 3,
      }),
    ]);

    // Act
    const results = index.search("webpack");

    // Assert
    expect(results[0]!.matches.length).toBeGreaterThan(0);
    expect(results[0]!.matches.some((m) => m.content.includes("webpack"))).toBe(
      true,
    );
  });

  it("returns empty array for no matches", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([
      makeConversation({
        sessionId: "sess-1",
        messages: [
          {
            type: "user",
            content: "hello world",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u1",
          },
        ],
        messageCount: 1,
      }),
    ]);

    // Act
    const results = index.search("nonexistent");

    // Assert
    expect(results).toHaveLength(0);
  });

  it("handles empty query gracefully", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([]);

    // Act
    const results = index.search("");

    // Assert
    expect(results).toHaveLength(0);
  });

  it("supports fuzzy matching", () => {
    // Arrange
    const index = new SearchIndex();
    index.buildFrom([
      makeConversation({
        sessionId: "sess-1",
        messages: [
          {
            type: "user",
            content: "refactoring the authentication module",
            timestamp: "2026-03-25T10:00:00.000Z",
            uuid: "u1",
          },
        ],
        messageCount: 1,
      }),
    ]);

    // Act — slight typo
    const results = index.search("authentcation");

    // Assert
    expect(results).toHaveLength(1);
  });
});
