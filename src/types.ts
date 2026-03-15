/** 与 Electron 版 OneThought 的 src/main/types.ts 保持一致（仅复制到本工程，不修改原文件） */

export type ThoughtStatus = "active" | "done" | "idea" | "task";

export interface Thought {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  status: ThoughtStatus;
  archived: boolean;
  tags: string[];
  source: "quick_input" | "main_ui";
  pinned: boolean;
  summary_id: string | null;
  deleted?: boolean;
  meta: {
    device: string;
    app_version: string;
  };
}

export interface QueryOptions {
  viewMode: "day" | "month";
  from?: string;
  to?: string;
  archived?: boolean | null;
  tags?: string[];
  limit?: number;
  offset?: number;
}

export interface GroupedThoughts {
  groupKey: string;
  items: Thought[];
}

export interface AppConfig {
  hotkey: string;
  autoLaunch: boolean;
  llmEnabled: boolean;
  theme: "light" | "dark";
  aiSummaryPrompt: string;
  llm: {
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
    maxTokens: number;
  };
}
