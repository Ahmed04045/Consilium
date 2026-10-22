use super::*;
use std::collections::HashMap;
impl Engine {
    pub fn import_preview(&self, path: &str) -> Result<Value> {
        let _guard = self
            .gate
            .lock()
            .map_err(|_| anyhow::anyhow!("Store busy"))?;
        ensure!(
            self.store
                .read::<Value>("next:migration:preview")?
                .is_none(),
            "Preview was already imported"
        );
        ensure!(
            self.next_list("calendar")?.is_empty(),
            "Import into an empty Next vault to avoid mixing workspaces"
        );
        self.store.backup()?;
        let source = self.store.import_snapshot(std::path::Path::new(path))?;
        let records: HashMap<String, Value> = source.into_iter().collect();
        let workspace = records
            .get("calendar_workspace")
            .context("No preview calendars found")?;
        let timezone = workspace["timezone"].as_str().unwrap_or("UTC");
        let mut writes = vec![];
        // The complete original snapshot remains recoverable, including orphaned workspaces.
        writes.push(("next:migration:archive".into(), 0, json!(records)));
        let mut labels = 0;
        let mut tasks = 0;
        for c in workspace["calendars"]
            .as_array()
            .context("Invalid preview calendar data")?
        {
            let calendar = Calendar {
                id: field(c, "id")?.into(),
                name: field(c, "name")?.into(),
                timezone: timezone.into(),
            };
            writes.push((key("calendar", &calendar.id), 0, json!(calendar)));
            let mut label_ids = HashMap::<String, String>::new();
            for t in c["tasks"].as_array().context("Invalid preview tasks")? {
                let label = t["label"].as_str().unwrap_or("");
                if !label.is_empty() && !label_ids.contains_key(label) {
                    let id = new_id();
                    let color = workspace["labels"]
                        .as_array()
                        .and_then(|a| a.iter().find(|l| l["name"] == label))
                        .and_then(|l| l["color"].as_str())
                        .unwrap_or("green");
                    writes.push((
                        key("label", &id),
                        0,
                        json!(Label {
                            id: id.clone(),
                            name: label.into(),
                            color: color.into(),
                            calendar_id: Some(calendar.id.clone())
                        }),
                    ));
                    migrate_workspace(
                        &records,
                        &format!("label:{label}"),
                        &format!("label:{id}"),
                        label,
                        &mut writes,
                    )?;
                    label_ids.insert(label.into(), id);
                    labels += 1;
                }
                let start = field(t, "date")?;
                let time = t["time"].as_str().unwrap_or("");
                let minutes = t["minutes"].as_i64().unwrap_or(30);
                let (end_date, end_time) = if time.is_empty() {
                    (start.to_string(), String::new())
                } else {
                    let end = chrono::NaiveDateTime::parse_from_str(
                        &format!("{start}T{time}"),
                        "%Y-%m-%dT%H:%M",
                    )? + chrono::Duration::minutes(minutes);
                    (end.date().to_string(), end.format("%H:%M").to_string())
                };
                let task = Task {
                    id: field(t, "id")?.into(),
                    calendar_id: calendar.id.clone(),
                    title: field(t, "title")?.into(),
                    kind: if time.is_empty() {
                        TaskKind::Flexible
                    } else {
                        TaskKind::Timed
                    },
                    start_date: start.into(),
                    end_date,
                    start_time: time.into(),
                    end_time,
                    timezone: timezone.into(),
                    label_id: label_ids.get(label).cloned(),
                    color: t["color"].as_str().unwrap_or("green").into(),
                    description: t["description"].as_str().unwrap_or("").into(),
                    completed: t["completed"].as_bool().unwrap_or(false),
                    ..Default::default()
                };
                writes.push((key("task", &task.id), 0, json!(task)));
                migrate_workspace(
                    &records,
                    &format!("task:{}", task.id),
                    &format!("task:{}", task.id),
                    &task.title,
                    &mut writes,
                )?;
                tasks += 1;
            }
        }
        if let Some(context) = records.get("personal_context") {
            writes.push((
                "next:layout:context".into(),
                0,
                json!({"id":"context","text":context["text"],"history":context["history"]}),
            ));
        }
        writes.push(("next:migration:preview".into(),0,json!({"completed_at":consilium_domain::now(),"version":1,"tasks":tasks,"labels":labels})));
        self.store.write_many(&writes)?;
        Ok(json!({"tasks":tasks,"labels":labels,"archived":true}))
    }
}
fn migrate_workspace(
    records: &HashMap<String, Value>,
    old: &str,
    new: &str,
    title: &str,
    writes: &mut Vec<(String, i64, Value)>,
) -> Result<()> {
    if let Some(d) = records.get(&format!("workspace_doc:{old}")) {
        let doc = Document {
            id: new_id(),
            title: title.into(),
            scope: new.into(),
            document: d["document"].as_str().unwrap_or("").into(),
            text: d["text"].as_str().unwrap_or("").into(),
            ..Default::default()
        };
        writes.push((key("document", &doc.id), 0, json!(doc)));
    }
    if let Some(chat) = records.get(&format!("workspace_chat:{old}")) {
        let thread = Thread {
            id: new_id(),
            title: format!("{title} · imported"),
            scope: new.into(),
            messages: decode(chat.clone())?,
            ..Default::default()
        };
        writes.push((key("thread", &thread.id), 0, json!(thread)));
    }
    if let Some(folder) = records.get(&format!("workspace_folder:{old}")) {
        let id = new_id();
        writes.push((key("binding",&id),0,json!({"id":id,"name":title,"kind":"folder","path":folder["path"],"writable":false,"scope":new})));
        let layout_id = format!("folder-{new}");
        writes.push((
            key("layout", &layout_id),
            0,
            json!({"id":layout_id,"binding_id":id}),
        ));
    }
    Ok(())
}
