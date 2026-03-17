// 与 Electron 版 OneThought 数据格式兼容的存储层（仅在本 Tauri 工程内实现，不修改原仓库）

use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::sync::RwLock;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Thought {
    pub id: String,
    pub content: String,
    pub created_at: String,
    pub updated_at: String,
    pub status: String,
    pub archived: bool,
    pub tags: Vec<String>,
    pub source: String,
    pub pinned: bool,
    pub summary_id: Option<String>,
    pub meta: ThoughtMeta,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ThoughtMeta {
    pub device: String,
    pub app_version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub hotkey: String,
    pub auto_launch: bool,
    pub llm_enabled: bool,
    /// "internal" = 行内（招行内网）, "external" = 行外（标准 OpenAI 兼容）
    pub llm_mode: String,
    pub theme: String,
    pub ai_summary_prompt: String,
    pub llm: LlmConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmConfig {
    pub base_url: String,
    pub api_key: String,
    pub model: String,
    pub timeout_ms: u64,
    pub max_tokens: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueryOptions {
    pub view_mode: String,
    pub from: Option<String>,
    pub to: Option<String>,
    pub archived: Option<bool>,
    pub tags: Option<Vec<String>>,
    pub limit: Option<u32>,
    pub offset: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GroupedThoughts {
    pub group_key: String,
    pub items: Vec<Thought>,
}

fn default_config() -> AppConfig {
    AppConfig {
        hotkey: "Alt+T".to_string(),
        auto_launch: false,
        llm_enabled: false,
        llm_mode: "internal".to_string(),
        theme: "light".to_string(),
        ai_summary_prompt: "请对以下\"thought\"进行分类，类别为【项目管理、团队协作、阻碍问题、流程问题、内部管理、技术问题、其他】之一；\n优化问题描述，使其更清晰、简洁；\n并给出尽可能简短的解决方案，若无解决方案则填写【无】。\n\n请按照以下格式输出：\n---\n问题分类：\n问题描述：\n解决方案：\n---".to_string(),
        llm: LlmConfig {
            base_url: "http://open-llm.uat.cmbchina.cn/llm/".to_string(),
            api_key: String::new(),
            model: String::new(),
            timeout_ms: 30000,
            max_tokens: 2000,
        },
    }
}

fn json_deep_merge(base: &mut serde_json::Value, patch: &serde_json::Value) {
    match (base, patch) {
        (serde_json::Value::Object(base_map), serde_json::Value::Object(patch_map)) => {
            for (k, v) in patch_map {
                let entry = base_map.entry(k).or_insert(serde_json::Value::Null);
                if v.is_object() && entry.is_object() {
                    json_deep_merge(entry, v);
                } else {
                    *entry = v.clone();
                }
            }
        }
        (base, patch) => *base = patch.clone(),
    }
}

pub struct ConfigStore {
    path: PathBuf,
    cache: RwLock<Option<AppConfig>>,
}

impl ConfigStore {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            cache: RwLock::new(None),
        }
    }

    pub fn get_config(&self) -> AppConfig {
        if let Ok(guard) = self.cache.read() {
            if let Some(c) = guard.as_ref() {
                return c.clone();
            }
        }
        let config = if self.path.exists() {
            let raw = fs::read_to_string(&self.path).unwrap_or_default();
            serde_json::from_str::<AppConfig>(&raw).unwrap_or_else(|_| default_config())
        } else {
            let c = default_config();
            let _ = self.write_config(&c);
            c
        };
        if let Ok(mut guard) = self.cache.write() {
            *guard = Some(config.clone());
        }
        config
    }

    pub fn update_config(&self, patch: serde_json::Value) -> AppConfig {
        let current = self.get_config();
        let mut base = serde_json::to_value(&current).unwrap_or_default();
        json_deep_merge(&mut base, &patch);
        let updated: AppConfig = serde_json::from_value(base).unwrap_or(current);
        let _ = self.write_config(&updated);
        updated
    }

    fn write_config(&self, config: &AppConfig) -> Result<(), std::io::Error> {
        let tmp = self.path.with_extension("tmp");
        let s = serde_json::to_string_pretty(config).unwrap_or_default();
        fs::write(&tmp, s)?;
        fs::rename(tmp, &self.path)?;
        if let Ok(mut guard) = self.cache.write() {
            *guard = Some(config.clone());
        }
        Ok(())
    }
}

pub struct ThoughtRepository {
    thoughts_file: PathBuf,
    thoughts: HashMap<String, Thought>,
}

impl ThoughtRepository {
    pub fn load(thoughts_file: PathBuf) -> Self {
        let mut thoughts = HashMap::new();
        if thoughts_file.exists() {
            if let Ok(f) = fs::File::open(&thoughts_file) {
                for line in BufReader::new(f).lines().flatten() {
                    if line.trim().is_empty() {
                        continue;
                    }
                    if let Ok(t) = serde_json::from_str::<Thought>(&line) {
                        thoughts.insert(t.id.clone(), t);
                    }
                }
            }
        }
        Self {
            thoughts_file,
            thoughts,
        }
    }

    pub fn create(
        &mut self,
        content: String,
        tags: Vec<String>,
        source: &str,
        device: &str,
    ) -> Thought {
        let now = Utc::now().to_rfc3339();
        let thought = Thought {
            id: Uuid::new_v4().to_string(),
            content,
            created_at: now.clone(),
            updated_at: now,
            status: "active".to_string(),
            archived: false,
            tags,
            source: source.to_string(),
            pinned: false,
            summary_id: None,
            meta: ThoughtMeta {
                device: device.to_string(),
                app_version: "0.1.0".to_string(),
            },
        };
        self.append_thought(&thought);
        thought
    }

    pub fn update(&mut self, id: &str, patch: serde_json::Value) -> Option<Thought> {
        let current = self.thoughts.get(id)?.clone();
        let updated_at = Utc::now().to_rfc3339();
        let mut next = current.clone();
        next.updated_at = updated_at;
        if let Some(v) = patch.get("content").and_then(|v| v.as_str()) {
            next.content = v.to_string();
        }
        if let Some(v) = patch.get("tags").and_then(|v| v.as_array()) {
            next.tags = v.iter().filter_map(|e| e.as_str().map(String::from)).collect();
        }
        if let Some(v) = patch.get("archived").and_then(|v| v.as_bool()) {
            next.archived = v;
        }
        self.thoughts.insert(id.to_string(), next.clone());
        self.compact();
        Some(next)
    }

    pub fn get_all(&self) -> Vec<Thought> {
        let mut v: Vec<_> = self.thoughts.values().cloned().collect();
        v.sort_by(|a, b| b.created_at.cmp(&a.created_at));
        v
    }

    pub fn query_grouped(&self, options: &QueryOptions) -> Vec<GroupedThoughts> {
        let from_ts = options
            .from
            .as_ref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.timestamp_millis())
            .unwrap_or(i64::MIN);
        let to_ts = options
            .to
            .as_ref()
            .and_then(|s| chrono::DateTime::parse_from_rfc3339(s).ok())
            .map(|t| t.timestamp_millis())
            .unwrap_or(i64::MAX);
        let tags: HashSet<String> = options
            .tags
            .as_deref()
            .unwrap_or(&[])
            .iter()
            .cloned()
            .collect();
        let mut matched: Vec<Thought> = self
            .thoughts
            .values()
            .filter(|item| {
                let ts = chrono::DateTime::parse_from_rfc3339(&item.created_at)
                    .map(|t| t.timestamp_millis())
                    .unwrap_or(0);
                if ts < from_ts || ts > to_ts {
                    return false;
                }
                if let Some(archived) = options.archived {
                    if item.archived != archived {
                        return false;
                    }
                }
                if !tags.is_empty() && !item.tags.iter().any(|t| tags.contains(t)) {
                    return false;
                }
                true
            })
            .cloned()
            .collect();
        matched.sort_by(|a, b| b.created_at.cmp(&a.created_at));

        let view_month = options.view_mode == "month";
        let mut grouped: HashMap<String, Vec<Thought>> = HashMap::new();
        for item in matched {
            let dt = chrono::DateTime::parse_from_rfc3339(&item.created_at).unwrap_or(Utc::now().into());
            let key = if view_month {
                format!("{:04}-{:02}", dt.year(), dt.month())
            } else {
                format!(
                    "{:04}-{:02}-{:02}",
                    dt.year(),
                    dt.month(),
                    dt.day()
                )
            };
            grouped.entry(key).or_default().push(item);
        }
        let mut keys: Vec<_> = grouped.keys().cloned().collect();
        keys.sort_by(|a, b| b.cmp(a));
        keys.into_iter()
            .map(|group_key| {
                let mut items = grouped.remove(&group_key).unwrap_or_default();
                items.sort_by(|a, b| b.created_at.cmp(&a.created_at));
                GroupedThoughts { group_key, items }
            })
            .collect()
    }

    pub fn delete(&mut self, id: &str) -> bool {
        if self.thoughts.remove(id).is_some() {
            self.compact();
            true
        } else {
            false
        }
    }

    pub fn remove_tag(&mut self, tag_name: &str) -> bool {
        let mut updated = false;
        for t in self.thoughts.values_mut() {
            if t.tags.iter().any(|x| x == tag_name) {
                t.tags.retain(|x| x != tag_name);
                t.updated_at = Utc::now().to_rfc3339();
                updated = true;
            }
        }
        if updated {
            self.compact();
        }
        updated
    }

    fn append_thought(&mut self, thought: &Thought) {
        let line = serde_json::to_string(thought).unwrap_or_default() + "\n";
        let _ = fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&self.thoughts_file)
            .and_then(|mut f| f.write_all(line.as_bytes()));
        self.thoughts.insert(thought.id.clone(), thought.clone());
    }

    fn compact(&mut self) {
        let mut all: Vec<Thought> = self.thoughts.values().cloned().collect();
        all.sort_by(|a, b| a.created_at.cmp(&b.created_at));
        let tmp = self.thoughts_file.with_extension("tmp");
        if let Ok(mut f) = fs::File::create(&tmp) {
            for t in &all {
                let line = serde_json::to_string(t).unwrap_or_default() + "\n";
                let _ = f.write_all(line.as_bytes());
            }
            let _ = f.sync_all();
        }
        let _ = fs::rename(&tmp, &self.thoughts_file);
    }
}
