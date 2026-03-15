#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod store;

use std::sync::RwLock;
use store::{AppConfig, ConfigStore, GroupedThoughts, QueryOptions, Thought, ThoughtRepository};
use tauri::{Emitter, Manager};
use tauri::menu::{MenuBuilder, MenuItemBuilder};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri_plugin_global_shortcut::GlobalShortcutExt as _;

struct AppState {
    config: ConfigStore,
    thoughts: RwLock<ThoughtRepository>,
}

fn ensure_dir(p: &std::path::Path) {
    if !p.exists() {
        let _ = std::fs::create_dir_all(p);
    }
}

#[tauri::command]
fn config_get(state: tauri::State<AppState>) -> AppConfig {
    state.config.get_config()
}

#[tauri::command]
fn config_update(state: tauri::State<AppState>, patch: serde_json::Value) -> Result<AppConfig, String> {
    Ok(state.config.update_config(patch))
}

#[tauri::command]
fn thought_create(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
    payload: ThoughtCreatePayload,
) -> Result<Thought, String> {
    let device = std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown".to_string());
    let mut repo = state.thoughts.write().map_err(|e| e.to_string())?;
    let thought = repo.create(
        payload.content,
        payload.tags.unwrap_or_default(),
        payload.source.as_deref().unwrap_or("main_ui"),
        &device,
    );
    drop(repo);
    let _ = app.emit("thought_updated", ());
    Ok(thought)
}

#[derive(serde::Deserialize)]
struct ThoughtCreatePayload {
    content: String,
    tags: Option<Vec<String>>,
    source: Option<String>,
}

#[tauri::command]
fn thought_update(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
    id: String,
    patch: serde_json::Value,
) -> Result<Option<Thought>, String> {
    let mut repo = state.thoughts.write().map_err(|e| e.to_string())?;
    let out = repo.update(&id, patch);
    drop(repo);
    if out.is_some() {
        let _ = app.emit("thought_updated", ());
    }
    Ok(out)
}

#[tauri::command]
fn thought_archive(
    state: tauri::State<AppState>,
    app: tauri::AppHandle,
    id: String,
    archived: bool,
) -> Result<Option<Thought>, String> {
    let patch = serde_json::json!({ "archived": archived });
    thought_update(state, app, id, patch)
}

#[tauri::command]
fn thought_list(state: tauri::State<AppState>, options: QueryOptions) -> Result<Vec<GroupedThoughts>, String> {
    let repo = state.thoughts.read().map_err(|e| e.to_string())?;
    Ok(repo.query_grouped(&options))
}

#[tauri::command]
fn thought_list_all(state: tauri::State<AppState>) -> Result<Vec<Thought>, String> {
    let repo = state.thoughts.read().map_err(|e| e.to_string())?;
    Ok(repo.get_all())
}

#[tauri::command]
fn thought_delete(state: tauri::State<AppState>, app: tauri::AppHandle, id: String) -> Result<bool, String> {
    let mut repo = state.thoughts.write().map_err(|e| e.to_string())?;
    let ok = repo.delete(&id);
    drop(repo);
    if ok {
        let _ = app.emit("thought_updated", ());
    }
    Ok(ok)
}

#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AiSummarizePayload {
    base_url: String,
    api_key: String,
    model: String,
    prompt: String,
    max_tokens: u32,
    timeout_ms: u64,
}

