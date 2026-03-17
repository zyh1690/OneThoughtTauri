/** Tauri 版 API：用 invoke 调用 Rust 命令，替代 Electron 的 window.oneThought */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { AppConfig, GroupedThoughts, QueryOptions, Thought } from "./types";

export async function getConfig(): Promise<AppConfig> {
  return invoke<AppConfig>("config_get");
}

export async function updateConfig(patch: Partial<AppConfig>): Promise<AppConfig> {
  return invoke<AppConfig>("config_update", { patch });
}

export async function createThought(payload: {
  content: string;
  tags?: string[];
  source?: "quick_input" | "main_ui";
}): Promise<Thought> {
  return invoke<Thought>("thought_create", { payload });
}

export async function updateThought(id: string, patch: Partial<Thought>): Promise<Thought | null> {
  return invoke<Thought | null>("thought_update", { id, patch });
}

export async function archiveThought(id: string, archived: boolean): Promise<Thought | null> {
  return invoke<Thought | null>("thought_archive", { id, archived });
}

export async function listThoughts(options: QueryOptions): Promise<GroupedThoughts[]> {
  return invoke<GroupedThoughts[]>("thought_list", { options });
}

export async function listAllThoughts(): Promise<Thought[]> {
  return invoke<Thought[]>("thought_list_all");
}

export async function deleteThought(id: string): Promise<boolean> {
  return invoke<boolean>("thought_delete", { id });
}

export async function removeTag(tagName: string): Promise<boolean> {
  return invoke<boolean>("tag_remove", { tagName });
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
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  maxTokens: number;
  timeoutMs: number;
}): Promise<void> {
  return invoke<void>("ai_summarize", { payload });
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
  return invoke<void>("update_hotkey", { newHotkey });
}

/** Enable or disable launch-at-login. Rejects with a human-readable message on failure. */
export async function setAutostart(enable: boolean): Promise<void> {
  return invoke<void>("set_autostart", { enable });
}
