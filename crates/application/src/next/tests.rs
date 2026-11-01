use super::*;
use consilium_storage::Store;
fn engine() -> (tempfile::TempDir, Engine) {
    let dir = tempfile::tempdir().unwrap();
    let e = Engine::new(Store::new(dir.path().into()).unwrap());
    (dir, e)
}
async fn save(e: &Engine, kind: &str, value: Value, revision: i64) -> Result<Value> {
    e.next_action(
        "next_save",
        json!({"kind":kind,"value":value,"revision":revision}),
    )
    .await
}
fn calendar(id: &str) -> Value {
    json!({"id":id,"name":id,"timezone":"Asia/Qatar"})
}
fn task(id: &str, calendar: &str) -> Task {
    Task {
        id: id.into(),
        calendar_id: calendar.into(),
        title: "Practice".into(),
        start_date: "2026-10-22".into(),
        end_date: "2026-10-22".into(),
        ..Default::default()
    }
}
#[tokio::test]
async fn labels_are_scoped_and_unsharing_clones_workspaces() {
    let (_d, e) = engine();
    for c in ["a", "b"] {
        save(&e, "calendar", calendar(c), 0).await.unwrap();
    }
    for c in ["a", "b"] {
        save(
            &e,
            "label",
            json!(Label {
                id: format!("label-{c}"),
                name: "Language".into(),
                color: "green".into(),
                calendar_id: Some(c.into())
            }),
            0,
        )
        .await
        .unwrap();
    }
    let mut t = task("task-a", "a");
    t.label_id = Some("label-b".into());
    assert!(save(&e, "task", json!(t), 0).await.is_err());
    t.label_id = Some("label-a".into());
    save(&e, "task", json!(t), 0).await.unwrap();
    e.next_action(
        "next_share_label",
        json!({"id":"label-a","revision":1,"shared":true}),
    )
    .await
    .unwrap();
    let mut t = task("task-b", "b");
    t.label_id = Some("label-a".into());
    save(&e, "task", json!(t), 0).await.unwrap();
    let doc = Document {
        id: "doc".into(),
        scope: "label:label-a".into(),
        text: "Shared knowledge".into(),
        ..Default::default()
    };
    save(&e, "document", json!(doc), 0).await.unwrap();
    e.next_action(
        "next_share_label",
        json!({"id":"label-a","revision":2,"shared":false}),
    )
    .await
    .unwrap();
    let a = e.next_get::<Task>("task", "task-a").unwrap().value;
    let b = e.next_get::<Task>("task", "task-b").unwrap().value;
    assert_ne!(a.label_id, b.label_id);
    assert_eq!(e.next_list("document").unwrap().len(), 2);
    assert_eq!(
        e.next_get::<Label>("label", "label-b").unwrap().value.name,
        "Language"
    );
}
#[tokio::test]
async fn changes_are_atomic_and_allow_new_parent_and_label() {
    let (_d, e) = engine();
    save(&e, "calendar", calendar("a"), 0).await.unwrap();
    let label = Label {
        id: "l".into(),
        name: "History".into(),
        color: "purple".into(),
        calendar_id: Some("a".into()),
    };
    let mut parent = task("parent", "a");
    parent.label_id = Some("l".into());
    parent.kind = TaskKind::Goal;
    parent.end_date = "2026-10-28".into();
    let mut child = task("child", "a");
    child.parent_id = Some("parent".into());
    child.label_id = Some("l".into());
    let changes = vec![
        Change {
            kind: "task".into(),
            id: "child".into(),
            expected_revision: 0,
            value: json!(child),
        },
        Change {
            kind: "task".into(),
            id: "parent".into(),
            expected_revision: 0,
            value: json!(parent),
        },
        Change {
            kind: "label".into(),
            id: "l".into(),
            expected_revision: 0,
            value: json!(label),
        },
    ];
    let cs = ChangeSet {
        id: "proposal".into(),
        scope: "calendar:a".into(),
        summary: "Plan".into(),
        changes,
        accepted: false,
    };
    e.store
        .write(&key("changeset", "proposal"), 0, &cs)
        .unwrap();
    e.accept_changes("proposal").unwrap();
    assert_eq!(e.next_list("task").unwrap().len(), 2);
    let mut stale = cs;
    stale.id = "stale".into();
    stale.changes[0].value["title"] = json!("Should not write");
    e.store
        .write(&key("changeset", "stale"), 0, &stale)
        .unwrap();
    assert!(e.accept_changes("stale").is_err());
    assert_eq!(
        e.next_get::<Task>("task", "child").unwrap().value.title,
        "Practice"
    );
    assert!(
        !e.next_get::<ChangeSet>("changeset", "stale")
            .unwrap()
            .value
            .accepted
    );
}
#[tokio::test]
async fn context_routes_to_scope_and_model_without_other_calendar_data() {
    let (_d, e) = engine();
    for c in ["a", "b"] {
        save(&e, "calendar", calendar(c), 0).await.unwrap();
        save(&e, "task", json!(task(&format!("task-{c}"), c)), 0)
            .await
            .unwrap();
    }
    let p = ModelProfile {
        id: "p".into(),
        name: "Local".into(),
        provider: "ollama".into(),
        model: "test".into(),
        endpoint: "http://127.0.0.1:11434".into(),
        context_tokens: 32768,
        credential_id: None,
    };
    save(&e, "profile", json!(p), 0).await.unwrap();
    let t = Thread {
        id: "thread".into(),
        scope: "calendar:a".into(),
        profile_id: "p".into(),
        ..Default::default()
    };
    save(&e, "thread", json!(t), 0).await.unwrap();
    let c = e.next_context("thread", "What next?").unwrap().to_string();
    assert!(c.contains("task-a"));
    assert!(!c.contains("task-b"));
    let mut changed = t;
    changed.scope = "calendar:b".into();
    assert!(save(&e, "thread", json!(changed), 1).await.is_err());
}
#[tokio::test]
async fn migration_is_copy_only_and_archives_orphans() {
    let (source, old) = engine();
    let legacy_task = |id: &str| json!({"id":id,"title":"Words","date":"2026-10-22","time":"","minutes":30,"color":"green","description":"","completed":false,"label":"Language"});
    old.store.write("calendar_workspace",0,&json!({"timezone":"Asia/Qatar","labels":[{"name":"Language","color":"green"},{"name":"Unused","color":"blue"}],"calendars":[{"id":"a","name":"A","tasks":[legacy_task("ta")]},{"id":"b","name":"B","tasks":[legacy_task("tb")]}]})).unwrap();
    old.store
        .write(
            "workspace_doc:label:Language",
            0,
            &json!({"document":"","text":"Vocabulary"}),
        )
        .unwrap();
    old.store
        .write(
            "workspace_chat:label:Language",
            0,
            &json!([{ "id":"m","role":"user","content":"Practice","at":"2026-10-22T00:00:00Z"}]),
        )
        .unwrap();
    old.store
        .write(
            "workspace_folder:label:Language",
            0,
            &json!({"path":"C:\\example"}),
        )
        .unwrap();
    old.store
        .write(
            "workspace_doc:label:Orphan",
            0,
            &json!({"text":"Recover me"}),
        )
        .unwrap();
    let (_target, e) = engine();
    e.import_preview(source.path().to_str().unwrap()).unwrap();
    assert_eq!(e.next_list("label").unwrap().len(), 2);
    assert_eq!(e.next_list("document").unwrap().len(), 2);
    assert_eq!(e.next_list("thread").unwrap().len(), 2);
    assert_eq!(e.next_list("binding").unwrap().len(), 2);
    let archive = e
        .store
        .read::<Value>("next:migration:archive")
        .unwrap()
        .unwrap();
    assert_eq!(
        archive.value["workspace_doc:label:Orphan"]["text"],
        "Recover me"
    );
    assert!(e.import_preview(source.path().to_str().unwrap()).is_err());
    assert_eq!(
        old.store
            .read::<Value>("calendar_workspace")
            .unwrap()
            .unwrap()
            .revision,
        1
    );
    assert!(old.next_list("calendar").unwrap().is_empty());
}
#[test]
fn structured_wordcraft_adapter_creates_real_document() {
    let blocks = vec![
        DocumentBlock::Heading {
            level: 1,
            text: "Study".into(),
        },
        DocumentBlock::Paragraph {
            text: "Read first".into(),
        },
        DocumentBlock::List {
            items: vec!["Recall".into(), "Revise".into()],
            ordered: true,
        },
        DocumentBlock::Table {
            rows: vec![vec!["Word".into(), "Meaning".into()]],
        },
    ];
    let (snapshot, text) = super::wordcraft::build(&blocks).unwrap();
    let doc: wordcraft_doc::Document = serde_json::from_str(&snapshot).unwrap();
    assert!(doc
        .body
        .iter()
        .any(|b| matches!(**b, wordcraft_doc::Block::Table(_))));
    assert!(text.contains("Recall"));
}
#[tokio::test]
async fn following_split_preserves_count_overrides_and_document_identity() {
    let (_d, e) = engine();
    save(&e, "calendar", calendar("a"), 0).await.unwrap();
    let mut t = task("series", "a");
    t.recurrence = Some(Recurrence {
        frequency: "daily".into(),
        interval: 1,
        weekdays: vec![],
        count: Some(5),
        until: None,
    });
    save(&e, "task", json!(t), 0).await.unwrap();
    let mut override_task = t.clone();
    override_task.recurrence = None;
    override_task.start_date = "2026-10-25".into();
    override_task.end_date = override_task.start_date.clone();
    override_task.completed = true;
    e.edit_occurrence(json!({"id":"series","revision":1,"original_date":"2026-10-25","mode":"occurrence","task":override_task})).unwrap();
    save(
        &e,
        "document",
        json!(Document {
            id: "retained-doc".into(),
            scope: "task:series@2026-10-25".into(),
            text: "Keep this".into(),
            ..Default::default()
        }),
        0,
    )
    .await
    .unwrap();
    let mut following = t.clone();
    following.start_date = "2026-10-24".into();
    following.end_date = following.start_date.clone();
    following.title = "Revised".into();
    e.edit_occurrence(json!({"id":"series","revision":2,"original_date":"2026-10-24","mode":"following","task":following})).unwrap();
    let tasks = e.next_list("task").unwrap();
    let new: Task = decode(
        tasks
            .iter()
            .find(|r| r.value["id"] != "series")
            .unwrap()
            .value
            .clone(),
    )
    .unwrap();
    assert_eq!(new.recurrence.as_ref().unwrap().count, Some(3));
    assert_eq!(
        e.next_get::<Document>("document", "retained-doc")
            .unwrap()
            .value
            .scope,
        format!("task:{}@2026-10-25", new.id)
    );
    let exceptions: Vec<OccurrenceOverride> = e
        .next_list("occurrence")
        .unwrap()
        .into_iter()
        .map(|r| decode(r.value).unwrap())
        .collect();
    let occurrences = expand(&new, "2026-10-22", "2026-10-31", &exceptions).unwrap();
    assert_eq!(occurrences.len(), 3);
    assert!(
        occurrences
            .iter()
            .find(|o| o.original_date == "2026-10-25")
            .unwrap()
            .task
            .completed
    );
}
#[tokio::test]
async fn entire_series_edit_does_not_reset_start_to_clicked_occurrence() {
    let (_d, e) = engine();
    save(&e, "calendar", calendar("a"), 0).await.unwrap();
    let mut t = task("series", "a");
    t.recurrence = Some(Recurrence {
        frequency: "weekly".into(),
        interval: 1,
        weekdays: vec![],
        count: None,
        until: None,
    });
    save(&e, "task", json!(t), 0).await.unwrap();
    t.start_date = "2026-10-29".into();
    t.end_date = t.start_date.clone();
    t.title = "New title".into();
    e.edit_occurrence(
        json!({"id":"series","revision":1,"original_date":"2026-10-29","mode":"series","task":t}),
    )
    .unwrap();
    assert_eq!(
        e.next_get::<Task>("task", "series")
            .unwrap()
            .value
            .start_date,
        "2026-10-22"
    );
}
#[tokio::test]
async fn delete_is_revision_checked_and_scoped() {
    let (_d, e) = engine();
    save(&e, "calendar", calendar("a"), 0).await.unwrap();
    save(&e, "calendar", calendar("b"), 0).await.unwrap();
    save(&e, "task", json!(task("ta", "a")), 0).await.unwrap();
    save(&e, "task", json!(task("tb", "b")), 0).await.unwrap();
    assert!(e
        .next_action(
            "next_delete",
            json!({"kind":"calendar","id":"a","revision":9})
        )
        .await
        .is_err());
    assert_eq!(e.next_list("calendar").unwrap().len(), 2);
    e.next_action(
        "next_delete",
        json!({"kind":"calendar","id":"a","revision":1}),
    )
    .await
    .unwrap();
    assert_eq!(e.next_list("calendar").unwrap().len(), 1);
    assert_eq!(e.next_list("task").unwrap().len(), 1);
    assert!(e.next_get::<Value>("task", "ta").is_err());
    assert!(e.next_get::<Value>("task", "tb").is_ok());
}
#[tokio::test]
async fn explicit_file_preview_reads_only_bound_text() {
    let (d, e) = engine();
    let path = d.path().join("reading.md");
    std::fs::write(&path, "Synthetic reading").unwrap();
    save(
        &e,
        "binding",
        json!({"id":"reading","name":"Reading","kind":"file","path":path,"writable":false}),
        0,
    )
    .await
    .unwrap();
    let value = e
        .next_action("next_preview_binding", json!({"id":"reading"}))
        .await
        .unwrap();
    assert_eq!(value["text"], "Synthetic reading");
    assert!(e
        .next_action("next_preview_binding", json!({"id":"missing"}))
        .await
        .is_err());
}