#[tauri::command]
async fn ai_summarize(app: tauri::AppHandle, payload: AiSummarizePayload) -> Result<(), String> {
    let url = format!("{}/chat/completions", payload.base_url.trim_end_matches('/'));
    let auth = format!("Bearer {}", payload.api_key);
    let timeout_ms = payload.timeout_ms;
    let body = serde_json::json!({
        "model": payload.model,
        "messages": [{ "role": "user", "content": payload.prompt }],
        "max_tokens": payload.max_tokens,
        "stream": true,
    });

    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(std::time::Duration::from_secs(15))
            .timeout_read(std::time::Duration::from_millis(timeout_ms.max(120_000)))
            .build();

        let response = match agent
            .post(&url)
            .set("Authorization", &auth)
            .set("Content-Type", "application/json")
            .set("Accept", "application/json")
            .send_json(body)
        {
            Ok(r) => r,
            Err(ureq::Error::Status(code, r)) => {
                let err_body = r.into_string().unwrap_or_default();
                let _ = app.emit("ai_stream_error", format!("HTTP {}: {}", code, &err_body[..err_body.len().min(400)]));
                return Ok(());
            }
            Err(e) => {
                let _ = app.emit("ai_stream_error", format!("request failed: {}", e));
                return Ok(());
            }
        };

        use std::io::BufRead;
        let reader = std::io::BufReader::new(response.into_reader());
        for line in reader.lines() {
            match line {
                Ok(line) => {
                    if let Some(data) = line.strip_prefix("data: ") {
                        if data.trim() == "[DONE]" {
                            let _ = app.emit("ai_stream_done", ());
                            return Ok(());
                        }
                        if let Ok(json) = serde_json::from_str::<serde_json::Value>(data) {
                            if let Some(content) = json["choices"][0]["delta"]["content"].as_str() {
                                if !content.is_empty() {
                                    let _ = app.emit("ai_stream_chunk", content.to_string());
                                }
                            }
                        }
                    }
                }
                Err(e) => {
                    let _ = app.emit("ai_stream_error", format!("stream read error: {}", e));
                    return Ok(());
                }
            }
        }

        let _ = app.emit("ai_stream_done", ());
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
fn tag_remove(state: tauri::State<AppState>, app: tauri::AppHandle, tag_name: String) -> Result<bool, String> {
    let mut repo = state.thoughts.write().map_err(|e| e.to_string())?;
    let updated = repo.remove_tag(&tag_name);
    drop(repo);
    if updated {
        let _ = app.emit("thought_updated", ());
    }
    Ok(updated)
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .setup(|app| {
            let data_dir = app
                .path()
                .app_data_dir()
                .expect("app_data_dir");
            ensure_dir(&data_dir);
            let config_path = data_dir.join("config.json");
            let thoughts_file = data_dir.join("thoughts.jsonl");
            let config = ConfigStore::new(config_path);
            let repo = ThoughtRepository::load(thoughts_file);

            // Read hotkey before config is moved into AppState
            let hotkey = config.get_config().hotkey;

            app.manage(AppState {
                config,
                thoughts: RwLock::new(repo),
            });

            // Register global shortcut: show only the dedicated quick-capture popup.
            // The main window is never touched — it stays hidden/visible as-is.
            app.global_shortcut().on_shortcut(hotkey.as_str(), |handle, _, event| {
                if event.state() == tauri_plugin_global_shortcut::ShortcutState::Pressed {
                    if let Some(win) = handle.get_webview_window("quick_capture") {
                        let _ = win.show();
                        let _ = win.set_focus();
                    }
                }
            })?;

            // Hide quick_capture window instead of closing it
            if let Some(qc_win) = app.get_webview_window("quick_capture") {
                let qc_clone = qc_win.clone();
                qc_win.on_window_event(move |event| {
                    if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = qc_clone.hide();
                    }
                });
            }

            // System tray: show/quit menu
            let show_item = MenuItemBuilder::new("显示窗口").id("show").build(app)?;
            let quit_item = MenuItemBuilder::new("退出 OneThought").id("quit").build(app)?;
            let tray_menu = MenuBuilder::new(app).items(&[&show_item, &quit_item]).build()?;

            TrayIconBuilder::new()
                .icon(app.default_window_icon().unwrap().clone())
                .menu(&tray_menu)
                .tooltip("OneThought")
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    // Left-click on tray icon: show/focus the window
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.show();
                            let _ = win.set_focus();
                        }
                    }
                })
                .build(app)?;

            // Intercept close button: hide to tray instead of quitting
            let main_win = app.get_webview_window("main").unwrap();
            let main_win_clone = main_win.clone();
            main_win.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = main_win_clone.hide();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            config_get,
            config_update,
            thought_create,
            thought_update,
            thought_archive,
            thought_list,
            thought_list_all,
            thought_delete,
            tag_remove,
            ai_summarize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
