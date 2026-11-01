use super::*;
use std::path::Path;
const MAX_BYTES: u64 = 1_000_000;
const MAX_CHARS: usize = 16_000;
impl Engine {
    pub fn attachment_action(&self, action: &str, p: Value) -> Result<Value> {
        match action {
            "next_attachment_preview" => {
                let a = self
                    .next_get::<Value>("attachment", field(&p, "id")?)?
                    .value;
                Ok(
                    json!({"name":a["name"],"text":a["text"],"content_status":a["content_status"],"digest":a["digest"]}),
                )
            }
            "next_attachment_add" => {
                let path = Path::new(field(&p, "path")?);
                ensure!(
                    path.is_file() && std::fs::metadata(path)?.len() <= MAX_BYTES,
                    "Choose a text file up to 1 MB"
                );
                let bytes = std::fs::read(path)?;
                ensure!(
                    bytes.len() <= MAX_BYTES as usize,
                    "File grew beyond 1 MB; choose it again"
                );
                let text = std::str::from_utf8(&bytes)
                    .context("Only UTF-8 text, JSON, CSV and source files can be attached")?;
                ensure!(
                    !text.contains('\0'),
                    "Binary files cannot be attached as text"
                );
                let id = new_id();
                let name = path
                    .file_name()
                    .context("File name missing")?
                    .to_string_lossy()
                    .to_string();
                let folder = self.store.root.join("attachments").join(&id);
                std::fs::create_dir_all(&folder)?;
                let snapshot = folder.join(&name);
                std::fs::write(&snapshot, &bytes)?;
                let status = if text.chars().count() > MAX_CHARS {
                    "partial"
                } else {
                    "full"
                };
                let value = json!({"id":id,"name":name,"digest":consilium_workflow::digest(&bytes)?,"bytes":bytes.len(),"content_status":status,"text":text.chars().take(MAX_CHARS).collect::<String>(),"binding_id":id,"format":if serde_json::from_str::<Value>(text).is_ok(){"json"}else{"text"}});
                self.store.write_many(&[
                    (key("attachment", &id), 0, value.clone()),
                    (
                        key("binding", &id),
                        0,
                        json!({"id":id,"name":name,"kind":"file","path":snapshot,"writable":false}),
                    ),
                ])?;
                let mut preview = value;
                preview.as_object_mut().unwrap().remove("text");
                Ok(preview)
            }
            _ => bail!("Unknown attachment action"),
        }
    }
    pub(super) fn attachment_context(&self, selected: &Value) -> Result<Vec<Value>> {
        let items = selected.as_array().cloned().unwrap_or_default();
        ensure!(items.len() <= 6, "Attach at most six files per message");
        let mut seen = std::collections::BTreeSet::new();
        let mut out = vec![];
        for item in items {
            let id = field(&item, "id")?;
            ensure!(seen.insert(id.to_owned()), "Duplicate attachment");
            let mut a = self.next_get::<Value>("attachment", id)?.value;
            ensure!(
                item["digest"] == a["digest"],
                "Attachment changed; select it again"
            );
            let binding = self.next_get::<LocalBinding>("binding", id)?.value;
            ensure!(
                std::fs::metadata(&binding.path)?.len() <= MAX_BYTES,
                "Attachment snapshot grew; attach again"
            );
            let snapshot = std::fs::read(&binding.path)
                .context("Attachment snapshot is unavailable; attach again")?;
            ensure!(
                snapshot.len() <= MAX_BYTES as usize,
                "Attachment snapshot grew; attach again"
            );
            ensure!(
                consilium_workflow::digest(&snapshot)? == a["digest"],
                "Attachment snapshot changed; attach again"
            );
            let sharing = item["share_content"] == true;
            a["workflow_input"] = json!(item["workflow_input"] == true);
            a["shared_with_model"] = json!(sharing);
            if !sharing {
                a.as_object_mut().unwrap().remove("text");
                a["content_status"] = json!("not_shared");
            }
            if item["workflow_input"] != true {
                a.as_object_mut().unwrap().remove("binding_id");
            }
            out.push(a);
        }
        Ok(out)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn attachment_consent_and_snapshot_are_enforced() {
        let d = tempfile::tempdir().unwrap();
        let e = Engine::new(consilium_storage::Store::new(d.path().join("vault")).unwrap());
        let path = d.path().join("private.json");
        std::fs::write(&path, r#"{"secret":"synthetic"}"#).unwrap();
        let a = e
            .attachment_action("next_attachment_add", json!({"path":path}))
            .unwrap();
        assert!(a.get("text").is_none());
        let mut choice =
            json!({"id":a["id"],"digest":a["digest"],"workflow_input":true,"share_content":false});
        let hidden = e.attachment_context(&json!([choice])).unwrap();
        assert!(hidden[0].get("text").is_none());
        assert_eq!(hidden[0]["content_status"], "not_shared");
        choice["share_content"] = json!(true);
        assert!(
            e.attachment_context(&json!([choice.clone()])).unwrap()[0]["text"]
                .as_str()
                .unwrap()
                .contains("synthetic")
        );
        std::fs::write(&path, "external edit").unwrap();
        assert!(
            e.attachment_context(&json!([choice.clone()])).unwrap()[0]["text"]
                .as_str()
                .unwrap()
                .contains("synthetic")
        );
        let b = e
            .next_get::<LocalBinding>("binding", a["id"].as_str().unwrap())
            .unwrap();
        std::fs::write(b.value.path, "tampered snapshot").unwrap();
        assert!(e.attachment_context(&json!([choice])).is_err());
    }
}
