import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Window, LogicalSize, getCurrentWindow } from "@tauri-apps/api/window";
import * as api from "./api";
import type { Thought } from "./types";
import { extractTagsFromContent } from "./utils/tags";

const TAG_COLORS = ["0", "1", "2", "3", "4"] as const;
function tagColorIndex(tag: string, allTags: string[]): string {
  const i = allTags.indexOf(tag);
  return TAG_COLORS[i % TAG_COLORS.length];
}

export default function QuickCapture() {
  const [thought, setThought] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [allThoughts, setAllThoughts] = useState<Thought[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    allThoughts.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allThoughts]);

  const close = useCallback(async () => {
    setThought("");
    setSaveStatus("idle");
    await Window.getByLabel("quick_capture").then((win) => win?.hide());
  }, []);

  const refreshTags = useCallback(() => {
    void api.listAllThoughts().then(setAllThoughts);
  }, []);

  useEffect(() => {
    refreshTags();
    const t = setTimeout(() => textareaRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [refreshTags]);

  // Keep tag chips in sync with main window (same as App.tsx via thought_updated)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    void api.onThoughtUpdated(refreshTags).then((fn) => {
      unlisten = fn;
    });
    return () => {
      unlisten?.();
    };
  }, [refreshTags]);

  // Global Escape listener — catches Esc even when textarea is not focused.
  // Necessary on Windows where focus timing can differ from macOS.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing) return;
      if (e.key === "Escape") void close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [close]);

  // Resize window height to exactly fit the card content.
  // Width is fixed at 580px (matching the window config), so only height needs adjusting.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    let timer: ReturnType<typeof setTimeout>;

    const applySize = async (h: number) => {
      const win = await Window.getByLabel("quick_capture");
      if (!win) return;
      await win.setSize(new LogicalSize(580, Math.ceil(h)));
      await win.center();
    };

    const fitHeight = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const h = card.getBoundingClientRect().height;
        if (h > 0) void applySize(h);
      }, 20);
    };

    // ResizeObserver handles tag-row changes while window is visible
    const ro = new ResizeObserver(fitHeight);
    ro.observe(card);

    // Use Tauri's onFocusChanged — fires reliably when Rust calls win.set_focus().
    // Refresh tags (sync with main window) + refit height when the popup is shown.
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          refreshTags();
          fitHeight();
        }
      })
      .then((fn) => {
        unlisten = fn;
      });

    // Fallback: retry every 200ms until we get a non-zero height (covers the case
    // where the hidden window's layout IS computed before first focus).
    let retries = 0;
    const retry = () => {
      const h = card.getBoundingClientRect().height;
      if (h > 0) { void applySize(h); return; }
      if (retries++ < 20) setTimeout(retry, 200);
    };
    setTimeout(retry, 100);

    return () => {
      ro.disconnect();
      unlisten?.();
      clearTimeout(timer);
    };
  }, [refreshTags]);

  const submit = async () => {
    if (!thought.trim()) return;
    const tags = extractTagsFromContent(thought);
    await api.createThought({ content: thought.trim(), tags, source: "quick_input" });
    setSaveStatus("success");
    setTimeout(() => void close(), 700);
  };

  const hashMatch = thought.match(/#([^\s#]*)$/u);
  const prefix = hashMatch ? hashMatch[1] : "";
  const prefixLower = prefix.toLowerCase();
  const suggestions: string[] = hashMatch
    ? prefixLower
      ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
      : allTags.slice(0, 10)
    : allTags.slice(0, 15);
  if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions.unshift(prefix);

  const applySuggestion = (tag: string) => {
    const before = hashMatch ? thought.replace(/#[^\s#]*$/u, "") : thought;
    setThought((before === "" ? before : before + " ") + "#" + tag + " ");
    setTagSuggestionIndex(0);
    textareaRef.current?.focus();
  };

  return (
    <div className="qc-root">
      <div className="qc-card" ref={cardRef}>
        <div className="qc-header" data-tauri-drag-region>
          <span className="qc-title" data-tauri-drag-region>OneThought</span>
          <button type="button" className="qc-close" onClick={() => void close()}>×</button>
        </div>

        <div className="qc-body">
          <textarea
            ref={textareaRef}
            className="qc-textarea"
            value={thought}
            placeholder="输入想法，# 添加标签..."
            onChange={(e) => { setThought(e.target.value); setTagSuggestionIndex(0); }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Escape") { void close(); return; }

              if (e.key === "ArrowDown" && suggestions.length > 0) {
                e.preventDefault();
                setTagSuggestionIndex((i) => (i + 1) % suggestions.length);
                return;
              }
              if (e.key === "ArrowUp" && suggestions.length > 0) {
                e.preventDefault();
                setTagSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                return;
              }
              if (e.key === " " && hashMatch && prefix) {
                e.preventDefault();
                const before = thought.replace(/#[^\s#]*$/u, "");
                setThought(before + "#" + prefix + " ");
                setTagSuggestionIndex(0);
                return;
              }
              if (e.key === "Enter") {
                if (hashMatch && suggestions.length > 0 && suggestions[tagSuggestionIndex]) {
                  e.preventDefault();
                  applySuggestion(suggestions[tagSuggestionIndex]);
                } else if (e.shiftKey) {
                  // allow newline
                } else {
                  e.preventDefault();
                  void submit();
                }
              }
            }}
          />

          {suggestions.length > 0 && (
            <div className="qc-tag-suggestions" role="listbox">
              {suggestions.map((tag, i) => (
                <button
                  key={tag}
                  type="button"
                  role="option"
                  className={`qc-tag-chip ${i === tagSuggestionIndex ? "selected" : ""}`}
                  data-color={tagColorIndex(tag, allTags)}
                  onClick={() => applySuggestion(tag)}
                >
                  #{tag}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="qc-footer">
          <span className="qc-hint">Enter 保存 · Shift+Enter 换行 · Esc 关闭</span>
          <button
            type="button"
            className={`qc-save-btn ${saveStatus === "success" ? "success" : ""}`}
            onClick={() => void submit()}
          >
            {saveStatus === "success" ? "✓ 已保存" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
