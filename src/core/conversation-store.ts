import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import type {
  Conversation,
  ConversationSummary,
  ProjectStats,
} from "../types.js";
import { parseJsonlContent } from "./conversation-parser.js";

interface ListOptions {
  project?: string;
  after?: string;
  before?: string;
  limit?: number;
}

interface StoreStats {
  totalConversations: number;
  totalMessages: number;
  projects: ProjectStats[];
}

export class ConversationStore {
  private conversations = new Map<string, Conversation>();
  private projectsDir: string;

  constructor(projectsDir: string) {
    this.projectsDir = projectsDir;
  }

  async load(
    onProgress?: (current: number, total: number) => void,
  ): Promise<void> {
    this.conversations.clear();

    let projectDirs: string[];
    try {
      projectDirs = readdirSync(this.projectsDir).filter((name) => {
        const fullPath = join(this.projectsDir, name);
        return statSync(fullPath).isDirectory();
      });
    } catch {
      return;
    }

    // Count total JSONL files for progress reporting
    const filesByProject: Array<{
      project: string;
      path: string;
      files: string[];
    }> = [];
    let totalFiles = 0;
    for (const projectDir of projectDirs) {
      const projectPath = join(this.projectsDir, projectDir);
      const files = readdirSync(projectPath).filter((n) =>
        n.endsWith(".jsonl"),
      );
      filesByProject.push({ project: projectDir, path: projectPath, files });
      totalFiles += files.length;
    }

    let processed = 0;
    for (const { project, path, files } of filesByProject) {
      this.loadProject(project, path, files);
      processed += files.length;
      onProgress?.(processed, totalFiles);
    }
  }

  private loadProject(
    project: string,
    projectPath: string,
    entries: string[],
  ): void {
    for (const entry of entries) {
      const sessionId = entry.replace(".jsonl", "");
      const filePath = join(projectPath, entry);

      try {
        const raw = readFileSync(filePath, "utf-8");
        const messages = parseJsonlContent(raw);
        if (messages.length === 0) continue;

        const firstTimestamp = messages[0]!.timestamp;
        const lastTimestamp = messages[messages.length - 1]!.timestamp;

        // Extract cwd from the raw JSONL (first entry with cwd)
        let cwd = "";
        for (const line of raw.split("\n")) {
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.cwd) {
              cwd = parsed.cwd;
              break;
            }
          } catch {}
        }

        this.conversations.set(sessionId, {
          sessionId,
          project,
          cwd,
          messages,
          startedAt: firstTimestamp,
          lastMessageAt: lastTimestamp,
          messageCount: messages.length,
        });
      } catch {}
    }
  }

  listConversations(options: ListOptions = {}): ConversationSummary[] {
    let conversations = Array.from(this.conversations.values());

    if (options.project) {
      const query = options.project.toLowerCase();
      conversations = conversations.filter(
        (c) =>
          c.project.toLowerCase().includes(query) ||
          c.cwd.toLowerCase().includes(query),
      );
    }

    if (options.after) {
      const afterDate = new Date(options.after).getTime();
      conversations = conversations.filter(
        (c) => new Date(c.lastMessageAt).getTime() >= afterDate,
      );
    }

    if (options.before) {
      const beforeDate = new Date(options.before).getTime();
      conversations = conversations.filter(
        (c) => new Date(c.startedAt).getTime() <= beforeDate,
      );
    }

    conversations.sort(
      (a, b) =>
        new Date(b.lastMessageAt).getTime() -
        new Date(a.lastMessageAt).getTime(),
    );

    if (options.limit) {
      conversations = conversations.slice(0, options.limit);
    }

    return conversations.map((c) => {
      const firstUserMsg = c.messages.find((m) => m.type === "user");
      const preview = firstUserMsg
        ? firstUserMsg.content.slice(0, 200)
        : c.messages[0]!.content.slice(0, 200);

      return {
        sessionId: c.sessionId,
        project: c.project,
        cwd: c.cwd,
        startedAt: c.startedAt,
        lastMessageAt: c.lastMessageAt,
        messageCount: c.messageCount,
        preview,
      };
    });
  }

  getConversation(sessionId: string): Conversation | undefined {
    return this.conversations.get(sessionId);
  }

  getAllConversations(): Conversation[] {
    return Array.from(this.conversations.values());
  }

  getStats(): StoreStats {
    const projectMap = new Map<
      string,
      { cwd: string; conversations: Conversation[] }
    >();

    for (const conv of this.conversations.values()) {
      const existing = projectMap.get(conv.project);
      if (existing) {
        existing.conversations.push(conv);
        if (!existing.cwd && conv.cwd) existing.cwd = conv.cwd;
      } else {
        projectMap.set(conv.project, {
          cwd: conv.cwd,
          conversations: [conv],
        });
      }
    }

    const projects: ProjectStats[] = Array.from(projectMap.entries()).map(
      ([project, data]) => {
        const sorted = data.conversations.sort(
          (a, b) =>
            new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime(),
        );
        return {
          project,
          cwd: data.cwd,
          conversationCount: data.conversations.length,
          messageCount: data.conversations.reduce(
            (sum, c) => sum + c.messageCount,
            0,
          ),
          firstConversation: sorted[0]!.startedAt,
          lastConversation: sorted[sorted.length - 1]!.lastMessageAt,
        };
      },
    );

    projects.sort(
      (a, b) =>
        new Date(b.lastConversation).getTime() -
        new Date(a.lastConversation).getTime(),
    );

    return {
      totalConversations: this.conversations.size,
      totalMessages: Array.from(this.conversations.values()).reduce(
        (sum, c) => sum + c.messageCount,
        0,
      ),
      projects,
    };
  }
}
