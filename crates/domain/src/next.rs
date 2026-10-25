use anyhow::{ensure, Context, Result};
use chrono::{Datelike, Duration, NaiveDate, NaiveDateTime, TimeZone};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const SCHEMA_VERSION: u32 = 1;
pub fn version() -> u32 {
    SCHEMA_VERSION
}
pub fn new_id() -> String {
    crate::id()
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Calendar {
    pub id: String,
    pub name: String,
    pub timezone: String,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Label {
    pub id: String,
    pub name: String,
    pub color: String,
    pub calendar_id: Option<String>,
}
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum TaskKind {
    Timed,
    #[default]
    Flexible,
    Goal,
}
#[derive(Clone, Debug, Serialize, Deserialize, Default, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Step {
    pub id: String,
    pub title: String,
    pub completed: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Recurrence {
    pub frequency: String,
    #[serde(default = "one")]
    pub interval: u32,
    #[serde(default)]
    pub weekdays: Vec<u32>,
    pub count: Option<u32>,
    pub until: Option<String>,
}
fn one() -> u32 {
    1
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Task {
    pub id: String,
    pub calendar_id: String,
    pub title: String,
    pub kind: TaskKind,
    pub start_date: String,
    pub end_date: String,
    pub start_time: String,
    pub end_time: String,
    pub timezone: String,
    pub label_id: Option<String>,
    pub parent_id: Option<String>,
    pub color: String,
    pub description: String,
    pub completed: bool,
    pub steps: Vec<Step>,
    pub target: Option<f64>,
    pub progress: f64,
    pub unit: String,
    pub recurrence: Option<Recurrence>,
    pub deleted: bool,
    pub archived: bool,
}
impl Default for Task {
    fn default() -> Self {
        Self {
            id: new_id(),
            calendar_id: String::new(),
            title: String::new(),
            kind: TaskKind::Flexible,
            start_date: String::new(),
            end_date: String::new(),
            start_time: String::new(),
            end_time: String::new(),
            timezone: "UTC".into(),
            label_id: None,
            parent_id: None,
            color: "green".into(),
            description: String::new(),
            completed: false,
            steps: vec![],
            target: None,
            progress: 0.0,
            unit: String::new(),
            recurrence: None,
            deleted: false,
            archived: false,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Occurrence {
    pub id: String,
    pub series_id: String,
    pub original_date: String,
    pub task: Task,
    pub overridden: bool,
    pub time_issue: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct OccurrenceOverride {
    pub series_id: String,
    pub original_date: String,
    pub task: Option<Task>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub scope: String,
    pub document: String,
    pub text: String,
    pub blocks: Vec<DocumentBlock>,
    pub deleted: bool,
}
impl Default for Document {
    fn default() -> Self {
        Self {
            id: new_id(),
            title: "Untitled document".into(),
            scope: String::new(),
            document: String::new(),
            text: String::new(),
            blocks: vec![],
            deleted: false,
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case", deny_unknown_fields)]
pub enum DocumentBlock {
    Heading { level: u8, text: String },
    Paragraph { text: String },
    List { items: Vec<String>, ordered: bool },
    Table { rows: Vec<Vec<String>> },
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ModelProfile {
    pub id: String,
    pub name: String,
    pub provider: String,
    pub model: String,
    pub endpoint: String,
    pub context_tokens: usize,
    pub credential_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Message {
    pub id: String,
    pub role: String,
    pub content: String,
    pub at: String,
    #[serde(default)]
    pub proposal_id: Option<String>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(default, deny_unknown_fields)]
pub struct Thread {
    pub id: String,
    pub title: String,
    pub scope: String,
    pub mode: String,
    pub profile_id: String,
    pub messages: Vec<Message>,
    pub summary: String,
    pub summary_sources: Vec<String>,
}
impl Default for Thread {
    fn default() -> Self {
        Self {
            id: new_id(),
            title: "New conversation".into(),
            scope: String::new(),
            mode: "schedule_chat".into(),
            profile_id: String::new(),
            messages: vec![],
            summary: String::new(),
            summary_sources: vec![],
        }
    }
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Change {
    pub kind: String,
    pub id: String,
    pub expected_revision: i64,
    pub value: Value,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ChangeSet {
    pub id: String,
    pub scope: String,
    pub summary: String,
    pub changes: Vec<Change>,
    pub accepted: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LocalBinding {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub path: String,
    pub writable: bool,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct AddonManifest {
    pub schema_version: u32,
    pub id: String,
    pub version: String,
    pub host_api: u32,
    pub capabilities: Vec<String>,
    pub node_kinds: Vec<String>,
}

pub fn date(value: &str) -> Result<NaiveDate> {
    let d = NaiveDate::parse_from_str(value, "%Y-%m-%d")?;
    ensure!(d.to_string() == value, "Use YYYY-MM-DD dates");
    Ok(d)
}
pub fn local_instant(
    day: &str,
    time: &str,
    timezone: &str,
) -> Result<chrono::DateTime<chrono_tz::Tz>> {
    let tz: chrono_tz::Tz = timezone.parse().context("Choose an IANA timezone")?;
    let value = NaiveDateTime::parse_from_str(&format!("{day}T{time}"), "%Y-%m-%dT%H:%M")?;
    tz.from_local_datetime(&value).single().context("This local time is ambiguous or does not exist because of a daylight-saving transition. Choose another time.")
}
pub fn validate_task(t: &Task) -> Result<()> {
    ensure!(
        !t.id.is_empty() && !t.calendar_id.is_empty(),
        "Task identity and calendar are required"
    );
    ensure!(
        !t.title.trim().is_empty() && t.title.chars().count() <= 300,
        "Enter a title of 1–300 characters"
    );
    ensure!(
        t.description.chars().count() <= 12000,
        "Task description is too long"
    );
    let start = date(&t.start_date)?;
    let end = date(&t.end_date)?;
    ensure!(end >= start, "End must not precede start");
    let _: chrono_tz::Tz = t.timezone.parse().context("Choose an IANA timezone")?;
    if t.kind == TaskKind::Timed {
        ensure!(
            local_instant(&t.end_date, &t.end_time, &t.timezone)?
                > local_instant(&t.start_date, &t.start_time, &t.timezone)?,
            "End must follow start"
        );
    }
    if t.kind == TaskKind::Flexible {
        ensure!(start == end, "Flexible tasks belong to a single day");
    }
    ensure!(
        t.progress.is_finite() && t.progress >= 0.0,
        "Progress must be a nonnegative number"
    );
    if let Some(target) = t.target {
        ensure!(
            target.is_finite() && target > 0.0,
            "Target must be positive"
        );
    }
    ensure!(
        t.parent_id.as_deref() != Some(&t.id),
        "A task cannot be its own parent"
    );
    ensure!(t.steps.len() <= 100, "Keep at most 100 checklist steps");
    let mut ids = std::collections::HashSet::new();
    for step in &t.steps {
        ensure!(
            !step.id.is_empty() && ids.insert(&step.id) && !step.title.trim().is_empty(),
            "Checklist step IDs and titles must be valid and unique"
        );
    }
    if let Some(r) = &t.recurrence {
        ensure!(
            ["daily", "weekly", "weekdays", "monthly", "yearly"].contains(&r.frequency.as_str()),
            "Unsupported recurrence frequency"
        );
        ensure!(
            (1..=365).contains(&r.interval),
            "Recurrence interval must be 1–365"
        );
        ensure!(
            r.weekdays.iter().all(|d| *d < 7),
            "Weekdays must be 0 (Monday) through 6"
        );
        ensure!(
            r.count.is_none_or(|n| n > 0 && n <= 10000),
            "Occurrence count must be 1–10000"
        );
        ensure!(
            !(r.count.is_some() && r.until.is_some()),
            "Choose an occurrence count or end date, not both"
        );
        if let Some(until) = &r.until {
            ensure!(date(until)? >= start, "Repeat end precedes start");
        }
    }
    Ok(())
}
pub fn expand(
    t: &Task,
    from: &str,
    to: &str,
    exceptions: &[OccurrenceOverride],
) -> Result<Vec<Occurrence>> {
    validate_task(t)?;
    let from = date(from)?;
    let to = date(to)?;
    ensure!(
        to >= from && (to - from).num_days() <= 366,
        "Request a calendar window of at most 367 days"
    );
    if t.deleted {
        return Ok(vec![]);
    }
    let start = date(&t.start_date)?;
    let span = date(&t.end_date)? - start;
    let Some(r) = &t.recurrence else {
        return Ok(if start <= to && start + span >= from {
            vec![Occurrence {
                id: t.id.clone(),
                series_id: t.id.clone(),
                original_date: t.start_date.clone(),
                task: t.clone(),
                overridden: false,
                time_issue: None,
            }]
        } else {
            vec![]
        });
    };
    ensure!(
        (to - start).num_days() <= 366 * 200,
        "Recurrence is outside the supported 200-year planning range"
    );
    let until = r.until.as_ref().map(|s| date(s)).transpose()?.unwrap_or(to);
    let mut day = start;
    let mut count = 0;
    let mut out = vec![];
    while day <= to.min(until) {
        let days = (day - start).num_days();
        let week = (days + start.weekday().num_days_from_monday() as i64) / 7;
        let months = (day.year() - start.year()) * 12 + day.month() as i32 - start.month() as i32;
        let matches = match r.frequency.as_str() {
            "daily" => days % r.interval as i64 == 0,
            "weekdays" => week % r.interval as i64 == 0 && day.weekday().num_days_from_monday() < 5,
            "weekly" => {
                week % r.interval as i64 == 0
                    && (if r.weekdays.is_empty() {
                        day.weekday() == start.weekday()
                    } else {
                        r.weekdays.contains(&day.weekday().num_days_from_monday())
                    })
            }
            "monthly" => months % r.interval as i32 == 0 && day.day() == start.day(),
            "yearly" => {
                (day.year() - start.year()) % r.interval as i32 == 0
                    && day.month() == start.month()
                    && day.day() == start.day()
            }
            _ => false,
        };
        if matches {
            count += 1;
            if r.count.is_some_and(|n| count > n) {
                break;
            }
            let original = day.to_string();
            let exception = exceptions
                .iter()
                .find(|e| e.series_id == t.id && e.original_date == original);
            let mut task = t.clone();
            task.start_date = original.clone();
            task.end_date = (day + span).to_string();
            task.recurrence = None;
            if let Some(e) = exception {
                if let Some(replacement) = &e.task {
                    task = replacement.clone()
                } else {
                    day += Duration::days(1);
                    continue;
                }
            }
            if date(&task.start_date)? <= to && date(&task.end_date)? >= from {
                out.push(Occurrence {
                    id: format!("{}@{original}", t.id),
                    series_id: t.id.clone(),
                    original_date: original,
                    time_issue: validate_task(&task).err().map(|e| e.to_string()),
                    task,
                    overridden: exception.is_some(),
                });
            }
        }
        day += Duration::days(1);
    }
    // An occurrence originally outside the window may have been moved into it.
    for e in exceptions.iter().filter(|e| e.series_id == t.id) {
        if let Some(task) = &e.task {
            if date(&task.start_date)? <= to
                && date(&task.end_date)? >= from
                && !out.iter().any(|o| o.original_date == e.original_date)
            {
                out.push(Occurrence {
                    id: format!("{}@{}", t.id, e.original_date),
                    series_id: t.id.clone(),
                    original_date: e.original_date.clone(),
                    task: task.clone(),
                    overridden: true,
                    time_issue: validate_task(task).err().map(|e| e.to_string()),
                });
            }
        }
    }
    out.sort_by_key(|o| (o.task.start_date.clone(), o.task.start_time.clone()));
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;
    fn sample() -> Task {
        Task {
            calendar_id: "a".into(),
            title: "Practice".into(),
            start_date: "2024-01-31".into(),
            end_date: "2024-01-31".into(),
            recurrence: Some(Recurrence {
                frequency: "monthly".into(),
                interval: 1,
                weekdays: vec![],
                count: Some(3),
                until: None,
            }),
            ..Default::default()
        }
    }
    #[test]
    fn month_end_skips_invalid_dates_and_counts_real_occurrences() {
        let out = expand(&sample(), "2024-01-01", "2024-06-01", &[]).unwrap();
        assert_eq!(
            out.iter()
                .map(|o| o.original_date.as_str())
                .collect::<Vec<_>>(),
            vec!["2024-01-31", "2024-03-31", "2024-05-31"]
        );
    }
    #[test]
    fn leap_year_and_dst() {
        let mut t = sample();
        t.start_date = "2024-02-29".into();
        t.end_date = t.start_date.clone();
        t.recurrence.as_mut().unwrap().frequency = "yearly".into();
        assert!(expand(&t, "2025-01-01", "2025-12-31", &[])
            .unwrap()
            .is_empty());
        assert!(local_instant("2026-03-08", "02:30", "America/New_York").is_err());
        assert!(local_instant("2026-11-01", "01:30", "America/New_York").is_err());
    }
    #[test]
    fn moved_and_deleted_occurrences() {
        let t = sample();
        let mut moved = t.clone();
        moved.start_date = "2024-02-02".into();
        moved.end_date = moved.start_date.clone();
        moved.recurrence = None;
        let e = vec![OccurrenceOverride {
            series_id: t.id.clone(),
            original_date: "2024-01-31".into(),
            task: Some(moved),
        }];
        assert_eq!(expand(&t, "2024-02-01", "2024-02-20", &e).unwrap().len(), 1);
    }
}
