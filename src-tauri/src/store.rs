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

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TagMetadata {
    pub name: String,
    pub active_count: usize,
    pub archived_count: usize,
    pub total_count: usize,
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

    pub fn tag_metadata(&self) -> Vec<TagMetadata> {
        let mut tags: HashMap<&str, (usize, usize)> = HashMap::new();
        for thought in self.thoughts.values() {
            for tag in &thought.tags {
                let entry = tags.entry(tag.as_str()).or_insert((0, 0));
                if thought.archived {
                    entry.1 += 1;
                } else {
                    entry.0 += 1;
                }
            }
        }

        let mut out: Vec<_> = tags
            .into_iter()
            .map(|(name, (active_count, archived_count))| TagMetadata {
                name: name.to_string(),
                active_count,
                archived_count,
                total_count: active_count + archived_count,
            })
            .collect();
        out.sort_by(|a, b| a.name.to_lowercase().cmp(&b.name.to_lowercase()));
        out
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
        let view_month = options.view_mode == "month";
        let mut matched: Vec<(i64, String, &Thought)> = Vec::new();

        for item in self.thoughts.values() {
            let Ok(dt) = chrono::DateTime::parse_from_rfc3339(&item.created_at) else {
                continue;
            };
            let ts = dt.timestamp_millis();
            if ts < from_ts || ts > to_ts {
                continue;
            }
            if let Some(archived) = options.archived {
                if item.archived != archived {
                    continue;
                }
            }
            if !tags.is_empty() && !item.tags.iter().any(|t| tags.contains(t)) {
                continue;
            }

            let key = if view_month {
                format!("{:04}-{:02}", dt.year(), dt.month())
            } else {
                format!("{:04}-{:02}-{:02}", dt.year(), dt.month(), dt.day())
            };
            matched.push((ts, key, item));
        }

        matched.sort_by(|a, b| b.0.cmp(&a.0));

        let offset = options.offset.unwrap_or(0) as usize;
        let limit = options.limit.map(|n| n as usize).unwrap_or(usize::MAX);
        let mut grouped: HashMap<String, Vec<Thought>> = HashMap::new();
        for (_, group_key, item) in matched.into_iter().skip(offset).take(limit) {
            grouped.entry(group_key).or_default().push(item.clone());
        }

        let mut keys: Vec<_> = grouped.keys().cloned().collect();
        keys.sort_by(|a, b| b.cmp(a));
        keys.into_iter()
            .map(|group_key| {
                let items = grouped.remove(&group_key).unwrap_or_default();
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

    pub fn delete_many(&mut self, ids: &[String]) -> usize {
        let mut deleted = 0usize;
        for id in ids {
            if self.thoughts.remove(id).is_some() {
                deleted += 1;
            }
        }
        if deleted > 0 {
            self.compact();
        }
        deleted
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

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::Instant;

    fn temp_store_path(name: &str) -> PathBuf {
        std::env::temp_dir().join(format!("onethought-{name}-{}.jsonl", Uuid::new_v4()))
    }

    fn thought(id: &str, created_at: &str, archived: bool, tags: &[&str]) -> Thought {
        Thought {
            id: id.to_string(),
            content: format!("content-{id}"),
            created_at: created_at.to_string(),
            updated_at: created_at.to_string(),
            status: "active".to_string(),
            archived,
            tags: tags.iter().map(|tag| tag.to_string()).collect(),
            source: "main_ui".to_string(),
            pinned: false,
            summary_id: None,
            meta: ThoughtMeta {
                device: "test".to_string(),
                app_version: "0.1.0".to_string(),
            },
        }
    }

    fn repo_with(thoughts: Vec<Thought>) -> ThoughtRepository {
        let mut repo = ThoughtRepository {
            thoughts_file: temp_store_path("repo"),
            thoughts: HashMap::new(),
        };
        for item in thoughts {
            repo.thoughts.insert(item.id.clone(), item);
        }
        repo
    }

    #[test]
    fn tag_metadata_counts_without_full_thought_payloads() {
        let repo = repo_with(vec![
            thought("1", "2026-06-01T09:00:00Z", false, &["work", "rust"]),
            thought("2", "2026-06-01T10:00:00Z", true, &["work"]),
            thought("3", "2026-06-01T11:00:00Z", false, &["rust"]),
        ]);

        let metadata = repo.tag_metadata();

        assert_eq!(
            metadata,
            vec![
                TagMetadata {
                    name: "rust".to_string(),
                    active_count: 2,
                    archived_count: 0,
                    total_count: 2,
                },
                TagMetadata {
                    name: "work".to_string(),
                    active_count: 1,
                    archived_count: 1,
                    total_count: 2,
                },
            ]
        );
    }

    #[test]
    fn grouped_query_preserves_order_and_applies_limit() {
        let repo = repo_with(vec![
            thought("old", "2026-05-30T08:00:00Z", false, &["work"]),
            thought("middle", "2026-06-01T09:00:00Z", false, &["work"]),
            thought("new", "2026-06-02T10:00:00Z", false, &["work"]),
            thought("archived", "2026-06-03T10:00:00Z", true, &["work"]),
        ]);

        let groups = repo.query_grouped(&QueryOptions {
            view_mode: "day".to_string(),
            from: None,
            to: None,
            archived: Some(false),
            tags: Some(vec!["work".to_string()]),
            limit: Some(2),
            offset: Some(0),
        });

        assert_eq!(groups.len(), 2);
        assert_eq!(groups[0].group_key, "2026-06-02");
        assert_eq!(groups[0].items[0].id, "new");
        assert_eq!(groups[1].group_key, "2026-06-01");
        assert_eq!(groups[1].items[0].id, "middle");
    }

    #[test]
    fn delete_many_compacts_once_and_preserves_jsonl_compatibility() {
        let path = temp_store_path("delete-many");
        let mut repo = ThoughtRepository {
            thoughts_file: path.clone(),
            thoughts: HashMap::new(),
        };
        for item in [
            thought("1", "2026-06-01T09:00:00Z", false, &["work"]),
            thought("2", "2026-06-01T10:00:00Z", true, &["work"]),
            thought("3", "2026-06-01T11:00:00Z", true, &["rust"]),
        ] {
            repo.thoughts.insert(item.id.clone(), item);
        }
        repo.compact();

        let deleted = repo.delete_many(&["2".to_string(), "3".to_string()]);
        let reloaded = ThoughtRepository::load(path.clone());
        let _ = fs::remove_file(path);

        assert_eq!(deleted, 2);
        assert_eq!(reloaded.get_all().len(), 1);
        assert_eq!(reloaded.get_all()[0].id, "1");
    }

    #[test]
    fn large_dataset_validation_exercises_optimized_paths() {
        let mut items = Vec::with_capacity(5_000);
        for i in 0..5_000 {
            let day = (i % 28) + 1;
            let hour = i % 24;
            let created_at = format!("2026-05-{day:02}T{hour:02}:00:00Z");
            let archived = i % 7 == 0;
            let tag = if i % 2 == 0 { "work" } else { "life" };
            items.push(thought(&format!("t{i}"), &created_at, archived, &[tag]));
        }
        let mut repo = repo_with(items);

        let started = Instant::now();
        let tags = repo.tag_metadata();
        let groups = repo.query_grouped(&QueryOptions {
            view_mode: "day".to_string(),
            from: Some("2026-05-01T00:00:00Z".to_string()),
            to: Some("2026-05-31T23:59:59Z".to_string()),
            archived: Some(false),
            tags: Some(vec!["work".to_string()]),
            limit: Some(100),
            offset: Some(0),
        });
        let created = repo.create("new item".to_string(), vec!["work".to_string()], "test", "test");
        let archived = repo.update(&created.id, serde_json::json!({ "archived": true }));
        let deleted = repo.delete_many(&[created.id]);

        assert_eq!(tags.len(), 2);
        assert!(!groups.is_empty());
        assert!(groups.iter().map(|group| group.items.len()).sum::<usize>() <= 100);
        assert!(archived.as_ref().is_some_and(|item| item.archived));
        assert_eq!(deleted, 1);
        assert!(started.elapsed().as_secs() < 5);
    }
}
