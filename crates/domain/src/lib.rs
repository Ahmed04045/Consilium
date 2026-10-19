use anyhow::{bail, Result};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;

pub fn id() -> String {
    uuid::Uuid::new_v4().to_string()
}
pub fn now() -> String {
    chrono::Utc::now().to_rfc3339()
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Profile {
    pub timezone: String,
    pub daily_budget_minutes: u32,
    pub interests: Vec<String>,
    pub background: String,
}
impl Default for Profile {
    fn default() -> Self {
        Self {
            timezone: "UTC".into(),
            daily_budget_minutes: 120,
            interests: vec![],
            background: String::new(),
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Track {
    pub id: String,
    pub title: String,
    pub outcome: String,
    pub module: String,
    pub minutes: u32,
    pub status: String,
    pub completion_criterion: String,
    #[serde(default)]
    pub goal_id: String,
    #[serde(default)]
    pub module_sequence: Vec<String>,
    #[serde(default)]
    pub module_index: usize,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Goal {
    pub id: String,
    pub title: String,
    pub outcome: String,
    pub status: String,
    pub priority: u32,
    pub target_date: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Review {
    pub local_date: String,
    pub timezone: String,
    pub note_id: String,
    pub energy: u8,
    pub difficulty: u8,
}
#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Block {
    #[serde(default)]
    pub resource_ids: Vec<String>,
    pub id: String,
    pub track_id: String,
    pub objective: String,
    pub minutes: u32,
    pub completion_criterion: String,
    pub locked: bool,
    pub completed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Plan {
    pub date: String,
    pub timezone: String,
    pub budget: u32,
    pub blocks: Vec<Block>,
}

pub fn validate_plan(plan: &Plan, tracks: &[Track], current: Option<&Plan>) -> Result<()> {
    chrono::NaiveDate::parse_from_str(&plan.date, "%Y-%m-%d")?;
    if plan.budget > 1440 || plan.timezone.is_empty() {
        bail!("Invalid daily budget or timezone");
    }
    let active: HashSet<&str> = tracks
        .iter()
        .filter(|t| t.status == "active")
        .map(|t| t.id.as_str())
        .collect();
    let mut ids = HashSet::new();
    let mut total = 0u64;
    for block in &plan.blocks {
        if let Some(old) = current {
            let existing = old.blocks.iter().find(|b| b.id == block.id);
            if existing.map_or(!block.resource_ids.is_empty(), |b| {
                b.resource_ids != block.resource_ids
            }) {
                bail!(
                    "Resource assignments must be preserved; use the resource queue to change them"
                );
            }
        }
        if !ids.insert(&block.id) || block.id.is_empty() {
            bail!("Duplicate or empty block ID");
        }
        if !active.contains(block.track_id.as_str())
            && !current.is_some_and(|p| {
                p.blocks
                    .iter()
                    .any(|b| b == block && (b.completed || b.locked))
            })
        {
            bail!("Unknown or paused track");
        }
        if block.minutes == 0
            || block.objective.trim().is_empty()
            || block.completion_criterion.trim().is_empty()
        {
            bail!("Blocks need positive minutes, an objective and a completion criterion");
        }
        total += u64::from(block.minutes);
        if block.completed
            && !current.is_some_and(|p| p.blocks.iter().any(|b| b.id == block.id && b.completed))
        {
            bail!("Only recorded sessions can complete a block");
        }
    }
    if total > u64::from(plan.budget) {
        bail!("Plan exceeds the daily budget");
    }
    if let Some(old) = current {
        if old.date != plan.date || old.timezone != plan.timezone || old.budget != plan.budget {
            bail!("Plan date, timezone and budget must match the request");
        }
        for fixed in old.blocks.iter().filter(|b| b.locked || b.completed) {
            if !plan.blocks.contains(fixed) {
                bail!("Locked or completed blocks must remain unchanged");
            }
        }
    }
    Ok(())
}

pub fn template(date: &str, profile: &Profile, tracks: &[Track]) -> Plan {
    let mut left = profile.daily_budget_minutes;
    let blocks = tracks
        .iter()
        .filter(|t| t.status == "active")
        .filter_map(|t| {
            let minutes = t.minutes.min(left);
            left -= minutes;
            (minutes > 0).then(|| Block {
                resource_ids: vec![],
                id: id(),
                track_id: t.id.clone(),
                objective: t.module.clone(),
                minutes,
                completion_criterion: t.completion_criterion.clone(),
                locked: false,
                completed: false,
            })
        })
        .collect();
    Plan {
        date: date.into(),
        timezone: profile.timezone.clone(),
        budget: profile.daily_budget_minutes,
        blocks,
    }
}

#[derive(Clone, Debug, Serialize, Deserialize, PartialEq)]
pub struct EmbeddingIdentity {
    pub provider_kind: String,
    pub endpoint_identity: String,
    pub model_name: String,
    pub model_fingerprint: Option<String>,
    pub dimensions: usize,
    pub distance_metric: String,
    pub normalization_version: u32,
    pub chunker_version: u32,
}
pub fn normalize(vector: &[f32], expected: usize) -> Result<Vec<f32>> {
    if vector.is_empty() || vector.len() != expected || vector.iter().any(|x| !x.is_finite()) {
        bail!("Invalid embedding dimensions or values");
    }
    let norm = vector
        .iter()
        .map(|x| (*x as f64).powi(2))
        .sum::<f64>()
        .sqrt();
    if norm == 0.0 || !norm.is_finite() {
        bail!("Embedding has zero or invalid magnitude");
    }
    Ok(vector.iter().map(|x| (*x as f64 / norm) as f32).collect())
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub title: String,
    pub body: String,
    pub tags: Vec<String>,
    pub track_id: Option<String>,
    pub revision: i64,
    pub updated_at: String,
    #[serde(default = "schema_version")]
    pub schema_version: u32,
    #[serde(default = "now")]
    pub created_at: String,
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub local_date: Option<String>,
    #[serde(default)]
    pub energy: Option<u8>,
    #[serde(default)]
    pub difficulty: Option<u8>,
}
pub fn schema_version() -> u32 {
    1
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Memory {
    pub id: String,
    pub statement: String,
    pub status: String,
    pub source_id: String,
    pub source_revision: i64,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Resource {
    pub id: String,
    pub title: String,
    pub url: String,
    pub kind: String,
    pub provenance: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub block_id: String,
    pub plan_date: String,
    pub started_at: String,
    pub active_seconds: u64,
    pub status: String,
    pub outcome: String,
    pub last_tick: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Settings {
    pub provider: String,
    pub endpoint: String,
    pub chat_model: String,
    pub embedding_model: String,
    pub context_tokens: usize,
}
impl Default for Settings {
    fn default() -> Self {
        Self {
            provider: "ollama".into(),
            endpoint: "http://127.0.0.1:11434".into(),
            chat_model: String::new(),
            embedding_model: String::new(),
            context_tokens: 8192,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn embeddings_reject_invalid_vectors() {
        for vector in [
            vec![],
            vec![0., 0.],
            vec![f32::NAN, 1.],
            vec![f32::INFINITY, 1.],
            vec![1.],
        ] {
            assert!(normalize(&vector, 2).is_err());
        }
        assert_eq!(normalize(&[3., 4.], 2).unwrap(), vec![0.6, 0.8]);
    }
    #[test]
    fn model_identity_is_not_dimension_identity() {
        let a = EmbeddingIdentity {
            provider_kind: "ollama".into(),
            endpoint_identity: "http://127.0.0.1:11434".into(),
            model_name: "a:latest".into(),
            model_fingerprint: Some("digest1".into()),
            dimensions: 768,
            distance_metric: "cosine".into(),
            normalization_version: 1,
            chunker_version: 1,
        };
        let mut b = a.clone();
        b.model_name = "b:latest".into();
        assert_ne!(a, b);
        b = a.clone();
        b.model_fingerprint = Some("digest2".into());
        assert_ne!(a, b);
    }
    #[test]
    fn scheduler_rejects_invalid_and_preserves_locked() {
        let track = Track {
            id: id(),
            title: "History".into(),
            outcome: "Learn".into(),
            module: "Athens".into(),
            minutes: 30,
            status: "active".into(),
            completion_criterion: "Explain".into(),
            goal_id: String::new(),
            module_sequence: vec![],
            module_index: 0,
        };
        let tracks = vec![track];
        let mut old = template("2026-10-17", &Profile::default(), &tracks);
        old.blocks[0].locked = true;
        let mut new = old.clone();
        new.blocks[0].minutes = 40;
        assert!(validate_plan(&new, &tracks, Some(&old)).is_err());
        new = old.clone();
        new.blocks[0].track_id = "missing".into();
        assert!(validate_plan(&new, &tracks, Some(&old)).is_err());
        new = old.clone();
        new.blocks[0].minutes = 0;
        assert!(validate_plan(&new, &tracks, None).is_err());
        assert!(validate_plan(&old, &tracks, Some(&old)).is_ok());
    }
}
