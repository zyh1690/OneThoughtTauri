import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import * as api from "./api";
import type { AppConfig, GroupedThoughts, Thought } from "./types";
import { extractTagsFromContent } from "./utils/tags";

/* ─── ConfirmModal ───────────────────────────────────────────── */
function ConfirmModal({
  title,
  message,
  confirmLabel = "确认删除",
  cancelLabel = "取消",
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal-overlay confirm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="modal-card confirm-card">
        <div className="confirm-icon">{danger ? "⚠️" : "ℹ️"}</div>
        <h3 className="confirm-title">{title}</h3>
        <p className="confirm-message">{message}</p>
        <div className="confirm-actions">
          <button type="button" className="btn-detail" onClick={onCancel}>{cancelLabel}</button>
          <button type="button" className={danger ? "btn-danger-solid" : "btn-save"} onClick={onConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

/* ─── DateRangePicker ────────────────────────────────────────── */
const MONTH_NAMES = ["1月","2月","3月","4月","5月","6月","7月","8月","9月","10月","11月","12月"];
const DAY_NAMES = ["日","一","二","三","四","五","六"];

function DateRangePicker({
  from, to,
  onFromChange, onToChange,
}: {
  from: string; to: string;
  onFromChange: (d: string) => void;
  onToChange: (d: string) => void;
}) {
  const [focused, setFocused] = useState<"from" | "to" | null>(null);
  const [view, setView] = useState<{ year: number; month: number }>(() => {
    const d = from ? new Date(from + "T00:00:00") : new Date();
    return { year: d.getFullYear(), month: d.getMonth() };
  });

  const toDate0 = (s: string) => s ? new Date(s + "T00:00:00") : null;
  const fromD = toDate0(from);
  const toD = toDate0(to);
  const todayMs = new Date(new Date().toDateString()).getTime();

  function prevMonth() {
    setView(v => v.month === 0 ? { year: v.year - 1, month: 11 } : { ...v, month: v.month - 1 });
  }
  function nextMonth() {
    setView(v => v.month === 11 ? { year: v.year + 1, month: 0 } : { ...v, month: v.month + 1 });
  }

  function handleDay(day: number) {
    const iso = `${view.year}-${String(view.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (focused === "from") { onFromChange(iso); setFocused("to"); }
    else if (focused === "to") { onToChange(iso); setFocused(null); }
  }

  function dayClass(day: number) {
    const ms = new Date(view.year, view.month, day).getTime();
    const cls = ["drp-day"];
    if (fromD && ms === fromD.getTime()) cls.push("drp-start");
    if (toD && ms === toD.getTime()) cls.push("drp-end");
    if (fromD && toD && ms > fromD.getTime() && ms < toD.getTime()) cls.push("drp-in-range");
    if (ms === todayMs) cls.push("drp-today");
    return cls.join(" ");
  }

  const firstDay = new Date(view.year, view.month, 1).getDay();
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  const fmt = (s: string) => s || "选择";

  return (
    <div className="drp-root">
      <div className="drp-inputs">
        <button type="button" className={`drp-field ${focused === "from" ? "drp-active" : ""}`}
          onClick={() => { setFocused("from"); if (from) { const d = new Date(from + "T00:00:00"); setView({ year: d.getFullYear(), month: d.getMonth() }); } }}>
          <span className="drp-field-label">开始</span>
          <span className="drp-field-val">{fmt(from)}</span>
        </button>
        <span className="drp-sep">→</span>
        <button type="button" className={`drp-field ${focused === "to" ? "drp-active" : ""}`}
          onClick={() => { setFocused("to"); if (to) { const d = new Date(to + "T00:00:00"); setView({ year: d.getFullYear(), month: d.getMonth() }); } }}>
          <span className="drp-field-label">结束</span>
          <span className="drp-field-val">{fmt(to)}</span>
        </button>
        {(from || to) && (
          <button type="button" className="drp-clear" title="清除"
            onClick={() => { onFromChange(""); onToChange(""); setFocused(null); }}>✕</button>
        )}
      </div>

      {focused && (
        <div className="drp-calendar">
          <div className="drp-cal-nav">
            <button type="button" className="drp-nav-btn" onClick={prevMonth}>‹</button>
            <span className="drp-cal-title">{view.year}年 {MONTH_NAMES[view.month]}</span>
            <button type="button" className="drp-nav-btn" onClick={nextMonth}>›</button>
          </div>
          <div className="drp-cal-grid">
            {DAY_NAMES.map(d => <span key={d} className="drp-week-label">{d}</span>)}
            {cells.map((day, i) =>
              day === null
                ? <span key={`e${i}`} />
                : <button key={day} type="button" className={dayClass(day)} onClick={() => handleDay(day)}>{day}</button>
            )}
          </div>
          <div className="drp-cal-footer">
            <span className="drp-hint">
              {focused === "from" ? "点击选择开始日期" : "点击选择结束日期"}
            </span>
            <button type="button" className="drp-confirm-btn" onClick={() => setFocused(null)}>确定</button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── HotkeyInput ───────────────────────────────────────────── */
function HotkeyInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [listening, setListening] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!listening) return;

    const onKey = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (["Control", "Alt", "Shift", "Meta", "Dead"].includes(e.key)) return;

      const parts: string[] = [];
      if (e.ctrlKey) parts.push("Control");
      if (e.metaKey) parts.push("Command");
      if (e.altKey) parts.push("Alt");
      if (e.shiftKey) parts.push("Shift");

      let key = e.key;
      if (key === " ") key = "Space";
      else if (key === "Escape") { setListening(false); return; }
      else if (key.length === 1) key = key.toUpperCase();

      if (parts.length === 0) return; // 必须有修饰键
      parts.push(key);
      onChange(parts.join("+"));
      setListening(false);
    };

    const onClickOut = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setListening(false);
    };

    document.addEventListener("keydown", onKey, true);
    document.addEventListener("mousedown", onClickOut);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("mousedown", onClickOut);
    };
  }, [listening, onChange]);

  const parts = value ? value.split("+") : [];

  return (
    <div
      ref={rootRef}
      className={`hotkey-input ${listening ? "hotkey-listening" : ""}`}
      onClick={() => setListening(true)}
      tabIndex={0}
      onFocus={() => setListening(true)}
      role="button"
      aria-label="点击设置快捷键"
    >
      <span className="hotkey-display">
        {listening ? (
          <span className="hotkey-prompt">请按键组合…</span>
        ) : parts.length > 0 ? (
          parts.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="hotkey-plus">+</span>}
              <kbd className="hotkey-key">{p}</kbd>
            </span>
          ))
        ) : (
          <span className="hotkey-empty">未设置</span>
        )}
      </span>
      {!listening && value && (
        <button
          type="button"
          className="hotkey-clear"
          title="清除快捷键"
          onClick={(e) => { e.stopPropagation(); onChange(""); }}
        >
          ✕
        </button>
      )}
    </div>
  );
}

const TAG_COLORS = ["0", "1", "2", "3", "4"] as const;
function tagColorIndex(tag: string, allTags: string[]): string {
  const i = allTags.indexOf(tag);
  return TAG_COLORS[i % TAG_COLORS.length];
}

type AppView = "home" | "archive" | "settings";
type TimeRangePreset = "all" | "7" | "30" | "custom";

export default function App() {
  const [view, setView] = useState<AppView>("home");
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [groups, setGroups] = useState<GroupedThoughts[]>([]);
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [timePreset, setTimePreset] = useState<TimeRangePreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [newThought, setNewThought] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "success">("idle");
  const [tagSuggestionIndex, setTagSuggestionIndex] = useState(0);
  const [allThoughtsForTags, setAllThoughtsForTags] = useState<Thought[]>([]);
  const [settingsForm, setSettingsForm] = useState<AppConfig | null>(null);
  const [settingsSaveStatus, setSettingsSaveStatus] = useState<"idle" | "success">("idle");
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [showQuickCapture, setShowQuickCapture] = useState(false);
  const [quickThought, setQuickThought] = useState("");
  const [quickSaveStatus, setQuickSaveStatus] = useState<"idle" | "success">("idle");
  const [quickTagSuggestionIndex, setQuickTagSuggestionIndex] = useState(0);
  const quickTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [confirmModal, setConfirmModal] = useState<{
    title: string; message: string; confirmLabel?: string; onConfirm: () => void;
  } | null>(null);
  const [aiSummary, setAiSummary] = useState("");
  const [aiSummaryStatus, setAiSummaryStatus] = useState<"idle" | "loading" | "error">("idle");

  const theme = config?.theme ?? "light";
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    allThoughtsForTags.forEach((t) => t.tags.forEach((tag) => set.add(tag)));
    return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
  }, [allThoughtsForTags]);

  const tagCount = useMemo(() => {
    const count: Record<string, number> = {};
    allThoughtsForTags
      .filter((t) => !t.archived)
      .forEach((t) => {
        t.tags.forEach((tag) => {
          count[tag] = (count[tag] ?? 0) + 1;
        });
      });
    return count;
  }, [allThoughtsForTags]);

  const timeRange = useMemo(() => {
    const now = new Date();
    if (timePreset === "all") {
      return { from: new Date(0).toISOString(), to: now.toISOString() };
    }
    if (timePreset === "7") {
      return {
        from: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    }
    if (timePreset === "30") {
      return {
        from: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        to: now.toISOString(),
      };
    }
    const from = customFrom
      ? new Date(`${customFrom}T00:00:00`).toISOString()
      : new Date(0).toISOString();
    const to = customTo
      ? new Date(`${customTo}T23:59:59`).toISOString()
      : new Date().toISOString();
    return { from, to };
  }, [timePreset, customFrom, customTo]);

  const reload = useCallback(async () => {
    const all = await api.listAllThoughts();
    setAllThoughtsForTags(all);
    if (view === "settings") return;
    const isArchive = view === "archive";

    // Always use fresh "now" so newly created thoughts (created after last render) are included
    const now = new Date().toISOString();
    let from = new Date(0).toISOString();
    let to = now;
    if (!isArchive) {
      if (timePreset === "7") {
        from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      } else if (timePreset === "30") {
        from = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      } else if (timePreset === "custom") {
        from = timeRange.from;
        to = timeRange.to;
      }
    }

    const options = {
      viewMode: "day" as const,
      archived: isArchive,
      tags: selectedTag ? [selectedTag] : undefined,
      from,
      to,
    };
    const items = await api.listThoughts(options);
    setGroups(items);
  }, [view, selectedTag, timePreset, timeRange]);

  // Always keep ref pointing to latest reload — event listeners use this to avoid stale closures
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  // Register event listeners ONCE — use reloadRef so they never go stale
  useEffect(() => {
    void api.getConfig().then((cfg) => {
      setConfig(cfg);
      setSettingsForm(cfg);
    });
    const unlistens: Array<() => void> = [];
    api.onThoughtUpdated(() => void reloadRef.current()).then((fn) => unlistens.push(fn));
    api.onShowQuickCapture(() => {
      setShowQuickCapture(true);
      setQuickThought("");
      setQuickSaveStatus("idle");
    }).then((fn) => unlistens.push(fn));
    return () => unlistens.forEach((fn) => fn());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch list whenever filters change
  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (showQuickCapture) {
      const t = setTimeout(() => quickTextareaRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [showQuickCapture]);

  const closeQuickCapture = useCallback(() => {
    setShowQuickCapture(false);
  }, []);

  // If the user navigates to settings before config finishes loading, fill the form once it arrives
  useEffect(() => {
    if (view === "settings" && config && !settingsForm) {
      setSettingsForm({ ...config, llm: { ...config.llm } });
    }
  }, [view, config, settingsForm]);

  const handleNavClick = (newView: AppView) => {
    setView(newView);
    setSettingsError(null);
    if (newView === "settings" && config) {
      setSettingsForm({ ...config, llm: { ...config.llm } });
    }
  };

  const submitThought = async () => {
    if (!newThought.trim()) return;
    const tags = extractTagsFromContent(newThought);
    await api.createThought({ content: newThought.trim(), tags, source: "main_ui" });
    setNewThought("");
    setSaveStatus("success");
    await reload();
    setTimeout(() => setSaveStatus("idle"), 1200);
  };

  const submitQuickThought = async () => {
    if (!quickThought.trim()) return;
    const tags = extractTagsFromContent(quickThought);
    await api.createThought({ content: quickThought.trim(), tags, source: "quick_input" });
    setQuickThought("");
    setQuickSaveStatus("success");
    await reload();
    setTimeout(() => {
      setQuickSaveStatus("idle");
      void closeQuickCapture();
    }, 800);
  };

  const saveSettings = async () => {
    if (!settingsForm) return;
    setSettingsError(null);

    // Re-register hotkey immediately if it changed
    if (config && settingsForm.hotkey !== config.hotkey) {
      try {
        await api.updateHotkey(settingsForm.hotkey);
      } catch (e) {
        setSettingsError(String(e));
        return;
      }
    }

    // Apply autostart OS setting if it changed
    if (config && settingsForm.autoLaunch !== config.autoLaunch) {
      try {
        await api.setAutostart(settingsForm.autoLaunch);
      } catch (e) {
        setSettingsError(
          settingsForm.autoLaunch
            ? `开机启动设置失败：${String(e)}`
            : `取消开机启动失败：${String(e)}`
        );
        // Revert the checkbox — keep other changes
        setSettingsForm((p) => (p ? { ...p, autoLaunch: config.autoLaunch } : p));
        return;
      }
    }

    const updated = await api.updateConfig(settingsForm);
    setConfig(updated);
    setSettingsForm({ ...updated, llm: { ...updated.llm } });
    setSettingsSaveStatus("success");
    setTimeout(() => setSettingsSaveStatus("idle"), 1500);
  };

  const toggleLlmEnabled = async () => {
    if (!config) return;
    const updated = await api.updateConfig({ llmEnabled: !config.llmEnabled } as Partial<AppConfig>);
    setConfig(updated);
    if (settingsForm) setSettingsForm({ ...updated, llm: { ...updated.llm } });
  };

  const generateAiSummary = async () => {
    if (!config?.llmEnabled || !config.llm.baseUrl || !config.llm.apiKey) return;
    // Use thoughts already filtered by both time range and selected tag (= what's visible on screen)
    const activeThoughts = groups.flatMap((g) => g.items);
    if (activeThoughts.length === 0) return;

    setAiSummaryStatus("loading");
    setAiSummary("");

    const visible = activeThoughts
      .slice(0, 80)
      .map((t) => `- ${new Date(t.created_at).toLocaleString()}：${t.content}`)
      .join("\n");
    const prompt = `${config.aiSummaryPrompt}\n\n${visible}`;

    const unlisteners: Array<() => void> = [];
    const cleanup = () => { unlisteners.forEach((fn) => fn()); unlisteners.length = 0; };

    const [unChunk, unDone, unError] = await Promise.all([
      api.onAiStreamChunk((chunk) => {
        setAiSummary((prev) => prev + chunk);
      }),
      api.onAiStreamDone(() => {
        setAiSummaryStatus("idle");
        cleanup();
      }),
      api.onAiStreamError((error) => {
        setAiSummary((prev) => (prev ? prev + "\n\n⚠️ " : "⚠️ ") + error);
        setAiSummaryStatus("error");
        cleanup();
      }),
    ]);
    unlisteners.push(unChunk, unDone, unError);

    try {
      await api.aiSummarize({
        llmMode: config.llmMode ?? "internal",
        baseUrl: config.llm.baseUrl,
        apiKey: config.llm.apiKey,
        model: config.llm.model,
        prompt,
        maxTokens: config.llm.maxTokens,
        timeoutMs: config.llm.timeoutMs,
      });
    } catch (e) {
      setAiSummary(`生成失败：${e instanceof Error ? e.message : String(e)}`);
      setAiSummaryStatus("error");
      cleanup();
    }
  };

  return (
    <div className={`app-three-col ${view === "archive" ? "no-right-bar" : ""}`}>
      {/* Quick Capture Modal */}
      {confirmModal && (
        <ConfirmModal
          title={confirmModal.title}
          message={confirmModal.message}
          confirmLabel={confirmModal.confirmLabel}
          onConfirm={() => { setConfirmModal(null); confirmModal.onConfirm(); }}
          onCancel={() => setConfirmModal(null)}
        />
      )}

      {showQuickCapture && (
        <div
          className="modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) void closeQuickCapture();
          }}
        >
          <div className="modal-card quick-capture-card">
            <div className="modal-header">
              <h3>OneThought</h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => void closeQuickCapture()}
              >
                ×
              </button>
            </div>
            <div className="input-with-suggestions">
              <textarea
                ref={quickTextareaRef}
                className="quick-capture-textarea"
                value={quickThought}
                onChange={(e) => { setQuickThought(e.target.value); setQuickTagSuggestionIndex(0); }}
                placeholder="输入想法，# 添加标签..."
                onKeyDown={(e) => {
                  if (e.nativeEvent.isComposing) return;

                  const hashMatch = quickThought.match(/#([^\s#]*)$/u);
                  const prefix = hashMatch ? hashMatch[1] : "";
                  const prefixLower = prefix.toLowerCase();
                  let suggestions: string[] = hashMatch
                    ? prefixLower
                      ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                      : allTags.slice(0, 10)
                    : allTags.slice(0, 15);
                  if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];

                  if (e.key === "Escape") { void closeQuickCapture(); return; }

                  if (e.key === "ArrowDown" && suggestions.length > 0) {
                    e.preventDefault();
                    setQuickTagSuggestionIndex((i) => (i + 1) % suggestions.length);
                    return;
                  }
                  if (e.key === "ArrowUp" && suggestions.length > 0) {
                    e.preventDefault();
                    setQuickTagSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                    return;
                  }
                  if (e.key === " " && hashMatch && prefix) {
                    e.preventDefault();
                    const before = quickThought.replace(/#[^\s#]*$/u, "");
                    setQuickThought(before + "#" + prefix + " ");
                    setQuickTagSuggestionIndex(0);
                    return;
                  }
                  if (e.key === "Enter") {
                    if (hashMatch && suggestions.length > 0 && suggestions[quickTagSuggestionIndex]) {
                      e.preventDefault();
                      const t = suggestions[quickTagSuggestionIndex];
                      const before = quickThought.replace(/#[^\s#]*$/u, "");
                      setQuickThought((before === "" ? before : before + " ") + "#" + t + " ");
                      setQuickTagSuggestionIndex(0);
                    } else if (e.shiftKey) {
                      // Shift+Enter → 换行，默认行为
                    } else {
                      e.preventDefault();
                      void submitQuickThought();
                    }
                  }
                }}
              />
              {(() => {
                const hashMatch = quickThought.match(/#([^\s#]*)$/u);
                const prefix = hashMatch ? hashMatch[1] : "";
                const prefixLower = prefix.toLowerCase();
                let suggestions: string[] = hashMatch
                  ? prefixLower
                    ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                    : allTags.slice(0, 10)
                  : allTags.slice(0, 15);
                if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
                if (suggestions.length === 0) return null;
                return (
                  <div className="tag-suggestions" role="listbox">
                    {suggestions.map((t, i) => (
                      <button
                        key={t}
                        type="button"
                        role="option"
                        className={`tag-suggestion-chip ${i === quickTagSuggestionIndex ? "selected" : ""}`}
                        data-color={tagColorIndex(t, allTags)}
                        onClick={() => {
                          const before = hashMatch ? quickThought.replace(/#[^\s#]*$/u, "") : quickThought;
                          setQuickThought((before === "" ? before : before + " ") + "#" + t + " ");
                          setQuickTagSuggestionIndex(0);
                          quickTextareaRef.current?.focus();
                        }}
                      >
                        #{t}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <div className="modal-actions">
              <span className="modal-hint">Enter 保存 · Shift+Enter 换行 · Esc 关闭</span>
              <button
                type="button"
                className={`btn-save ${quickSaveStatus === "success" ? "success" : ""}`}
                onClick={() => void submitQuickThought()}
              >
                {quickSaveStatus === "success" ? "✓ 已保存" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Left Sidebar */}
      <aside className="left-sidebar">
        <nav className="nav-top">
          <button
            type="button"
            className={`nav-btn ${view === "home" ? "active" : ""}`}
            onClick={() => handleNavClick("home")}
          >
            <span className="nav-btn-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            </span>
            Home
          </button>
          <button
            type="button"
            className={`nav-btn ${view === "archive" ? "active" : ""}`}
            onClick={() => handleNavClick("archive")}
          >
            <span className="nav-btn-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="21 8 21 21 3 21 3 8" />
                <rect x="1" y="3" width="22" height="5" />
                <line x1="10" y1="12" x2="14" y2="12" />
              </svg>
            </span>
            Archive
          </button>
        </nav>
        <div className={`tag-cloud ${view !== "home" ? "tag-cloud-hidden" : ""}`}>
          {view === "home" && allTags.map((tag) => {
            const count = tagCount[tag] ?? 0;
            const showDelete = count === 0;
            return (
              <span key={tag} className="tag-chip-wrap">
                <button
                  type="button"
                  className={`tag-chip ${selectedTag === tag ? "selected" : ""}`}
                  data-color={tagColorIndex(tag, allTags)}
                  onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                  title={selectedTag === tag ? "点击取消筛选" : `按 #${tag} 筛选`}
                >
                  #{tag}({count})
                </button>
                {showDelete && (
                  <button
                    type="button"
                    className="tag-chip-delete"
                    onClick={async (e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      await api.removeTag(tag);
                      await reload();
                    }}
                    title="删除该标签"
                    aria-label="删除该标签"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}
              </span>
            );
          })}
        </div>
        <nav className="nav-bottom">
          <button
            type="button"
            className={`nav-btn ${view === "settings" ? "active" : ""}`}
            onClick={() => handleNavClick("settings")}
          >
            <span className="nav-btn-icon" aria-hidden>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </span>
            设置
          </button>
        </nav>
      </aside>

      {/* Main Content */}
      <main className="main-content">
        {view === "home" && (
          <>
            <section className="input-section">
              <h2>OneThought</h2>
              <div className="input-with-suggestions">
                <textarea
                  className="input-area"
                  value={newThought}
                  onChange={(e) => setNewThought(e.target.value)}
                  placeholder="输入想法，# 添加标签"
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    const hashMatch = newThought.match(/#([^\s#]*)$/u);
                    const prefix = hashMatch ? hashMatch[1] : "";
                    const prefixLower = prefix.toLowerCase();
                    let suggestions: string[] = hashMatch
                      ? prefixLower
                        ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                        : allTags.slice(0, 10)
                      : allTags.slice(0, 15);
                    if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
                    if (suggestions.length === 0) return;
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setTagSuggestionIndex((i) => (i + 1) % suggestions.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setTagSuggestionIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
                      return;
                    }
                    if (e.key === "Enter" && hashMatch && suggestions[tagSuggestionIndex]) {
                      e.preventDefault();
                      const t = suggestions[tagSuggestionIndex];
                      const before = newThought.replace(/#[^\s#]*$/u, "");
                      setNewThought((before === "" ? before : before + " ") + "#" + t + " ");
                      setTagSuggestionIndex(0);
                    }
                    if (e.key === " " && hashMatch && prefix) {
                      e.preventDefault();
                      const before = newThought.replace(/#[^\s#]*$/u, "");
                      setNewThought(before + "#" + prefix + " ");
                      setTagSuggestionIndex(0);
                    }
                  }}
                />
                {(() => {
                  const hashMatch = newThought.match(/#([^\s#]*)$/u);
                  const prefix = hashMatch ? hashMatch[1] : "";
                  const prefixLower = prefix.toLowerCase();
                  let suggestions: string[] = hashMatch
                    ? prefixLower
                      ? allTags.filter((t) => t.toLowerCase().startsWith(prefixLower))
                      : allTags.slice(0, 10)
                    : allTags.slice(0, 15);
                  if (hashMatch && prefix && !suggestions.includes(prefix)) suggestions = [prefix, ...suggestions];
                  if (suggestions.length === 0) return null;
                  return (
                    <div className="tag-suggestions" role="listbox">
                      {suggestions.map((t, i) => (
                        <button
                          key={t}
                          type="button"
                          role="option"
                          className={`tag-suggestion-chip ${i === tagSuggestionIndex ? "selected" : ""}`}
                          data-color={tagColorIndex(t, allTags)}
                          onClick={() => {
                            const before = hashMatch ? newThought.replace(/#[^\s#]*$/u, "") : newThought;
                            setNewThought((before === "" ? before : before + " ") + "#" + t + " ");
                            setTagSuggestionIndex(0);
                          }}
                        >
                          #{t}
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>
              <div className="input-actions">
                <button
                  type="button"
                  className={`btn-save ${saveStatus === "success" ? "success" : ""}`}
                  onClick={() => void submitThought()}
                >
                  {saveStatus === "success" ? "✓ 已保存" : "保存"}
                </button>
              </div>
            </section>
            <ThoughtTimeline groups={groups} allTags={allTags} onArchive={(id) => void api.archiveThought(id, true).then(() => reload())} onUpdate={() => void reload()} />
          </>
        )}

        {view === "archive" && (
          <>
            <section className="view-header archive-header">
              <div className="archive-header-left">
                <h2>Archive</h2>
                <p className="view-subtitle">已归档的想法</p>
              </div>
              {groups.length > 0 && (
                <button
                  type="button"
                  className="btn-danger-outline archive-delete-all"
                  onClick={() => {
                    const total = groups.reduce((sum, g) => sum + g.items.length, 0);
                    setConfirmModal({
                      title: "删除全部归档",
                      message: `即将彻底删除全部 ${total} 条归档内容，此操作不可撤销，确认继续？`,
                      confirmLabel: `删除全部 ${total} 条`,
                      onConfirm: () => {
                        const ids = groups.flatMap((g) => g.items.map((t) => t.id));
                        void Promise.all(ids.map((id) => api.deleteThought(id))).then(() => reload());
                      },
                    });
                  }}
                >
                  删除全部
                </button>
              )}
            </section>
            <ThoughtTimeline
              groups={groups}
              allTags={allTags}
              onArchive={(id) => void api.archiveThought(id, false).then(() => reload())}
              onUpdate={() => void reload()}
              onDelete={(id) => {
                setConfirmModal({
                  title: "彻底删除",
                  message: "将永久删除这条记录，无法恢复，确认继续？",
                  confirmLabel: "确认删除",
                  onConfirm: () => void api.deleteThought(id).then(() => reload()),
                });
              }}
              archiveLabel="取消归档"
              readOnly
            />
          </>
        )}

        {view === "settings" && !settingsForm && (
          <div className="settings-loading">加载中…</div>
        )}
        {view === "settings" && settingsForm && (
          <div className="settings-view">
            <div className="settings-header">
              <h2>设置</h2>
            </div>
            <div className="settings-body">
              {/* 外观 */}
              <div className="settings-section">
                <h3>外观</h3>
                <div className="settings-row">
                  <label>主题</label>
                  <div className="theme-toggle">
                    <button
                      type="button"
                      className={`theme-btn ${settingsForm.theme === "light" ? "active" : ""}`}
                      onClick={() =>
                        setSettingsForm((p) => (p ? { ...p, theme: "light" } : p))
                      }
                    >
                      浅色
                    </button>
                    <button
                      type="button"
                      className={`theme-btn ${settingsForm.theme === "dark" ? "active" : ""}`}
                      onClick={() =>
                        setSettingsForm((p) => (p ? { ...p, theme: "dark" } : p))
                      }
                    >
                      深色
                    </button>
                  </div>
                </div>
              </div>

              {/* 通用 */}
              <div className="settings-section">
                <h3>通用</h3>
                <div className="settings-row">
                  <label>快速录入热键</label>
                  <HotkeyInput
                    value={settingsForm.hotkey}
                    onChange={(v) => setSettingsForm((p) => (p ? { ...p, hotkey: v } : p))}
                  />
                </div>
                <div className="settings-row">
                  <label>开机自启</label>
                  <input
                    type="checkbox"
                    checked={settingsForm.autoLaunch}
                    onChange={(e) =>
                      setSettingsForm((p) => (p ? { ...p, autoLaunch: e.target.checked } : p))
                    }
                  />
                </div>
              </div>

              {/* AI 助手 */}
              <div className="settings-section">
                <h3>AI 助手</h3>
                <div className="settings-row">
                  <label>启用 AI</label>
                  <input
                    type="checkbox"
                    checked={settingsForm.llmEnabled}
                    onChange={(e) =>
                      setSettingsForm((p) => (p ? { ...p, llmEnabled: e.target.checked } : p))
                    }
                  />
                </div>
                <div className="settings-row">
                  <label>网络环境</label>
                  <div className="theme-toggle">
                    <button
                      type="button"
                      className={`theme-btn ${(settingsForm.llmMode ?? "internal") === "internal" ? "active" : ""}`}
                      onClick={() =>
                        setSettingsForm((p) =>
                          p
                            ? {
                                ...p,
                                llmMode: "internal",
                                llm: { ...p.llm, baseUrl: "http://open-llm.uat.cmbchina.cn/llm/" },
                              }
                            : p
                        )
                      }
                    >
                      行内
                    </button>
                    <button
                      type="button"
                      className={`theme-btn ${(settingsForm.llmMode ?? "internal") === "external" ? "active" : ""}`}
                      onClick={() =>
                        setSettingsForm((p) =>
                          p
                            ? {
                                ...p,
                                llmMode: "external",
                                llm: { ...p.llm, baseUrl: p.llm.baseUrl === "http://open-llm.uat.cmbchina.cn/llm/" ? "" : p.llm.baseUrl },
                              }
                            : p
                        )
                      }
                    >
                      行外
                    </button>
                  </div>
                </div>
                {(settingsForm.llmMode ?? "internal") === "internal" ? (
                  <>
                    <div className="settings-row">
                      <label>行内 API 地址</label>
                      <input
                        type="text"
                        className="settings-input"
                        value={settingsForm.llm.baseUrl}
                        onChange={(e) =>
                          setSettingsForm((p) =>
                            p ? { ...p, llm: { ...p.llm, baseUrl: e.target.value } } : p
                          )
                        }
                        placeholder="http://open-llm.uat.cmbchina.cn/llm/"
                      />
                    </div>
                    <div className="settings-row">
                      <label>模型名称</label>
                      <input
                        type="text"
                        className="settings-input"
                        value={settingsForm.llm.model}
                        onChange={(e) =>
                          setSettingsForm((p) =>
                            p ? { ...p, llm: { ...p.llm, model: e.target.value } } : p
                          )
                        }
                        placeholder="qwen3-30b-a3b-2507"
                      />
                    </div>
                    <div className="settings-row">
                      <label>API Key</label>
                      <input
                        type="password"
                        className="settings-input"
                        value={settingsForm.llm.apiKey}
                        onChange={(e) =>
                          setSettingsForm((p) =>
                            p ? { ...p, llm: { ...p.llm, apiKey: e.target.value } } : p
                          )
                        }
                        placeholder="sk-..."
                      />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="settings-row">
                      <label>API 地址</label>
                      <input
                        type="text"
                        className="settings-input"
                        value={settingsForm.llm.baseUrl}
                        onChange={(e) =>
                          setSettingsForm((p) =>
                            p ? { ...p, llm: { ...p.llm, baseUrl: e.target.value } } : p
                          )
                        }
                        placeholder="https://api.openai.com/v1"
                      />
                    </div>
                    <div className="settings-row">
                      <label>API Key</label>
                      <input
                        type="password"
                        className="settings-input"
                        value={settingsForm.llm.apiKey}
                        onChange={(e) =>
                          setSettingsForm((p) =>
                            p ? { ...p, llm: { ...p.llm, apiKey: e.target.value } } : p
                          )
                        }
                        placeholder="sk-..."
                      />
                    </div>
                    <div className="settings-row">
                      <label>模型</label>
                      <input
                        type="text"
                        className="settings-input"
                        value={settingsForm.llm.model}
                        onChange={(e) =>
                          setSettingsForm((p) =>
                            p ? { ...p, llm: { ...p.llm, model: e.target.value } } : p
                          )
                        }
                        placeholder="gpt-4o-mini"
                      />
                    </div>
                  </>
                )}
                <div className="settings-row settings-row-col">
                  <label>AI 摘要提示词</label>
                  <textarea
                    className="settings-textarea"
                    value={settingsForm.aiSummaryPrompt}
                    onChange={(e) =>
                      setSettingsForm((p) => (p ? { ...p, aiSummaryPrompt: e.target.value } : p))
                    }
                    rows={3}
                  />
                </div>
                <div className="settings-row">
                  <label>超时（毫秒）</label>
                  <input
                    type="number"
                    className="settings-input settings-input-sm"
                    value={settingsForm.llm.timeoutMs}
                    min={1000}
                    onChange={(e) =>
                      setSettingsForm((p) =>
                        p
                          ? { ...p, llm: { ...p.llm, timeoutMs: parseInt(e.target.value) || 30000 } }
                          : p
                      )
                    }
                  />
                </div>
                <div className="settings-row">
                  <label>最大 Token</label>
                  <input
                    type="number"
                    className="settings-input settings-input-sm"
                    value={settingsForm.llm.maxTokens}
                    min={100}
                    onChange={(e) =>
                      setSettingsForm((p) =>
                        p
                          ? { ...p, llm: { ...p.llm, maxTokens: parseInt(e.target.value) || 1200 } }
                          : p
                      )
                    }
                  />
                </div>
              </div>

            </div>

            <div className="settings-footer">
              {settingsError && (
                <div className="settings-error">{settingsError}</div>
              )}
              <button
                type="button"
                className={`btn-save ${settingsSaveStatus === "success" ? "success" : ""}`}
                onClick={() => void saveSettings()}
              >
                {settingsSaveStatus === "success" ? "✓ 已保存" : "保存设置"}
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Right Bar */}
      {view !== "archive" && <aside className="right-bar">
        {view === "home" && (
          <div className="time-filter">
            <h3>时间范围</h3>
            <div className="quick-range">
              <button
                type="button"
                className={timePreset === "all" ? "active" : ""}
                onClick={() => setTimePreset("all")}
              >
                全部
              </button>
              <button
                type="button"
                className={timePreset === "7" ? "active" : ""}
                onClick={() => setTimePreset("7")}
              >
                近7天
              </button>
              <button
                type="button"
                className={timePreset === "30" ? "active" : ""}
                onClick={() => setTimePreset("30")}
              >
                近30天
              </button>
              <button
                type="button"
                className={timePreset === "custom" ? "active" : ""}
                onClick={() => setTimePreset("custom")}
              >
                自定义
              </button>
            </div>
            {timePreset === "custom" && (
              <DateRangePicker
                from={customFrom}
                to={customTo}
                onFromChange={setCustomFrom}
                onToChange={setCustomTo}
              />
            )}
          </div>
        )}

        {/* AI Section */}
        <div className="ai-section">
          <h3>AI 助手</h3>
          <div className="ai-toggle-row">
            <span>启用 AI</span>
            <button
              type="button"
              className={`toggle-pill ${config?.llmEnabled ? "on" : "off"}`}
              onClick={() => void toggleLlmEnabled()}
            >
              {config?.llmEnabled ? "已开启" : "已关闭"}
            </button>
          </div>
          {config?.llmEnabled && (
            <div className="ai-info">
              <div className="ai-info-row">
                <span className="ai-info-label">模型</span>
                <span className="ai-info-value">{config.llm.model || "未配置"}</span>
              </div>
              {config.llm.baseUrl && (
                <div className="ai-info-row">
                  <span className="ai-info-label">接口</span>
                  <span className="ai-info-value ai-info-url" title={config.llm.baseUrl}>
                    {config.llm.baseUrl.replace(/^https?:\/\//, "").slice(0, 22)}…
                  </span>
                </div>
              )}
            </div>
          )}
          <button
            type="button"
            className="ai-settings-link"
            onClick={() => handleNavClick("settings")}
          >
            AI 详细设置 →
          </button>
        </div>

        {/* AI Summary */}
        <div className="ai-summary-section">
          <div className="ai-summary-header">
            <h3>AI 总结</h3>
            <button
              type="button"
              className={`ai-summary-btn ${aiSummaryStatus === "loading" ? "loading" : ""}`}
              disabled={!config?.llmEnabled || aiSummaryStatus === "loading"}
              onClick={() => void generateAiSummary()}
              title={!config?.llmEnabled ? "请先启用 AI" : "生成总结"}
            >
              {aiSummaryStatus === "loading" ? "生成中…" : "生成总结"}
            </button>
          </div>
          {!config?.llmEnabled && (
            <p className="ai-summary-hint">请先在 AI 助手中开启并配置 LLM</p>
          )}
          {(aiSummary || aiSummaryStatus === "loading") && (
            <div className={`ai-summary-content ${aiSummaryStatus === "error" ? "error" : ""}`}>
              <pre className="ai-summary-pre">{aiSummary}</pre>
              {aiSummaryStatus === "loading" && (
                <span className="streaming-cursor" aria-hidden="true">▋</span>
              )}
            </div>
          )}
        </div>
      </aside>}
    </div>
  );
}

function ThoughtTimeline({
  groups,
  allTags,
  onArchive,
  onUpdate,
  onDelete,
  archiveLabel = "归档",
  readOnly = false,
}: {
  groups: GroupedThoughts[];
  allTags: string[];
  onArchive: (id: string) => void;
  onUpdate: () => void;
  onDelete?: (id: string) => void;
  archiveLabel?: string;
  readOnly?: boolean;
}) {
  const [detailThought, setDetailThought] = useState<Thought | null>(null);
  const [editContent, setEditContent] = useState("");
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "success">("idle");

  const openDetail = (t: Thought) => {
    setDetailThought(t);
    setEditContent(t.content);
    setSaveStatus("idle");
  };

  const closeDetail = () => setDetailThought(null);

  const handleSave = async () => {
    if (!detailThought || !editContent.trim()) return;
    setSaveStatus("saving");
    const tags = extractTagsFromContent(editContent);
    await api.updateThought(detailThought.id, { content: editContent.trim(), tags } as Parameters<typeof api.updateThought>[1]);
    setSaveStatus("success");
    onUpdate();
    setTimeout(() => {
      setSaveStatus("idle");
      closeDetail();
    }, 800);
  };

  const previewTags = readOnly
    ? (detailThought?.tags ?? [])
    : extractTagsFromContent(editContent);

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        <p>暂无内容</p>
      </div>
    );
  }
  return (
    <>
      {detailThought && (
        <div
          className="modal-overlay"
          onClick={(e) => { if (e.target === e.currentTarget) closeDetail(); }}
        >
          <div className="modal-card detail-modal">
            <div className="modal-header">
              <h3>{readOnly ? "查看详情" : "编辑"}</h3>
              <button type="button" className="modal-close" onClick={closeDetail}>×</button>
            </div>

            {readOnly ? (
              <div className="detail-readonly-content markdown-body">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{detailThought.content}</ReactMarkdown>
              </div>
            ) : (
              <textarea
                className="detail-edit-textarea"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault();
                    void handleSave();
                  }
                  if (e.key === "Escape") closeDetail();
                }}
                autoFocus
              />
            )}

            {previewTags.length > 0 && (
              <div className="detail-tags">
                {previewTags.map((t) => (
                  <span key={t} className="tag-pill" data-color={tagColorIndex(t, allTags)}>
                    #{t}
                  </span>
                ))}
              </div>
            )}

            <div className="detail-meta">
              <div className="detail-meta-row">
                <span className="detail-meta-label">创建时间</span>
                <span>{new Date(detailThought.created_at).toLocaleString()}</span>
              </div>
              <div className="detail-meta-row">
                <span className="detail-meta-label">更新时间</span>
                <span>{new Date(detailThought.updated_at).toLocaleString()}</span>
              </div>
            </div>

            <div className="detail-footer">
              {readOnly ? (
                <span />
              ) : (
                <span className="modal-hint">Ctrl+Enter 保存 · Esc 关闭</span>
              )}
              <div className="detail-footer-actions">
                <button type="button" className="btn-detail" onClick={closeDetail}>
                  关闭
                </button>
                {!readOnly && (
                  <button
                    type="button"
                    className={`btn-save ${saveStatus === "success" ? "success" : ""}`}
                    disabled={saveStatus === "saving"}
                    onClick={() => void handleSave()}
                  >
                    {saveStatus === "success" ? "✓ 已保存" : saveStatus === "saving" ? "保存中…" : "保存"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      <div className="thought-list timeline-wrap">
        {groups.map((group) => (
          <div key={group.groupKey} className="timeline-group">
            <h4 className="timeline-group-title">{group.groupKey}</h4>
            <div className="timeline-track">
              {group.items.map((item) => (
                <div key={item.id} className="timeline-item">
                  <div className="timeline-dot" />
                  <div className="timeline-card-wrap">
                    <ThoughtCard
                      thought={item}
                      allTags={allTags}
                      onArchive={() => onArchive(item.id)}
                      onDetail={() => openDetail(item)}
                      onDelete={onDelete ? () => onDelete(item.id) : undefined}
                      archiveLabel={archiveLabel}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function ThoughtCard({
  thought,
  allTags,
  onArchive,
  onDetail,
  onDelete,
  archiveLabel = "归档",
}: {
  thought: Thought;
  allTags: string[];
  onArchive: () => void;
  onDetail: () => void;
  onDelete?: () => void;
  archiveLabel?: string;
}) {
  return (
    <div className="thought-card">
      <div className="card-meta card-meta-with-tags">
        <span>{new Date(thought.created_at).toLocaleString()}</span>
        {thought.tags.length > 0 && (
          <div className="card-tags">
            {thought.tags.map((t) => (
              <span key={t} className="tag-pill" data-color={tagColorIndex(t, allTags)}>
                #{t}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="card-content card-content-md">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{thought.content}</ReactMarkdown>
      </div>
      <div className="card-actions card-actions-right">
        <button type="button" className="btn-detail" onClick={onDetail}>
          详情
        </button>
        <button type="button" onClick={onArchive}>
          {archiveLabel}
        </button>
        {onDelete && (
          <button type="button" className="btn-danger-outline" onClick={onDelete}>
            彻底删除
          </button>
        )}
      </div>
    </div>
  );
}
