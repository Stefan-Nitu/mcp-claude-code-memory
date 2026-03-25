import type { ConversationMessage } from "../types.js";

type ContentBlock = { type: string; text?: string; thinking?: string };
type MessageContent = string | ContentBlock[];

const XML_TAG_ONLY = /^<[^>]+>[\s\S]*<\/[^>]+>$/;

export function extractTextContent(content: MessageContent): string | null {
  if (typeof content === "string") {
    if (!content || XML_TAG_ONLY.test(content.trim())) return null;
    return content;
  }

  if (!Array.isArray(content) || content.length === 0) return null;

  const textParts = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!);

  return textParts.length > 0 ? textParts.join("\n") : null;
}

export function parseJsonlContent(raw: string): ConversationMessage[] {
  if (!raw) return [];

  const messagesByUuid = new Map<string, ConversationMessage>();
  const orderedUuids: string[] = [];

  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;

    let entry: Record<string, unknown>;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }

    const type = entry.type as string;
    if (type !== "user" && type !== "assistant") continue;
    if (entry.isMeta) continue;

    const message = entry.message as
      | { role: string; content: MessageContent }
      | undefined;
    if (!message) continue;

    const text = extractTextContent(message.content);
    if (!text) continue;

    const uuid = entry.uuid as string;
    const parsed: ConversationMessage = {
      type: type as "user" | "assistant",
      content: text,
      timestamp: entry.timestamp as string,
      uuid,
    };

    if (!messagesByUuid.has(uuid)) {
      orderedUuids.push(uuid);
    }
    messagesByUuid.set(uuid, parsed);
  }

  return orderedUuids.map((uuid) => messagesByUuid.get(uuid)!);
}
