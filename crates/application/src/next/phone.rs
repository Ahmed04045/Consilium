//! Opt-in calendar snapshots. No executable content, credentials or file bindings.
use super::*;
use consilium_adapters::account::{self, AccountConfig};
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};
static SYNC_LOCK: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());
#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct PhoneSnapshot {
    schema_version: u32,
    calendars: Vec<Calendar>,
    labels: Vec<Label>,
    tasks: Vec<Task>,
    occurrences: Vec<OccurrenceOverride>,
}
impl PhoneSnapshot {
    fn records(&self) -> Result<BTreeMap<String, Value>> {
        ensure!(self.schema_version == 1, "Unsupported phone format");
        ensure!(
            serde_json::to_vec(self)?.len() <= 1_900_000,
            "Calendar sync exceeds 1.9 MB"
        );
        let mut records = BTreeMap::new();
        let mut add = |kind: &str, id: &str, value: Value| -> Result<()> {
            ensure!(
                !id.is_empty() && id.len() <= 180 && !id.chars().any(char::is_control),
                "Invalid sync ID"
            );
            ensure!(
                records.insert(key(kind, id), value).is_none(),
                "Duplicate sync record"
            );
            Ok(())
        };
        for (kind, count) in [
            ("calendar", self.calendars.len()),
            ("label", self.labels.len()),
            ("task", self.tasks.len()),
            ("occurrence", self.occurrences.len()),
        ] {
            ensure!(count <= 5000, "Too many {kind} records");
        }
        let calendars: BTreeSet<_> = self.calendars.iter().map(|c| c.id.as_str()).collect();
        let labels: BTreeMap<_, _> = self.labels.iter().map(|l| (l.id.as_str(), l)).collect();
        let tasks: BTreeMap<_, _> = self.tasks.iter().map(|t| (t.id.as_str(), t)).collect();
        for c in &self.calendars {
            ensure!(
                !c.name.trim().is_empty() && c.name.len() <= 200,
                "Invalid calendar name"
            );
            let _: chrono_tz::Tz = c.timezone.parse().context("Invalid timezone")?;
            add("calendar", &c.id, json!(c))?;
        }
        for l in &self.labels {
            ensure!(
                !l.name.trim().is_empty() && l.name.len() <= 100 && l.color.len() <= 32,
                "Invalid label"
            );
            ensure!(
                l.calendar_id
                    .as_deref()
                    .is_none_or(|id| calendars.contains(id)),
                "Missing label calendar"
            );
            add("label", &l.id, json!(l))?;
        }
        let validate = |t: &Task| -> Result<()> {
            validate_task(t)?;
            ensure!(
                calendars.contains(t.calendar_id.as_str()),
                "Missing task calendar"
            );
            if let Some(id) = &t.label_id {
                let l = labels.get(id.as_str()).context("Missing task label")?;
                ensure!(
                    l.calendar_id.is_none() || l.calendar_id.as_ref() == Some(&t.calendar_id),
                    "Label belongs to another calendar"
                );
            }
            let mut seen = BTreeSet::from([t.id.as_str()]);
            let mut parent = t.parent_id.as_deref();
            while let Some(id) = parent {
                ensure!(seen.insert(id), "Cyclic task parents");
                let p = tasks.get(id).context("Missing parent task")?;
                ensure!(
                    p.calendar_id == t.calendar_id,
                    "Parent belongs to another calendar"
                );
                parent = p.parent_id.as_deref();
            }
            Ok(())
        };
        for t in &self.tasks {
            validate(t)?;
            add("task", &t.id, json!(t))?;
        }
        for o in &self.occurrences {
            let series = tasks
                .get(o.series_id.as_str())
                .context("Missing recurrence series")?;
            ensure!(
                series.recurrence.is_some(),
                "Override requires a recurring task"
            );
            ensure!(
                !expand(series, &o.original_date, &o.original_date, &[])?.is_empty(),
                "Invalid occurrence date"
            );
            if let Some(t) = &o.task {
                validate(t)?;
                ensure!(
                    t.id == o.series_id
                        && t.calendar_id == series.calendar_id
                        && t.recurrence.is_none(),
                    "Invalid occurrence override"
                );
            }
            add(
                "occurrence",
                &format!("{}@{}", o.series_id, o.original_date),
                json!(o),
            )?;
        }
        Ok(records)
    }
}
impl Engine {
    fn phone_config(&self) -> Result<Option<AccountConfig>> {
        if let Some(c) = self.store.read::<AccountConfig>("account_config")? {
            c.value.validate()?;
            return Ok(Some(c.value));
        }
        match (
            option_env!("CONSILIUM_SUPABASE_URL"),
            option_env!("CONSILIUM_SUPABASE_PUBLISHABLE_KEY"),
        ) {
            (Some(url), Some(key)) => {
                let c = AccountConfig {
                    project_url: url.into(),
                    public_key: key.into(),
                };
                c.validate()?;
                Ok(Some(c))
            }
            _ => {
                let c: AccountConfig =
                    serde_json::from_str(include_str!("../../../../schemas/phone-service.json"))?;
                c.validate()?;
                Ok(Some(c))
            }
        }
    }
    fn phone_snapshot(&self) -> Result<PhoneSnapshot> {
        let values = |kind: &str| -> Result<Value> {
            Ok(json!(self
                .next_list(kind)?
                .into_iter()
                .map(|r| r.value)
                .collect::<Vec<_>>()))
        };
        let tasks: Vec<Task> = decode(values("task")?)?;
        let ids: BTreeSet<_> = tasks.iter().map(|t| t.id.as_str()).collect();
        let occurrences: Vec<OccurrenceOverride> = decode(values("occurrence")?)?;
        Ok(PhoneSnapshot {
            schema_version: 1,
            calendars: decode(values("calendar")?)?,
            labels: decode(values("label")?)?,
            occurrences: occurrences
                .into_iter()
                .filter(|o| ids.contains(o.series_id.as_str()))
                .collect(),
            tasks,
        })
    }
    fn phone_restore(
        &self,
        snapshot: PhoneSnapshot,
        expected_epoch: i64,
        baseline_key: &str,
        remote_revision: i64,
    ) -> Result<()> {
        let records = snapshot.records()?;
        let _guard = self
            .gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Store busy"))?;
        let epoch = self.mutation_epoch()?;
        ensure!(
            epoch.1 == expected_epoch,
            "Workspace changed. Preview sync again."
        );
        let mut writes = vec![epoch];
        for kind in ["calendar", "label", "task", "occurrence"] {
            for old in self.store.list::<Value>(&format!("next:{kind}:"))? {
                let id = if kind == "occurrence" {
                    format!(
                        "{}@{}",
                        field(&old.value, "series_id")?,
                        field(&old.value, "original_date")?
                    )
                } else {
                    field(&old.value, "id")?.to_string()
                };
                let k = key(kind, &id);
                if !records.contains_key(&k) && old.value["deleted"] != true {
                    let mut value = old.value;
                    value["deleted"] = json!(true);
                    writes.push((k, old.revision, value));
                }
            }
        }
        for (k, v) in records {
            let rev = self.store.read::<Value>(&k)?.map_or(0, |r| r.revision);
            writes.push((k, rev, v));
        }
        let rev = self
            .store
            .read::<Value>(baseline_key)?
            .map_or(0, |r| r.revision);
        writes.push((
            baseline_key.into(),
            rev,
            json!({"remote_revision":remote_revision}),
        ));
        self.store.backup()?;
        self.store.write_many(&writes)?;
        Ok(())
    }
    pub(super) async fn phone_action(&self, action: &str, p: Value) -> Result<Value> {
        let _sync = SYNC_LOCK
            .try_lock()
            .context("A sync or account request is already running")?;
        let config = self.phone_config()?;
        if action == "next_phone_status" {
            return Ok(
                json!({"configured":config.is_some(),"connected":config.as_ref().is_some_and(|c|c.connected()),"email":config.as_ref().and_then(|c|c.email())}),
            );
        }
        let c = config.context("Phone connection is not configured in this build")?;
        if action == "next_phone_login" {
            return account::login(
                &c,
                field(&p, "email")?,
                field(&p, "password")?,
                p["signup"] == true,
            )
            .await;
        }
        if action == "next_phone_logout" {
            c.disconnect()?;
            return Ok(Value::Null);
        }
        if action == "next_phone_verify" {
            let (token, user) = account::session(&c).await?;
            let remote = account::call(&c, "/auth/v1/user", Some(&token), None).await?;
            ensure!(
                remote["id"].as_str() == Some(user.as_str()),
                "Account identity changed. Sign in again."
            );
            ensure!(
                remote["email_confirmed_at"].as_str().is_some(),
                "Confirm your email before syncing."
            );
            return Ok(json!({"message":"Connection verified","email":remote["email"]}));
        }
        ensure!(action == "next_phone_sync", "Unknown phone action");
        let mode = p["mode"].as_str().unwrap_or("preview");
        ensure!(
            ["preview", "upload", "download"].contains(&mode),
            "Unknown sync mode"
        );
        let (token, user) = account::session(&c).await?;
        let remote = account::call(
            &c,
            "/rest/v1/rpc/consilium_phone_read",
            Some(&token),
            Some(json!({})),
        )
        .await?;
        let remote_revision = remote["revision"]
            .as_i64()
            .context("Invalid sync response")?;
        let baseline_key = format!(
            "phone-baseline:{}:{user}",
            c.project_url.trim_end_matches('/')
        );
        let baseline = self.store.read::<Value>(&baseline_key)?;
        let expected = baseline
            .as_ref()
            .and_then(|r| r.value["remote_revision"].as_i64())
            .unwrap_or(0);
        let (snapshot, epoch) = {
            let _g = self
                .gate
                .lock()
                .map_err(|_| anyhow::anyhow!("Store busy"))?;
            (self.phone_snapshot()?, self.mutation_epoch()?.1)
        };
        snapshot.records()?;
        if mode == "preview" {
            return Ok(
                json!({"local_epoch":epoch,"remote_revision":remote_revision,"can_upload":expected==remote_revision,"remote_exists":remote_revision>0,"calendars":snapshot.calendars.len(),"tasks":snapshot.tasks.len(),"remote_tasks":remote["payload"]["tasks"].as_array().map_or(0,|v|v.len())}),
            );
        }
        ensure!(
            p["local_epoch"].as_i64() == Some(epoch)
                && p["remote_revision"].as_i64() == Some(remote_revision),
            "Changes since preview. Preview sync again."
        );
        if mode == "upload" {
            ensure!(
                expected == remote_revision,
                "Another device changed the calendar. Download and review it first."
            );
            let revision = account::call(
                &c,
                "/rest/v1/rpc/consilium_phone_save",
                Some(&token),
                Some(json!({"expected_revision":remote_revision,"workspace":snapshot})),
            )
            .await?;
            let rev = revision.as_i64().context("Invalid server revision")?;
            self.store.write(
                &baseline_key,
                baseline.map_or(0, |r| r.revision),
                &json!({"remote_revision":rev}),
            )?;
        } else {
            ensure!(remote_revision > 0, "No calendar has been uploaded yet");
            self.phone_restore(
                decode(remote["payload"].clone())?,
                epoch,
                &baseline_key,
                remote_revision,
            )?;
        }
        Ok(json!({"message":"Sync complete"}))
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    fn empty() -> PhoneSnapshot {
        PhoneSnapshot {
            schema_version: 1,
            calendars: vec![],
            labels: vec![],
            tasks: vec![],
            occurrences: vec![],
        }
    }
    #[test]
    fn payload_is_allowlisted_and_validates_references() {
        let mut s = empty();
        assert!(s.records().is_ok());
        s.tasks.push(Task {
            id: "t".into(),
            calendar_id: "missing".into(),
            title: "Test".into(),
            start_date: "2026-10-30".into(),
            end_date: "2026-10-30".into(),
            ..Task::default()
        });
        assert!(s.records().is_err());
        assert!(serde_json::from_value::<PhoneSnapshot>(json!({"schema_version":1,"calendars":[],"labels":[],"tasks":[],"occurrences":[],"profiles":[]})).is_err());
    }
    #[test]
    fn restore_is_atomic_revision_checked_and_preserves_private_records() {
        let dir = tempfile::tempdir().unwrap();
        let e = Engine::new(consilium_storage::Store::new(dir.path().into()).unwrap());
        e.store
            .write("next:profile:test", 0, &json!({"id":"test"}))
            .unwrap();
        let mut s = empty();
        s.calendars.push(Calendar {
            id: "c".into(),
            name: "Calendar".into(),
            timezone: "UTC".into(),
        });
        e.phone_restore(s, 0, "baseline", 1).unwrap();
        assert!(e.phone_restore(empty(), 0, "baseline", 2).is_err());
        assert_eq!(e.next_list("calendar").unwrap().len(), 1);
        e.phone_restore(empty(), 1, "baseline", 2).unwrap();
        assert!(e.next_list("calendar").unwrap().is_empty());
        assert!(e
            .store
            .read::<Value>("next:profile:test")
            .unwrap()
            .is_some());
    }
}
