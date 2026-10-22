//! Versioned workspace services shared by the desktop and command line.
mod conversation;
mod migration;
#[cfg(test)]
mod tests;
mod wordcraft;
mod workflows;
use super::{decode, field, Engine};
use anyhow::{bail, ensure, Context, Result};
use consilium_domain::next::*;
use consilium_storage::Record;
use serde_json::{json, Value};
pub fn key(kind: &str, id: &str) -> String {
    format!("next:{kind}:{id}")
}
const KINDS: &[&str] = &[
    "calendar",
    "label",
    "task",
    "occurrence",
    "document",
    "thread",
    "profile",
    "binding",
    "network",
    "changeset",
    "layout",
    "run",
    "artifact",
];
impl Engine {
    fn mutation_epoch(&self) -> Result<(String, i64, Value)> {
        let key = "next:epoch:mutations".to_string();
        let revision = self.store.read::<Value>(&key)?.map_or(0, |r| r.revision);
        Ok((key, revision, json!({"generation":revision+1})))
    }
    pub fn next_list(&self, kind: &str) -> Result<Vec<Record<Value>>> {
        ensure!(KINDS.contains(&kind), "Unknown record type");
        if kind == "run" {
            consilium_workflow::runtime::recover_interrupted(&self.store)?;
        }
        self.store.list(&format!("next:{kind}:"))
    }
    pub fn next_get<T: serde::de::DeserializeOwned>(
        &self,
        kind: &str,
        id: &str,
    ) -> Result<Record<T>> {
        self.store
            .read(&key(kind, id))?
            .context("This item no longer exists")
    }
    pub fn next_validate(&self, kind: &str, id: &str, value: &Value) -> Result<()> {
        ensure!(
            !id.is_empty() && id.len() <= 180 && !id.contains('\0'),
            "Invalid record ID"
        );
        ensure!(
            value["id"].as_str() == Some(id),
            "Record identity does not match"
        );
        match kind {
            "calendar" => {
                let c: Calendar = decode(value.clone())?;
                ensure!(!c.name.trim().is_empty(), "Name is required");
                let _: chrono_tz::Tz = c.timezone.parse().context("Choose an IANA timezone")?;
            }
            "label" => {
                let l: Label = decode(value.clone())?;
                ensure!(
                    !l.name.trim().is_empty() && l.name.len() <= 100,
                    "Label name is required"
                );
                if let Some(c) = l.calendar_id {
                    self.next_get::<Calendar>("calendar", &c)?;
                }
            }
            "task" => {
                let t: Task = decode(value.clone())?;
                validate_task(&t)?;
                self.next_get::<Calendar>("calendar", &t.calendar_id)?;
                if let Some(l) = &t.label_id {
                    let label = self.next_get::<Label>("label", l)?.value;
                    ensure!(
                        label.calendar_id.is_none()
                            || label.calendar_id.as_deref() == Some(&t.calendar_id),
                        "Label belongs to another calendar"
                    );
                }
                if let Some(p) = &t.parent_id {
                    let mut seen = std::collections::HashSet::from([t.id.clone()]);
                    let mut cursor = Some(p.clone());
                    while let Some(id) = cursor {
                        ensure!(seen.insert(id.clone()), "Child tasks cannot form a cycle");
                        let parent = self.next_get::<Task>("task", &id)?.value;
                        ensure!(
                            parent.calendar_id == t.calendar_id && !parent.deleted,
                            "Parent must be in the same calendar"
                        );
                        cursor = parent.parent_id;
                    }
                }
            }
            "document" => {
                let d: Document = decode(value.clone())?;
                ensure!(
                    d.document.len() <= 8_000_000 && d.text.len() <= 1_000_000,
                    "Document is too large"
                );
                if !d.document.is_empty() {
                    let _: Value =
                        serde_json::from_str(&d.document).context("Invalid Wordcraft document")?;
                }
            }
            "profile" => {
                let p: ModelProfile = decode(value.clone())?;
                ensure!(
                    !p.name.trim().is_empty() && !p.model.trim().is_empty(),
                    "Name and exact model ID are required"
                );
                self.next_provider(&p)?;
            }
            "thread" => {
                let t: Thread = decode(value.clone())?;
                self.validate_scope(&t.scope)?;
                ensure!(
                    ["schedule_planning", "schedule_chat", "network_creation"]
                        .contains(&t.mode.as_str()),
                    "Unknown assistant mode"
                );
                if !t.profile_id.is_empty() {
                    self.next_get::<ModelProfile>("profile", &t.profile_id)?;
                }
                if let Some(old) = self.store.read::<Thread>(&key("thread", id))? {
                    ensure!(
                        old.value.scope == t.scope,
                        "Start a new thread to change destination"
                    );
                }
            }
            "binding" => {
                let b: LocalBinding = decode(value.clone())?;
                ensure!(
                    ["file", "folder", "executable"].contains(&b.kind.as_str()),
                    "Unknown binding kind"
                );
                let path = std::path::Path::new(&b.path);
                ensure!(path.is_absolute(), "Choose an absolute local path");
                if !b.writable {
                    ensure!(path.exists(), "The bound resource does not exist");
                }
            }
            "layout" => {
                ensure!(value.to_string().len() < 100_000, "Layout is too large");
            }
            "network" => {
                let n: consilium_workflow::NetworkDefinition = decode(value.clone())?;
                ensure!(
                    n.schema_version == 1 && n.nodes.len() <= 200,
                    "Invalid network draft"
                );
            }
            _ => bail!("Use the dedicated service to modify {kind}"),
        }
        Ok(())
    }
    pub fn validate_scope(&self, scope: &str) -> Result<()> {
        let (kind, id) = scope.split_once(':').context("Choose a destination")?;
        ensure!(
            ["calendar", "label", "task", "network"].contains(&kind),
            "Unsupported destination"
        );
        if kind == "task" && id.contains('@') {
            self.scoped_task(id)?;
        } else {
            self.next_get::<Value>(kind, id)?;
        }
        Ok(())
    }
    pub fn scoped_task(&self, id: &str) -> Result<Record<Value>> {
        let (series, day) = id
            .split_once('@')
            .context("Occurrence identity is missing")?;
        let mut record = self.next_get::<Value>("task", series)?;
        let task: Task = decode(record.value.clone())?;
        let occurrence = expand(&task, day, day, &[])?
            .into_iter()
            .find(|o| o.original_date == day)
            .context("Occurrence no longer exists")?;
        record.value = if let Some(exception) = self
            .store
            .read::<OccurrenceOverride>(&key("occurrence", id))?
        {
            json!(exception
                .value
                .task
                .context("This occurrence was deleted")?)
        } else {
            json!(occurrence.task)
        };
        Ok(record)
    }
    pub async fn next_action(&self, action: &str, p: Value) -> Result<Value> {
        if action.starts_with("next_network_") || action.starts_with("next_run_") {
            return self.workflow_action(action, p).await;
        }
        match action {
            "next_snapshot" => {
                let mut out = serde_json::Map::new();
                for kind in KINDS {
                    out.insert((*kind).into(), json!(self.next_list(kind)?));
                }
                Ok(Value::Object(out))
            }
            "next_get" => Ok(json!(
                self.next_get::<Value>(field(&p, "kind")?, field(&p, "id")?)?
            )),
            "next_task_occurrence" => Ok(json!(self.scoped_task(field(&p, "id")?)?)),
            "next_save" => {
                let kind = field(&p, "kind")?;
                let id = field(&p["value"], "id")?;
                let rev = p["revision"]
                    .as_i64()
                    .context("Expected revision is required")?;
                let _guard = self
                    .gate
                    .lock()
                    .map_err(|_| anyhow::anyhow!("Store busy"))?;
                let epoch = self.mutation_epoch()?;
                self.next_validate(kind, id, &p["value"])?;
                if kind == "label" {
                    if let Some(old) = self.store.read::<Label>(&key(kind, id))? {
                        ensure!(
                            json!(old.value.calendar_id) == p["value"]["calendar_id"],
                            "Use the sharing action to change label ownership"
                        );
                    }
                }
                self.store
                    .write_many(&[(key(kind, id), rev, p["value"].clone()), epoch])?;
                Ok(json!(self.next_get::<Value>(kind, id)?))
            }
            "next_occurrences" => {
                let calendar = field(&p, "calendar_id")?;
                let from = field(&p, "from")?;
                let to = field(&p, "to")?;
                let exceptions: Vec<OccurrenceOverride> = self
                    .next_list("occurrence")?
                    .into_iter()
                    .map(|r| decode(r.value))
                    .collect::<Result<_>>()?;
                let mut out = vec![];
                for record in self.next_list("task")? {
                    let t: Task = decode(record.value)?;
                    if t.calendar_id == calendar {
                        for o in expand(&t, from, to, &exceptions)? {
                            out.push(json!({"occurrence":o,"revision":record.revision}));
                        }
                    }
                }
                Ok(json!(out))
            }
            "next_edit_occurrence" => self.edit_occurrence(p),
            "next_share_label" => self.share_label(p),
            "next_import_preview" => self.import_preview(field(&p, "path")?),
            "next_send" => self.next_send(p).await,
            "next_context" => {
                self.next_context(field(&p, "thread_id")?, p["request"].as_str().unwrap_or(""))
            }
            "next_accept_changes" => self.accept_changes(field(&p, "id")?),
            "next_test_profile" => {
                let r = self.next_get::<ModelProfile>("profile", field(&p, "id")?)?;
                let response = self
                    .next_provider(&r.value)?
                    .generate("Reply with a short greeting.", "Hello", None)
                    .await?;
                Ok(json!({"message":"Connection works","response":response}))
            }
            _ => bail!("Unknown Next command: {action}"),
        }
    }
    fn edit_occurrence(&self, p: Value) -> Result<Value> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Store busy"))?;
        let id = field(&p, "id")?;
        let epoch = self.mutation_epoch()?;
        let original = field(&p, "original_date")?;
        let mode = field(&p, "mode")?;
        let record = self.next_get::<Task>("task", id)?;
        ensure!(
            p["revision"].as_i64() == Some(record.revision),
            "Task changed; refresh first"
        );
        let mut task: Task = decode(p["task"].clone())?;
        task.id = id.into();
        if mode == "series" && record.value.recurrence.is_some() {
            let shift = date(&task.start_date)? - date(original)?;
            let span = date(&task.end_date)? - date(&task.start_date)?;
            task.start_date = (date(&record.value.start_date)? + shift).to_string();
            task.end_date = (date(&task.start_date)? + span).to_string();
        }
        ensure!(
            task.calendar_id == record.value.calendar_id,
            "Cannot move an occurrence to another calendar"
        );
        self.next_validate("task", id, &json!(task))?;
        if record.value.recurrence.is_none() || mode == "series" {
            self.store
                .write_many(&[(key("task", id), record.revision, json!(task)), epoch])?;
        } else if mode == "occurrence" {
            ensure!(
                !expand(&record.value, original, original, &[])?
                    .iter()
                    .filter(|o| o.original_date == original)
                    .collect::<Vec<_>>()
                    .is_empty(),
                "Not an occurrence of this series"
            );
            task.recurrence = None;
            let k = key("occurrence", &format!("{id}@{original}"));
            let old = self.store.read::<Value>(&k)?;
            // Touch the series in the same transaction, making concurrent edits conflict.
            self.store.write_many(&[
                (
                    k,
                    old.map_or(0, |r| r.revision),
                    json!(OccurrenceOverride {
                        series_id: id.into(),
                        original_date: original.into(),
                        task: if task.deleted { None } else { Some(task) }
                    }),
                ),
                (key("task", id), record.revision, json!(record.value)),
                epoch,
            ])?;
        } else if mode == "following" {
            ensure!(
                original > record.value.start_date.as_str(),
                "Use Entire series for its first occurrence"
            );
            ensure!(
                expand(&record.value, original, original, &[])?
                    .iter()
                    .any(|o| o.original_date == original),
                "Not an occurrence of this series"
            );
            let mut previous = record.value.clone();
            if let Some(new_rule) = task.recurrence.as_mut() {
                let old_rule = record.value.recurrence.as_ref().unwrap();
                if let Some(total) = old_rule.count {
                    if new_rule.count == Some(total) {
                        let mut cursor = date(&record.value.start_date)?;
                        let end = date(original)? - chrono::Duration::days(1);
                        let mut dates = std::collections::BTreeSet::new();
                        while cursor <= end {
                            let to = (cursor + chrono::Duration::days(366)).min(end);
                            for o in
                                expand(&record.value, &cursor.to_string(), &to.to_string(), &[])?
                            {
                                if o.original_date.as_str() < original {
                                    dates.insert(o.original_date);
                                }
                            }
                            cursor = to + chrono::Duration::days(1);
                        }
                        new_rule.count = Some(total.saturating_sub(dates.len() as u32).max(1));
                    }
                }
            }
            let rule = previous.recurrence.as_mut().unwrap();
            rule.count = None;
            rule.until = Some((date(original)? - chrono::Duration::days(1)).to_string());
            task.id = new_id();
            validate_task(&task)?;
            let mut writes = vec![
                epoch,
                (key("task", id), record.revision, json!(previous)),
                (key("task", &task.id), 0, json!(task)),
            ];
            // Preserve occurrence-specific workspaces and completion across the split.
            for r in self.next_list("occurrence")? {
                let mut exception: OccurrenceOverride = decode(r.value)?;
                if exception.series_id == id && exception.original_date.as_str() >= original {
                    let old_key = key("occurrence", &format!("{id}@{}", exception.original_date));
                    exception.series_id = task.id.clone();
                    if let Some(t) = &mut exception.task {
                        t.id = task.id.clone();
                    }
                    writes.push((
                        old_key,
                        r.revision,
                        json!(OccurrenceOverride {
                            series_id: id.into(),
                            original_date: exception.original_date.clone(),
                            task: None
                        }),
                    ));
                    writes.push((
                        key(
                            "occurrence",
                            &format!("{}@{}", task.id, exception.original_date),
                        ),
                        0,
                        json!(exception),
                    ));
                }
            }
            for kind in ["document", "thread"] {
                for r in self.next_list(kind)? {
                    let mut value = r.value;
                    let scope = value["scope"].as_str().unwrap_or("");
                    if let Some(day) = scope.strip_prefix(&format!("task:{id}@")) {
                        if day >= original {
                            value["scope"] = json!(format!("task:{}@{day}", task.id));
                            writes.push((key(kind, field(&value, "id")?), r.revision, value));
                        }
                    }
                }
            }
            for r in self.next_list("task")? {
                let mut child: Task = decode(r.value)?;
                if child.parent_id.as_deref() == Some(id) && child.start_date.as_str() >= original {
                    child.parent_id = Some(task.id.clone());
                    writes.push((key("task", &child.id), r.revision, json!(child)));
                }
            }
            self.store.write_many(&writes)?;
        } else {
            bail!("Choose occurrence, following or series");
        }
        Ok(json!({"saved":true}))
    }
    fn share_label(&self, p: Value) -> Result<Value> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Store busy"))?;
        let id = field(&p, "id")?;
        let epoch = self.mutation_epoch()?;
        let mut label = self.next_get::<Label>("label", id)?;
        ensure!(
            p["revision"].as_i64() == Some(label.revision),
            "Label changed; refresh first"
        );
        if p["shared"] == true {
            label.value.calendar_id = None;
            self.store.write_many(&[
                (key("label", id), label.revision, json!(label.value)),
                epoch,
            ])?;
            return Ok(json!({"saved":true}));
        }
        ensure!(
            label.value.calendar_id.is_none(),
            "Label already belongs to a calendar"
        );
        let tasks = self.next_list("task")?;
        let exceptions = self.next_list("occurrence")?;
        let mut calendars: std::collections::BTreeSet<String> = tasks
            .iter()
            .filter(|t| t.value["label_id"] == id)
            .filter_map(|t| t.value["calendar_id"].as_str().map(str::to_owned))
            .collect();
        for r in &exceptions {
            if r.value["task"]["label_id"] == id {
                if let Some(c) = r.value["task"]["calendar_id"].as_str() {
                    calendars.insert(c.into());
                }
            }
        }
        let calendars = if calendars.is_empty() {
            vec![field(&p, "calendar_id")?.to_string()]
        } else {
            calendars.into_iter().collect()
        };
        let mut writes = vec![epoch];
        for (index, c) in calendars.iter().enumerate() {
            let mut copy = label.value.clone();
            copy.id = if index == 0 { id.into() } else { new_id() };
            copy.calendar_id = Some(c.clone());
            self.next_validate("label", &copy.id, &json!(copy))?;
            writes.push((
                key("label", &copy.id),
                if index == 0 { label.revision } else { 0 },
                json!(copy),
            ));
            for t in tasks
                .iter()
                .filter(|t| t.value["label_id"] == id && t.value["calendar_id"] == *c)
            {
                let mut value = t.value.clone();
                value["label_id"] = json!(copy.id);
                writes.push((key("task", field(&value, "id")?), t.revision, value));
            }
            for r in &exceptions {
                let mut value = r.value.clone();
                if value["task"]["label_id"] == id && value["task"]["calendar_id"] == *c {
                    value["task"]["label_id"] = json!(copy.id);
                    let identity = format!(
                        "{}@{}",
                        field(&value, "series_id")?,
                        field(&value, "original_date")?
                    );
                    writes.push((key("occurrence", &identity), r.revision, value));
                }
            }
            if index > 0 {
                if let Some(folder) = self
                    .store
                    .read::<Value>(&key("layout", &format!("folder-label:{id}")))?
                {
                    let mut value = folder.value;
                    let layout_id = format!("folder-label:{}", copy.id);
                    value["id"] = json!(layout_id);
                    writes.push((key("layout", &layout_id), 0, value));
                }
                for kind in ["document", "thread"] {
                    for r in self
                        .next_list(kind)?
                        .into_iter()
                        .filter(|r| r.value["scope"] == format!("label:{id}"))
                    {
                        let mut v = r.value;
                        v["id"] = json!(new_id());
                        v["scope"] = json!(format!("label:{}", copy.id));
                        writes.push((key(kind, field(&v, "id")?), 0, v));
                    }
                }
            }
        }
        self.store.write_many(&writes)?;
        Ok(json!({"saved":true}))
    }
    pub fn accept_changes(&self, id: &str) -> Result<Value> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Store busy"))?;
        let epoch = self.mutation_epoch()?;
        let mut proposal = self.next_get::<ChangeSet>("changeset", id)?;
        ensure!(!proposal.value.accepted, "Already accepted");
        let mut seen = std::collections::HashSet::new();
        let mut writes = vec![epoch];
        for c in &proposal.value.changes {
            ensure!(seen.insert((&c.kind, &c.id)), "Duplicate mutation");
            ensure!(
                ["task", "document", "label", "network"].contains(&c.kind.as_str()),
                "Unsupported AI mutation"
            );
            self.check_change_scope(&proposal.value.scope, c)?;
            let value = if c.kind == "document" {
                let mut d: Document = decode(c.value.clone())?;
                let (snapshot, text) = wordcraft::build(&d.blocks)?;
                d.document = snapshot;
                d.text = text;
                json!(d)
            } else {
                c.value.clone()
            };
            writes.push((key(&c.kind, &c.id), c.expected_revision, value));
        }
        self.validate_changes(&proposal.value.changes)?;
        proposal.value.accepted = true;
        writes.push((
            key("changeset", id),
            proposal.revision,
            json!(proposal.value),
        ));
        self.store.write_many(&writes)?;
        Ok(json!({"accepted":true}))
    }
    pub fn check_change_scope(&self, scope: &str, c: &Change) -> Result<()> {
        let (kind, id) = scope.split_once(':').context("Missing proposal scope")?;
        let allowed = match (kind, c.kind.as_str()) {
            ("network", "network") => c.id == id,
            ("calendar", "task") => c.value["calendar_id"] == id,
            ("calendar", "label") => c.value["calendar_id"] == id,
            ("task", "task") => c.id == id || c.value["parent_id"] == id,
            (_, "document") => c.value["scope"] == scope,
            ("label", "task") => c.value["label_id"] == id,
            _ => false,
        };
        ensure!(
            allowed,
            "Proposed change is outside this conversation's destination"
        );
        if c.expected_revision > 0 {
            let old = self.next_get::<Value>(&c.kind, &c.id)?;
            ensure!(
                old.revision == c.expected_revision,
                "Proposal is stale; request a new one"
            );
            if c.kind == "task" {
                ensure!(
                    old.value["calendar_id"] == c.value["calendar_id"],
                    "AI cannot move tasks between calendars"
                );
            }
        }
        Ok(())
    }
    /// Validate the complete proposed state, including new labels/parents in the same transaction.
    pub fn validate_changes(&self, changes: &[Change]) -> Result<()> {
        let mut tasks: std::collections::HashMap<String, Task> = self
            .next_list("task")?
            .into_iter()
            .map(|r| {
                let t: Task = decode(r.value)?;
                Ok((t.id.clone(), t))
            })
            .collect::<Result<_>>()?;
        let mut labels: std::collections::HashMap<String, Label> = self
            .next_list("label")?
            .into_iter()
            .map(|r| {
                let l: Label = decode(r.value)?;
                Ok((l.id.clone(), l))
            })
            .collect::<Result<_>>()?;
        for c in changes {
            ensure!(
                c.expected_revision >= 0 && c.value["id"] == c.id,
                "Invalid identity or revision"
            );
            if c.kind == "task" {
                for field in [
                    "id",
                    "calendar_id",
                    "title",
                    "kind",
                    "start_date",
                    "end_date",
                    "start_time",
                    "end_time",
                    "timezone",
                    "label_id",
                    "parent_id",
                    "color",
                    "description",
                    "completed",
                    "steps",
                    "target",
                    "progress",
                    "unit",
                    "recurrence",
                    "deleted",
                ] {
                    ensure!(
                        c.value.get(field).is_some(),
                        "Task proposal is missing {field}"
                    );
                }
            }
            match c.kind.as_str() {
                "task" => {
                    let t: Task = decode(c.value.clone())?;
                    validate_task(&t)?;
                    self.next_get::<Calendar>("calendar", &t.calendar_id)?;
                    tasks.insert(t.id.clone(), t);
                }
                "label" => {
                    self.next_validate(&c.kind, &c.id, &c.value)?;
                    labels.insert(c.id.clone(), decode(c.value.clone())?);
                }
                "network" => {
                    let n: consilium_workflow::NetworkDefinition = decode(c.value.clone())?;
                    consilium_workflow::compile(&n, c.expected_revision + 1)?;
                }
                "document" => {
                    self.next_validate(&c.kind, &c.id, &c.value)?;
                    ensure!(
                        c.value["document"].as_str().unwrap_or("").is_empty(),
                        "AI must use structured document blocks, not editor snapshots"
                    );
                }
                _ => bail!("Unsupported change type"),
            }
        }
        for c in changes.iter().filter(|c| c.kind == "task") {
            let t = &tasks[&c.id];
            if let Some(id) = &t.label_id {
                let l = labels.get(id).context("Unknown label")?;
                ensure!(
                    l.calendar_id.is_none() || l.calendar_id.as_deref() == Some(&t.calendar_id),
                    "Label belongs to another calendar"
                );
            }
            let mut cursor = t.parent_id.clone();
            let mut seen = std::collections::HashSet::from([t.id.clone()]);
            while let Some(id) = cursor {
                ensure!(seen.insert(id.clone()), "Child tasks cannot form a cycle");
                let parent = tasks.get(&id).context("Unknown parent task")?;
                ensure!(
                    parent.calendar_id == t.calendar_id && !parent.deleted,
                    "Parent belongs to another calendar or was deleted"
                );
                cursor = parent.parent_id.clone();
            }
        }
        Ok(())
    }
}
