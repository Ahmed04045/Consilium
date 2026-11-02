use super::*;
fn board(id: &str, owner_kind: &str, owner_id: &str) -> Value {
    json!({"id":id,"schema_version":1,"owner_kind":owner_kind,"owner_id":owner_id,"view_key":if owner_kind=="network"{"canvas"}else{"Month:2026-11-01"},"space":if owner_kind=="network"{"world"}else{"normalized"},"marks":[{"id":"ink","tool":"pen","color":"#a3c9ae","width":3,"points":[[1,2],[3,4]]}]})
}
#[tokio::test]
async fn drawings_are_scoped_revision_checked_and_do_not_edit_graphs() {
    let d = tempfile::tempdir().unwrap();
    let e = Engine::new(consilium_storage::Store::new(d.path().into()).unwrap());
    let save =
        |kind: &str, value: Value, revision| json!({"kind":kind,"value":value,"revision":revision});
    assert!(e
        .next_action(
            "next_save",
            save("annotation", board("ink", "network", "n"), 0)
        )
        .await
        .is_err());
    e.next_action(
        "next_save",
        save(
            "network",
            json!({"schema_version":1,"id":"n","name":"Test","nodes":[],"edges":[]}),
            0,
        ),
    )
    .await
    .unwrap();
    let original = e.next_get::<Value>("network", "n").unwrap();
    e.next_action(
        "next_save",
        save("annotation", board("ink", "network", "n"), 0),
    )
    .await
    .unwrap();
    assert_eq!(
        e.next_get::<Value>("network", "n").unwrap().revision,
        original.revision
    );
    assert_eq!(
        e.next_get::<Value>("network", "n").unwrap().value,
        original.value
    );
    assert!(e
        .next_action(
            "next_save",
            save("annotation", board("other", "network", "n"), 0)
        )
        .await
        .is_err());
    assert!(e
        .next_action(
            "next_save",
            save("annotation", board("ink", "network", "n"), 0)
        )
        .await
        .is_err());
    let mut invalid = board("ink", "network", "n");
    invalid["marks"][0]["points"] = json!([[1e9, 0]]);
    assert!(e
        .next_action("next_save", save("annotation", invalid, 1))
        .await
        .is_err());
    assert_eq!(
        e.next_get::<Value>("annotation", "ink").unwrap().revision,
        1
    );
    e.next_action(
        "next_delete",
        json!({"kind":"network","id":"n","revision":1}),
    )
    .await
    .unwrap();
    assert!(e.next_list("annotation").unwrap().is_empty());
}
#[tokio::test]
async fn project_copy_remaps_drawing_ownership_and_preserves_points() {
    let d = tempfile::tempdir().unwrap();
    let e = Engine::new(consilium_storage::Store::new(d.path().join("vault")).unwrap());
    for (kind, value) in [
        ("calendar", json!({"id":"c","name":"Test","timezone":"UTC"})),
        ("annotation", board("ink", "calendar", "c")),
    ] {
        e.next_action("next_save", json!({"kind":kind,"value":value,"revision":0}))
            .await
            .unwrap();
    }
    let path = d.path().join("calendar.consi");
    e.project_action(
        "next_project_write",
        json!({"kind":"calendar","id":"c","path":path}),
    )
    .unwrap();
    let imported = e.project_action("next_project_read", json!({"path":path}));
    // The public open action copies records; it never executes a workflow.
    let result = imported.unwrap();
    let root = result["id"].as_str().unwrap();
    assert_ne!(root, "c");
    let boards = e.next_list("annotation").unwrap();
    assert_eq!(boards.len(), 2);
    let copied = boards.iter().find(|r| r.value["owner_id"] == root).unwrap();
    assert_ne!(copied.value["id"], "ink");
    assert_eq!(
        copied.value["marks"],
        board("ink", "calendar", "c")["marks"]
    );
}
