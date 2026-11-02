//! Portable project snapshots. Only explicitly selected input bindings are packaged.
use super::*;
use std::{
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Write,
    path::{Component, Path, PathBuf},
};
const LIMIT: u64 = 64 * 1024 * 1024;
const MANIFEST: &str = "project.consi";
fn safe_relative(s: &str) -> Result<PathBuf> {
    let p = Path::new(s);
    ensure!(
        !s.is_empty()
            && !s.contains(':')
            && !s.chars().any(|c| c.is_control())
            && !s.contains('\\')
            && p.components().all(|c| matches!(c, Component::Normal(_))),
        "Invalid package asset path"
    );
    Ok(p.into())
}
fn atomic(path: &Path, bytes: &[u8]) -> Result<()> {
    let mut f =
        tempfile::NamedTempFile::new_in(path.parent().context("Choose a destination folder")?)?;
    f.write_all(bytes)?;
    f.as_file().sync_all()?;
    f.persist(path).map_err(|e| e.error)?;
    Ok(())
}
fn collect(path: &Path, relative: String, assets: &mut Vec<Value>, total: &mut u64) -> Result<()> {
    let m = fs::symlink_metadata(path).context("An input file is unavailable")?;
    ensure!(
        !m.file_type().is_symlink(),
        "Linked files/folders cannot be included in a portable project"
    );
    #[cfg(windows)]
    {
        use std::os::windows::fs::MetadataExt;
        ensure!(
            m.file_attributes() & 0x400 == 0,
            "Windows junctions cannot be included in a portable project"
        );
    }
    ensure!(
        assets.len() < 2000,
        "Project has more than 2,000 input files"
    );
    if m.is_dir() {
        // Record empty directories too.
        assets.push(json!({"relative":relative,"directory":true}));
        for e in fs::read_dir(path)? {
            let e = e?;
            let name = e
                .file_name()
                .into_string()
                .map_err(|_| anyhow::anyhow!("Unsupported filename"))?;
            collect(&e.path(), format!("{relative}/{name}"), assets, total)?;
        }
    } else {
        ensure!(m.is_file(), "Only ordinary input files can be packaged");
        *total += m.len();
        ensure!(
            *total <= LIMIT,
            "Included inputs exceed 64 MB; export without inputs instead"
        );
        let bytes = fs::read(path)?;
        assets.push(json!({"relative":relative,"bytes":bytes}));
    }
    Ok(())
}
fn nodes_mut(value: &mut Value, f: &mut impl FnMut(&mut Value) -> Result<()>) -> Result<()> {
    if let Some(nodes) = value["nodes"].as_array_mut() {
        for n in nodes {
            f(n)?;
            if n["kind"] == "loop" {
                nodes_mut(&mut n["config"]["body"], f)?;
            }
        }
    }
    Ok(())
}
impl Engine {
    fn project_build(&self, kind: &str, id: &str, inputs: bool) -> Result<Value> {
        ensure!(
            ["calendar", "network"].contains(&kind),
            "Choose a calendar or network"
        );
        let mut records = BTreeMap::<String, Value>::new();
        let mut pending = vec![(kind.to_string(), id.to_string())];
        let mut bindings = BTreeMap::<String, Value>::new();
        let mut assets = vec![];
        let mut total = 0;
        while let Some((kind, id)) = pending.pop() {
            let identity = format!("{kind}:{id}");
            if records.contains_key(&identity) {
                continue;
            }
            let mut value = self.next_get::<Value>(&kind, &id)?.value;
            if kind == "network" {
                nodes_mut(&mut value, &mut |n| {
                    for (field, rk) in [
                        ("calendar_id", "calendar"),
                        ("document_id", "document"),
                        ("network_id", "network"),
                        ("addon_id", "addon"),
                    ] {
                        if let Some(id) = n["config"][field].as_str().filter(|s| !s.is_empty()) {
                            pending.push((rk.into(), id.into()));
                        }
                    }
                    // Linked programs are part of the algorithm, even when data inputs are omitted.
                    if let Some(id) = n["config"]["script_binding"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                    {
                        if let Ok(record) = self.next_get::<LocalBinding>("binding", id) {
                            ensure!(
                                fs::metadata(&record.value.path)?.len() <= 100_000,
                                "Program source exceeds 100 KB"
                            );
                            n["config"]["source"] = json!(fs::read_to_string(&record.value.path)?);
                            n["config"]
                                .as_object_mut()
                                .unwrap()
                                .remove("script_binding");
                        }
                    }
                    for field in ["binding_id", "script_binding", "executable_binding"] {
                        if let Some(id) = n["config"][field].as_str().filter(|s| !s.is_empty()) {
                            if !bindings.contains_key(id) {
                                let Ok(record) = self.next_get::<LocalBinding>("binding", id)
                                else {
                                    bindings.insert(id.into(), json!({"id":id,"name":"Unbound resource","kind":"file","writable":false}));
                                    continue;
                                };
                                let b = record.value;
                                let include = !b.writable
                                    && b.kind != "executable"
                                    && (inputs || field == "script_binding");
                                let name = Path::new(&b.path)
                                    .file_name()
                                    .and_then(|s| s.to_str())
                                    .unwrap_or("input");
                                let relative = format!("assets/{}/{name}", consilium_domain::id());
                                let mut v = json!({"id":id,"name":b.name,"kind":b.kind,"writable":b.writable});
                                if include {
                                    collect(
                                        Path::new(&b.path),
                                        relative.clone(),
                                        &mut assets,
                                        &mut total,
                                    )?;
                                    v["relative"] = json!(relative);
                                }
                                bindings.insert(id.into(), v);
                            }
                        }
                    }
                    if n["kind"] == "input" && !inputs {
                        n["config"].as_object_mut().map(|c| c.remove("value"));
                    }
                    Ok(())
                })?;
            }
            records.insert(identity.clone(), json!({"kind":kind,"id":id,"value":value}));
            if ["calendar", "network"].contains(&kind.as_str()) {
                for board in self.next_list("annotation")? {
                    if board.value["owner_kind"] == kind && board.value["owner_id"] == id {
                        pending.push(("annotation".into(), field(&board.value, "id")?.into()));
                    }
                }
            }
            if kind == "calendar" {
                for r in self.next_list("task")? {
                    if r.value["calendar_id"] == id {
                        pending.push((
                            "task".into(),
                            r.value["id"].as_str().context("Task ID missing")?.into(),
                        ));
                    }
                }
                for r in self.next_list("label")? {
                    if r.value["calendar_id"] == id {
                        pending.push((
                            "label".into(),
                            r.value["id"].as_str().context("Label ID missing")?.into(),
                        ));
                    }
                }
            }
            if kind == "task" {
                if let Some(label) = records[&identity]["value"]["label_id"].as_str() {
                    pending.push(("label".into(), label.into()));
                }
                for r in self.next_list("occurrence")? {
                    if r.value["series_id"] == id {
                        pending.push((
                            "occurrence".into(),
                            format!("{}@{}", id, field(&r.value, "original_date")?),
                        ));
                    }
                }
            }
            for r in self.next_list("document")? {
                if r.value["scope"] == identity
                    || (kind == "task"
                        && r.value["scope"]
                            .as_str()
                            .is_some_and(|s| s.starts_with(&format!("{identity}@"))))
                {
                    pending.push((
                        "document".into(),
                        r.value["id"]
                            .as_str()
                            .context("Document ID missing")?
                            .into(),
                    ));
                }
            }
        }
        Ok(
            json!({"format":"consilium-project","version":1,"root":{"kind":kind,"id":id},"includes_inputs":inputs,"records":records.into_values().collect::<Vec<_>>(),"bindings":bindings.into_values().collect::<Vec<_>>(),"assets":assets}),
        )
    }
    pub fn project_action(&self, action: &str, p: Value) -> Result<Value> {
        match action {
            "next_project_status" => {
                let k = format!("project-{}-{}", field(&p, "kind")?, field(&p, "id")?);
                Ok(
                    json!({"location": self.store.read::<Value>(&key("layout",&k))?.map(|r|r.value), "vault":self.store.root}),
                )
            }
            "next_project_write" => {
                let kind = field(&p, "kind")?;
                let id = field(&p, "id")?;
                let layout_id = format!("project-{kind}-{id}");
                let old = self.store.read::<Value>(&key("layout", &layout_id))?;
                let destination = p["path"]
                    .as_str()
                    .map(str::to_owned)
                    .or_else(|| {
                        old.as_ref()
                            .and_then(|r| r.value["path"].as_str().map(str::to_owned))
                    })
                    .context("Choose a save location")?;
                let path = PathBuf::from(&destination);
                ensure!(path.is_absolute(), "Choose an absolute destination");
                let mode = p["mode"].as_str().unwrap_or("file");
                ensure!(["file", "folder"].contains(&mode), "Unknown export format");
                let mut package =
                    self.project_build(kind, id, p["inputs"].as_bool().unwrap_or(true))?;
                let target = if mode == "folder" {
                    path.join(MANIFEST)
                } else {
                    path.clone()
                };
                if p["path"].is_null() {
                    if let Some(old) = &old {
                        let current = fs::read(&target)
                            .context("Saved project moved or deleted; use Save as")?;
                        ensure!(old.value["digest"] == consilium_workflow::digest(&current)?, "Project changed outside Consilium. Use Save as to preserve both copies.");
                    }
                }
                if mode == "folder" {
                    // Export into a new directory, never overwrite arbitrary existing contents.
                    ensure!(!path.exists(), "Choose a new project folder name");
                    let parent = path.parent().context("Invalid project destination")?;
                    let staging = tempfile::tempdir_in(parent)?;
                    for asset in package["assets"].as_array_mut().context("Assets missing")? {
                        let out = staging
                            .path()
                            .join(safe_relative(field(asset, "relative")?)?);
                        if asset["directory"] == true {
                            fs::create_dir_all(&out)?;
                        } else {
                            fs::create_dir_all(out.parent().context("Invalid asset")?)?;
                            let bytes: Vec<u8> = decode(asset["bytes"].take())?;
                            fs::write(&out, bytes)?;
                            asset.as_object_mut().unwrap().remove("bytes");
                        }
                    }
                    fs::write(
                        staging.path().join(MANIFEST),
                        serde_json::to_vec_pretty(&package)?,
                    )?;
                    fs::rename(staging.path(), &path)?;
                } else {
                    atomic(&target, &serde_json::to_vec(&package)?)?;
                }
                if p["remember"] == true {
                    self.store.write(&key("layout", &layout_id), old.as_ref().map_or(0, |r| r.revision), &json!({"id":layout_id,"path":target,"digest":consilium_workflow::digest(&fs::read(&target)?)?,"saved_at":consilium_domain::now()}))?;
                }
                Ok(json!({"saved":true,"path":target}))
            }
            "next_project_read" => self.project_read(Path::new(field(&p, "path")?)),
            _ => bail!("Unknown project action"),
        }
    }
    fn project_read(&self, path: &Path) -> Result<Value> {
        ensure!(
            fs::metadata(path)?.len() <= LIMIT * 5,
            "Project file exceeds 320 MB"
        );
        let mut package: Value = serde_json::from_slice(&fs::read(path)?)?;
        ensure!(
            package["format"] == "consilium-project" && package["version"] == 1,
            "Unsupported Consilium project"
        );
        let assets = package["assets"].as_array_mut().context("Assets missing")?;
        ensure!(assets.len() <= 2000, "Too many assets");
        let stage = tempfile::tempdir_in(&self.store.root)?;
        let mut total = 0;
        let mut seen = BTreeSet::new();
        for asset in assets {
            let relative = safe_relative(field(asset, "relative")?)?;
            ensure!(
                relative.starts_with("assets") && seen.insert(relative.clone()),
                "Invalid or duplicate asset"
            );
            let out = stage.path().join(&relative);
            if asset["directory"] == true {
                fs::create_dir_all(&out)?;
                continue;
            }
            let bytes: Vec<u8> = if asset.get("bytes").is_some() {
                decode(asset["bytes"].clone())?
            } else {
                let root = path.parent().context("Invalid package")?.canonicalize()?;
                let source = root.join(&relative).canonicalize()?;
                ensure!(
                    source.starts_with(&root) && fs::metadata(&source)?.len() <= LIMIT,
                    "Asset escapes package or is too large"
                );
                fs::read(source)?
            };
            total += bytes.len() as u64;
            ensure!(total <= LIMIT, "Inputs exceed 64 MB");
            fs::create_dir_all(out.parent().context("Invalid asset")?)?;
            fs::write(out, bytes)?;
        }
        let records = package["records"].as_array().context("Records missing")?;
        ensure!(records.len() <= 20000, "Too many project records");
        let mut ids = BTreeMap::new();
        for r in records {
            ensure!(
                [
                    "network",
                    "calendar",
                    "task",
                    "label",
                    "document",
                    "occurrence",
                    "addon",
                    "annotation"
                ]
                .contains(&field(r, "kind")?),
                "Unsupported project record"
            );
            let old = field(r, "id")?;
            ensure!(
                ids.insert(old.to_owned(), consilium_domain::id()).is_none(),
                "Duplicate project identity"
            );
        }
        for r in records.iter().filter(|r| r["kind"] == "occurrence") {
            let series = ids
                .get(field(&r["value"], "series_id")?)
                .context("Occurrence series missing")?;
            ids.insert(
                field(r, "id")?.into(),
                format!("{series}@{}", field(&r["value"], "original_date")?),
            );
        }
        let destination = self
            .store
            .root
            .join("project-inputs")
            .join(consilium_domain::id());
        let mut writes = vec![];
        let bindings = package["bindings"].as_array().context("Bindings missing")?;
        for b in bindings {
            let old = field(b, "id")?;
            let new = consilium_domain::id();
            if let Some(relative) = b["relative"].as_str() {
                let relative = safe_relative(relative)?;
                ensure!(stage.path().join(&relative).exists(), "Bound asset missing");
                ensure!(
                    b["writable"] == false && ["file", "folder"].contains(&field(b, "kind")?),
                    "Packaged inputs must be read-only"
                );
                let value = json!({"id":new,"name":b["name"],"kind":b["kind"],"writable":false,"path":destination.join(relative)});
                writes.push((key("binding", &new), 0, value));
            }
            // Missing runtimes/output destinations stay unbound, never reuse another project's IDs.
            ensure!(
                ids.insert(old.into(), new).is_none(),
                "Duplicate binding identity"
            );
        }
        fn remap(v: &mut Value, ids: &BTreeMap<String, String>, field: &str) {
            match v {
                Value::Object(o) => {
                    for (k, v) in o {
                        remap(v, ids, k);
                    }
                }
                Value::Array(a) => {
                    for v in a {
                        remap(v, ids, field);
                    }
                }
                Value::String(s)
                    if [
                        "id",
                        "calendar_id",
                        "label_id",
                        "parent_id",
                        "series_id",
                        "document_id",
                        "binding_id",
                        "script_binding",
                        "executable_binding",
                        "network_id",
                        "addon_id",
                        "owner_id",
                    ]
                    .contains(&field) =>
                {
                    if let Some(new) = ids.get(s) {
                        *s = new.clone();
                    } else if field != "id" && !s.is_empty() {
                        // Never resolve an omitted resource against an unrelated local record.
                        *s = format!("unbound-{}", consilium_domain::id());
                    }
                }
                Value::String(s) if field == "scope" => {
                    if let Some((k, id)) = s.split_once(':') {
                        if let Some(new) = ids.get(id) {
                            *s = format!("{k}:{new}");
                        } else if let Some((series, date)) = id.split_once('@') {
                            if let Some(new) = ids.get(series) {
                                *s = format!("{k}:{new}@{date}");
                            } else {
                                s.clear();
                            }
                        } else {
                            s.clear();
                        }
                    }
                }
                Value::String(s) if field == "profile_id" => {
                    s.clear();
                }
                _ => {}
            }
        }
        let root_kind = field(&package["root"], "kind")?;
        ensure!(
            ["calendar", "network"].contains(&root_kind),
            "Invalid project root"
        );
        let root_id = ids
            .get(field(&package["root"], "id")?)
            .context("Root record missing")?
            .clone();
        let mut drawing_owners = BTreeSet::new();
        for r in records {
            let kind = field(r, "kind")?;
            let mut v = r["value"].clone();
            remap(&mut v, &ids, "");
            // Node IDs and edge endpoints are graph-local and remain unchanged by record remapping.
            if kind == "label"
                && v["calendar_id"]
                    .as_str()
                    .is_some_and(|id| !ids.values().any(|new| new == id))
            {
                v["calendar_id"] = Value::Null;
            }
            if kind == "network" {
                // A graph owns node IDs; only record references are remapped.
                fn restore_ids(original: &Value, copy: &mut Value) {
                    if let (Some(a), Some(b)) =
                        (original["nodes"].as_array(), copy["nodes"].as_array_mut())
                    {
                        for (old, new) in a.iter().zip(b) {
                            new["id"] = old["id"].clone();
                            if old["kind"] == "loop" {
                                restore_ids(&old["config"]["body"], &mut new["config"]["body"]);
                            }
                        }
                    }
                }
                restore_ids(&r["value"], &mut v);
                nodes_mut(&mut v, &mut |n| {
                    if n["kind"] == "document_write"
                        && n["config"]["document_id"]
                            .as_str()
                            .is_some_and(|s| !s.is_empty())
                    {
                        n["config"]["expected_revision"] = json!(1);
                    }
                    Ok(())
                })?;
                let _: consilium_workflow::NetworkDefinition = decode(v.clone())?;
            }
            if kind == "calendar" {
                let _: Calendar = decode(v.clone())?;
            }
            if kind == "task" {
                let t: Task = decode(v.clone())?;
                validate_task(&t)?;
            }
            if kind == "document" {
                let _: Document = decode(v.clone())?;
            }
            if kind == "addon" {
                v["enabled"] = json!(false);
                v["manifest"]["id"] = v["id"].clone();
                let addon: super::addons::ProgramAddon = decode(v["manifest"].clone())?;
                addon.validate()?;
                v["digest"] = json!(consilium_workflow::digest(&addon)?);
            }
            if kind == "annotation" {
                if let (Some(original), Some(copy)) =
                    (r["value"]["marks"].as_array(), v["marks"].as_array_mut())
                {
                    for (old, new) in original.iter().zip(copy) {
                        new["id"] = old["id"].clone();
                    }
                }
                let board: consilium_domain::annotations::AnnotationBoard = decode(v.clone())?;
                board.validate()?;
                ensure!(
                    drawing_owners.insert((
                        board.owner_kind.clone(),
                        board.owner_id.clone(),
                        board.view_key.clone()
                    )),
                    "Duplicate drawing view in project"
                );
                ensure!(
                    records.iter().any(|r| r["kind"] == board.owner_kind
                        && ids.get(r["id"].as_str().unwrap_or("")) == Some(&board.owner_id)),
                    "Drawing owner missing from project"
                );
            }
            if kind == "occurrence" {
                let _: OccurrenceOverride = decode(v.clone())?;
            }
            let id = ids
                .get(field(r, "id")?)
                .context("Record identity missing")?;
            if kind != "occurrence" {
                ensure!(v["id"] == *id, "Record identity mismatch");
            }
            writes.push((key(kind, id), 0, v));
        }
        ensure!(
            writes
                .iter()
                .any(|(k, _, _)| k == &key(root_kind, &root_id)),
            "Root type mismatch"
        );
        fs::create_dir_all(destination.parent().unwrap())?;
        fs::rename(stage.path(), &destination)?;
        // Failed imports may leave an unreferenced recovery folder, but never partial records.
        writes.push(self.mutation_epoch()?);
        self.store.write_many(&writes)?;
        Ok(json!({"kind":root_kind,"id":root_id,"imported":true}))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use consilium_storage::Store;
    fn fixture() -> (tempfile::TempDir, Engine) {
        let dir = tempfile::tempdir().unwrap();
        let e = Engine::new(Store::new(dir.path().join("vault")).unwrap());
        let file = dir.path().join("reading.txt");
        fs::write(&file, b"private reading").unwrap();
        e.store
            .write(
                &key("binding", "input"),
                0,
                &json!({"id":"input","name":"Reading","kind":"file","path":file,"writable":false}),
            )
            .unwrap();
        let script = dir.path().join("program.js");
        fs::write(&script, "console.log('{}')").unwrap();
        e.store.write(&key("binding","script"),0,&json!({"id":"script","name":"Program","kind":"file","path":script,"writable":false})).unwrap();
        e.store.write(&key("network","network"),0,&json!({"schema_version":1,"id":"network","name":"Portable","nodes":[
            {"id":"read","kind":"file_read","title":"Read","config":{"binding_id":"input"},"position":{"x":0,"y":0}},
            {"id":"process","kind":"process","title":"Program","config":{"script_binding":"script","executable_binding":"unbound","extension":"js"},"position":{"x":200,"y":0}}
        ],"edges":[],"limits":{"concurrency":2,"iterations":5,"model_calls":20,"timeout_seconds":1800}})).unwrap();
        (dir, e)
    }
    #[test]
    fn addon_project_import_preserves_source_but_requires_new_trust() {
        let (d, e) = fixture();
        let sample = e.addon_action("next_addon_samples", json!({})).unwrap()[0].clone();
        e.addon_action(
            "next_addon_install",
            json!({"approved":true,"manifest":sample["manifest"],"digest":sample["digest"]}),
        )
        .unwrap();
        let graph = e
            .addon_action("next_addon_example", json!({"id":sample["manifest"]["id"]}))
            .unwrap();
        let out = d.path().join("addon.consilium");
        e.project_action(
            "next_project_write",
            json!({"kind":"network","id":graph["value"]["id"],"path":out}),
        )
        .unwrap();
        let imported = e.project_read(&out).unwrap();
        let network = e
            .next_get::<Value>("network", imported["id"].as_str().unwrap())
            .unwrap();
        let id = network.value["nodes"][1]["config"]["addon_id"]
            .as_str()
            .unwrap();
        let addon = e.next_get::<Value>("addon", id).unwrap().value;
        assert_ne!(json!(id), sample["manifest"]["id"]);
        assert_eq!(addon["enabled"], false);
        assert_eq!(addon["manifest"]["source"], sample["manifest"]["source"]);
        let manifest: super::super::addons::ProgramAddon =
            decode(addon["manifest"].clone()).unwrap();
        assert_eq!(
            addon["digest"],
            consilium_workflow::digest(&manifest).unwrap()
        );
        assert!(e.next_list("run").unwrap().is_empty());
    }
    #[test]
    fn single_file_roundtrip_restores_inputs_without_reusing_device_bindings() {
        let (d, e) = fixture();
        let out = d.path().join("study.consilium");
        e.project_action(
            "next_project_write",
            json!({"kind":"network","id":"network","path":out,"remember":true}),
        )
        .unwrap();
        let text = fs::read_to_string(&out).unwrap();
        assert!(!text.contains(&d.path().to_string_lossy().replace('\\', "\\\\")));
        let imported = e.project_read(&out).unwrap();
        let n = e
            .next_get::<Value>("network", imported["id"].as_str().unwrap())
            .unwrap();
        let binding_id = n.value["nodes"][0]["config"]["binding_id"]
            .as_str()
            .unwrap();
        assert_ne!(binding_id, "input");
        let b = e
            .next_get::<LocalBinding>("binding", binding_id)
            .unwrap()
            .value;
        assert_eq!(fs::read_to_string(b.path).unwrap(), "private reading");
        assert_eq!(n.value["nodes"][1]["config"]["source"], "console.log('{}')");
        assert!(e
            .next_get::<Value>(
                "binding",
                n.value["nodes"][1]["config"]["executable_binding"]
                    .as_str()
                    .unwrap()
            )
            .is_err());
        assert!(e.next_list("run").unwrap().is_empty());
    }
    #[test]
    fn folders_preserve_inputs_or_omit_them_but_keep_programs() {
        let (d, e) = fixture();
        for inputs in [false, true] {
            let out = d.path().join(format!("folder-{inputs}"));
            e.project_action(
                "next_project_write",
                json!({"kind":"network","id":"network","path":out,"mode":"folder","inputs":inputs}),
            )
            .unwrap();
            let p: Value = serde_json::from_slice(&fs::read(out.join(MANIFEST)).unwrap()).unwrap();
            assert_eq!(!p["assets"].as_array().unwrap().is_empty(), inputs);
            assert!(p.to_string().contains("console.log"));
            assert!(!p.to_string().contains("private reading"));
            e.project_read(&out.join(MANIFEST)).unwrap();
            assert!(e
                .project_action(
                    "next_project_write",
                    json!({"kind":"network","id":"network","path":out,"mode":"folder"})
                )
                .is_err());
        }
    }
    #[test]
    fn calendar_occurrences_and_scoped_documents_survive_copy() {
        let (d, e) = fixture();
        e.store
            .write(
                &key("calendar", "calendar"),
                0,
                &json!({"id":"calendar","name":"Study","timezone":"Asia/Qatar"}),
            )
            .unwrap();
        let t = Task {
            id: "task".into(),
            calendar_id: "calendar".into(),
            title: "Words".into(),
            start_date: "2026-10-23".into(),
            end_date: "2026-10-23".into(),
            ..Default::default()
        };
        e.store.write(&key("task", "task"), 0, &t).unwrap();
        e.store
            .write(
                &key("occurrence", "task@2026-10-23"),
                0,
                &json!({"series_id":"task","original_date":"2026-10-23","task":null}),
            )
            .unwrap();
        e.store
            .write(
                &key("document", "doc"),
                0,
                &Document {
                    id: "doc".into(),
                    scope: "task:task@2026-10-23".into(),
                    text: "My notes".into(),
                    ..Default::default()
                },
            )
            .unwrap();
        let out = d.path().join("calendar.consilium");
        e.project_action(
            "next_project_write",
            json!({"kind":"calendar","id":"calendar","path":out}),
        )
        .unwrap();
        let imported = e.project_read(&out).unwrap();
        let t = e
            .next_list("task")
            .unwrap()
            .into_iter()
            .find(|r| r.value["calendar_id"] == imported["id"])
            .unwrap();
        let id = t.value["id"].as_str().unwrap();
        assert!(e
            .next_get::<OccurrenceOverride>("occurrence", &format!("{id}@2026-10-23"))
            .is_ok());
        assert!(e
            .next_list("document")
            .unwrap()
            .iter()
            .any(|r| r.value["scope"] == format!("task:{id}@2026-10-23")
                && r.value["text"] == "My notes"));
    }
    #[test]
    fn save_conflicts_preserve_external_edits() {
        let (d, e) = fixture();
        let out = d.path().join("saved.consilium");
        e.project_action(
            "next_project_write",
            json!({"kind":"network","id":"network","path":out,"remember":true}),
        )
        .unwrap();
        e.project_action(
            "next_project_write",
            json!({"kind":"network","id":"network","remember":true}),
        )
        .unwrap();
        fs::write(&out, "external change").unwrap();
        assert!(e
            .project_action(
                "next_project_write",
                json!({"kind":"network","id":"network","remember":true})
            )
            .is_err());
        assert_eq!(fs::read_to_string(out).unwrap(), "external change");
    }
    #[test]
    fn malicious_asset_paths_and_partial_imports_are_rejected() {
        let (d, e) = fixture();
        let before = e.next_list("network").unwrap().len();
        for name in [
            "../outside",
            "assets/../../outside",
            "C:/outside",
            "assets/file:stream",
        ] {
            let mut p = e.project_build("network", "network", false).unwrap();
            p["assets"] = json!([{"relative":name,"bytes":[65]}]);
            let out = d.path().join("bad.consilium");
            fs::write(&out, serde_json::to_vec(&p).unwrap()).unwrap();
            assert!(e.project_read(&out).is_err(), "{name}");
            assert_eq!(e.next_list("network").unwrap().len(), before);
        }
    }
}
