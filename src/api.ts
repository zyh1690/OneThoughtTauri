/** Tauri 版 API：用 invoke 调用 Rust 命令，替代 Electron 的 window.oneThought */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, GroupedThoughts, QueryOptions, TagMetadata, Thought } from "./types";

const STATE_NOT_MANAGED = "state not managed";
let backendReadyPromise: Promise<void> | null = null;

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackendReady(timeoutMs = 10_000): Promise<void> {
  if (!backendReadyPromise) {
    backendReadyPromise = (async () => {
      const started = Date.now();
      while (Date.now() - started < timeoutMs) {
        try {
          if (await invoke<boolean>("backend_ready")) return;
        } catch {
          // The command handler can be unavailable for a very short window while WebView boots.
        }
        await delay(50);
      }
      throw new Error("后端初始化超时，请检查 onethought.log 日志文件。");
    })().catch((error) => {
      backendReadyPromise = null;
      throw error;
    });
  }
  return backendReadyPromise;
}

async function invokeManaged<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  await waitForBackendReady();
  try {
    return await invoke<T>(command, args);
  } catch (error) {
    if (String(error).includes(STATE_NOT_MANAGED)) {
      backendReadyPromise = null;
      await delay(100);
      await waitForBackendReady();
      return invoke<T>(command, args);
    }
    throw error;
  }
}

export async function getConfig(): Promise<AppConfig> {
  return invokeManaged<AppConfig>("config_get");
}

export async function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  return invokeManaged<AppConfig>("config_update", { patch });
}

export async function createThought(payload: {
  content: string;
  tags?: string[];
  source?: "quick_input" | "main_ui";
}): Promise<Thought> {
  return invokeManaged<Thought>("thought_create", { payload });
}

export async function updateThought(id: string, patch: Partial<Thought>): Promise<Thought | null> {
  return invokeManaged<Thought | null>("thought_update", { id, patch });
}

export async function archiveThought(id: string, archived: boolean): Promise<Thought | null> {
  return invokeManaged<Thought | null>("thought_archive", { id, archived });
}

export async function listThoughts(options: QueryOptions): Promise<GroupedThoughts[]> {
  return invokeManaged<GroupedThoughts[]>("thought_list", { options });
}

export async function listAllThoughts(): Promise<Thought[]> {
  return invokeManaged<Thought[]>("thought_list_all");
}

export async function listTagMetadata(): Promise<TagMetadata[]> {
  return invokeManaged<TagMetadata[]>("tag_metadata");
}

export async function deleteThought(id: string): Promise<boolean> {
  return invokeManaged<boolean>("thought_delete", { id });
}

export async function deleteThoughts(ids: string[]): Promise<number> {
  const result = await invokeManaged<{ deleted: number }>("thought_delete_many", { payload: { ids } });
  return result.deleted;
}

export async function removeTag(tagName: string): Promise<boolean> {
  return invokeManaged<boolean>("tag_remove", { tagName });
}

export function onThoughtUpdated(callback: () => void): Promise<() => void> {
  return listen("thought_updated", () => {
    callback();
  });
}

export function onShowQuickCapture(callback: () => void): Promise<() => void> {
  return listen("show_quick_capture", () => {
    callback();
  });
}

export async function aiSummarize(payload: {
  llmMode: "internal" | "external";
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<void> {
  return invokeManaged<void>("ai_summarize", { payload });
}

export function onAiStreamChunk(callback: (chunk: string) => void): Promise<() => void> {
  return listen<string>("ai_stream_chunk", (e) => callback(e.payload));
}

export function onAiStreamDone(callback: () => void): Promise<() => void> {
  return listen("ai_stream_done", () => callback());
}

export function onAiStreamError(callback: (error: string) => void): Promise<() => void> {
  return listen<string>("ai_stream_error", (e) => callback(e.payload));
}

/** Re-register the global hotkey at runtime. Rejects with a message if the key is already taken. */
export async function updateHotkey(newHotkey: string): Promise<void> {
  return invokeManaged<void>("update_hotkey", { newHotkey });
}

/** Enable or disable launch-at-login. Rejects with a human-readable message on failure. */
export async function setAutostart(enable: boolean): Promise<void> {
  return invokeManaged<void>("set_autostart", { enable });
}
