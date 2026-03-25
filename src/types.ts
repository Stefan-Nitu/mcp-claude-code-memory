export interface ConversationMessage {
  type: "user" | "assistant";
  content: string;
  timestamp: string;
  uuid: string;
}

export interface Conversation {
  sessionId: string;
  project: string;
  cwd: string;
  messages: ConversationMessage[];
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
}

export interface SearchResult {
  sessionId: string;
  project: string;
  cwd: string;
  score: number;
  matches: Array<{
    type: "user" | "assistant";
    content: string;
    timestamp: string;
  }>;
}

export interface ConversationSummary {
  sessionId: string;
  project: string;
  cwd: string;
  startedAt: string;
  lastMessageAt: string;
  messageCount: number;
  preview: string;
}

export interface ProjectStats {
  project: string;
  cwd: string;
  conversationCount: number;
  messageCount: number;
  firstConversation: string;
  lastConversation: string;
}

export interface RawJsonlEntry {
  type: string;
  subtype?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
  };
  timestamp: string;
  uuid: string;
  sessionId: string;
  cwd?: string;
  isMeta?: boolean;
  parentUuid: string | null;
}
