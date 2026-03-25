import { describe, expect, it } from "bun:test";
import {
  extractTextContent,
  parseJsonlContent,
} from "../src/core/conversation-parser.ts";

const makeEntry = (overrides: Record<string, unknown>) =>
  JSON.stringify({
    type: "user",
    message: { role: "user", content: "hello" },
    timestamp: "2026-03-25T12:00:00.000Z",
    uuid: "test-uuid-1",
    sessionId: "session-1",
    cwd: "/Users/test/project",
    isMeta: false,
    parentUuid: null,
    ...overrides,
  });

describe("extractTextContent", () => {
  it("extracts plain string content", () => {
    // Arrange
    const content = "hello world";

    // Act
    const result = extractTextContent(content);

    // Assert
    expect(result).toBe("hello world");
  });

  it("extracts text from content array", () => {
    // Arrange
    const content = [
      { type: "text", text: "first part" },
      { type: "text", text: "second part" },
    ];

    // Act
    const result = extractTextContent(content);

    // Assert
    expect(result).toBe("first part\nsecond part");
  });

  it("ignores thinking blocks in content array", () => {
    // Arrange
    const content = [
      { type: "thinking", thinking: "internal reasoning" },
      { type: "text", text: "visible response" },
    ];

    // Act
    const result = extractTextContent(content);

    // Assert
    expect(result).toBe("visible response");
  });

  it("ignores tool_use blocks in content array", () => {
    // Arrange
    const content = [
      { type: "text", text: "Let me check." },
      { type: "tool_use", id: "toolu_123", name: "Read", input: {} },
    ];

    // Act
    const result = extractTextContent(content);

    // Assert
    expect(result).toBe("Let me check.");
  });

  it("returns null for empty content", () => {
    expect(extractTextContent("")).toBeNull();
    expect(extractTextContent([])).toBeNull();
  });

  it("returns null for xml-tag-only content (system messages)", () => {
    // Arrange
    const content = "<command-name>/usage</command-name>";

    // Act
    const result = extractTextContent(content);

    // Assert
    expect(result).toBeNull();
  });

  it("returns null for local-command-stdout content", () => {
    // Arrange
    const content =
      "<local-command-stdout>Status dialog dismissed</local-command-stdout>";

    // Act
    const result = extractTextContent(content);

    // Assert
    expect(result).toBeNull();
  });
});

describe("parseJsonlContent", () => {
  it("parses user messages", () => {
    // Arrange
    const lines = [
      makeEntry({
        type: "user",
        message: { role: "user", content: "hello world" },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("user");
    expect(messages[0]!.content).toBe("hello world");
    expect(messages[0]!.timestamp).toBe("2026-03-25T12:00:00.000Z");
  });

  it("parses assistant messages with text content", () => {
    // Arrange
    const lines = [
      makeEntry({
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "I can help with that." }],
        },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert
    expect(messages).toHaveLength(1);
    expect(messages[0]!.type).toBe("assistant");
    expect(messages[0]!.content).toBe("I can help with that.");
  });

  it("skips meta messages", () => {
    // Arrange
    const lines = [
      makeEntry({
        isMeta: true,
        message: { role: "user", content: "meta content" },
      }),
      makeEntry({
        uuid: "test-uuid-2",
        message: { role: "user", content: "real content" },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("real content");
  });

  it("skips system messages", () => {
    // Arrange
    const lines = [
      makeEntry({ type: "system", subtype: "local_command" }),
      makeEntry({
        type: "user",
        uuid: "test-uuid-2",
        message: { role: "user", content: "real" },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("real");
  });

  it("skips progress and file-history-snapshot entries", () => {
    // Arrange
    const lines = [
      makeEntry({ type: "progress" }),
      makeEntry({ type: "file-history-snapshot" }),
      makeEntry({
        type: "user",
        uuid: "test-uuid-2",
        message: { role: "user", content: "real" },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert
    expect(messages).toHaveLength(1);
  });

  it("skips messages with only xml/command content", () => {
    // Arrange
    const lines = [
      makeEntry({
        message: {
          role: "user",
          content: "<command-name>/resume</command-name>",
        },
      }),
      makeEntry({
        uuid: "test-uuid-2",
        message: { role: "user", content: "actual user question" },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("actual user question");
  });

  it("handles malformed JSON lines gracefully", () => {
    // Arrange
    const content = `not json\n${makeEntry({ message: { role: "user", content: "valid" } })}`;

    // Act
    const messages = parseJsonlContent(content);

    // Assert
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("valid");
  });

  it("handles empty input", () => {
    // Act
    const messages = parseJsonlContent("");

    // Assert
    expect(messages).toHaveLength(0);
  });

  it("deduplicates streamed assistant messages by uuid", () => {
    // Arrange — assistant messages arrive as multiple lines with same uuid (streaming)
    const lines = [
      makeEntry({
        type: "assistant",
        uuid: "same-uuid",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "partial" }],
        },
      }),
      makeEntry({
        type: "assistant",
        uuid: "same-uuid",
        message: {
          role: "assistant",
          content: [{ type: "text", text: "partial response complete" }],
        },
      }),
    ];

    // Act
    const messages = parseJsonlContent(lines.join("\n"));

    // Assert — keep the last (most complete) version
    expect(messages).toHaveLength(1);
    expect(messages[0]!.content).toBe("partial response complete");
  });
});
