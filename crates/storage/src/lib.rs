use anyhow::{bail, Context, Result};
use consilium_domain::*;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{de::DeserializeOwned, Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fs, io::Write, path::PathBuf};

#[derive(Clone)]
pub struct Store {
    pub root: PathBuf,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Record<T> {
    #[serde(flatten, default)]
    pub meta: RecordMeta,
    pub revision: i64,
    pub value: T,
}
#[derive(Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct RecordMeta {
    pub schema_version: u32,
    pub id: String,
    pub created_at: String,
    pub updated_at: String,
}
impl Default for RecordMeta {
    fn default() -> Self {
        Self {
            schema_version: 1,
            id: id(),
            created_at: now(),
            updated_at: now(),
        }
    }
}
#[derive(Clone, Serialize)]
pub struct IndexStatus {
    pub id: String,
    pub identity: EmbeddingIdentity,
    pub status: String,
    pub done: i64,
    pub total: i64,
    pub failed: i64,
}
#[derive(Clone)]
pub struct Job {
    pub index_id: String,
    pub source_id: String,
    pub revision: i64,
    pub hash: String,
    pub text: String,
    pub attempts: i64,
}
#[derive(Clone, Serialize, Deserialize)]
pub struct Hit {
    pub id: String,
    pub title: String,
    pub excerpt: String,
    pub revision: i64,
    pub score: f64,
}
fn hash(s: &str) -> String {
    format!("{:x}", Sha256::digest(s.as_bytes()))
}

impl Store {
    pub fn new(root: PathBuf) -> Result<Self> {
        fs::create_dir_all(root.join("notes"))?;
        let store = Self { root };
        let db = store.db()?;
        let version: i64 = db.query_row("PRAGMA user_version", [], |r| r.get(0))?;
        if version > 2 {
            bail!("This vault was created by a newer Consilium version");
        }
        if version == 0 {
            db.execute_batch(include_str!("../../../schemas/001.sql"))?;
        }
        if version < 2 {
            db.execute_batch(include_str!("../../../schemas/002.sql"))?;
            let mut statement = db.prepare("SELECT key FROM records WHERE id=''")?;
            let keys = statement
                .query_map([], |r| r.get::<_, String>(0))?
                .collect::<std::result::Result<Vec<_>, _>>()?;
            for key in keys {
                db.execute(
                    "UPDATE records SET id=?,created_at=updated_at WHERE key=?",
                    params![id(), key],
                )?;
            }
        }
        Ok(store)
    }
    pub fn db(&self) -> Result<Connection> {
        let db = Connection::open(self.root.join("consilium.sqlite"))?;
        db.busy_timeout(std::time::Duration::from_secs(5))?;
        db.execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")?;
        Ok(db)
    }
    pub fn read<T: DeserializeOwned>(&self, key: &str) -> Result<Option<Record<T>>> {
        self.db()?
            .query_row(
                "SELECT revision,json,id,created_at,updated_at FROM records WHERE key=?",
                [key],
                |r| {
                    Ok((
                        r.get::<_, i64>(0)?,
                        r.get::<_, String>(1)?,
                        r.get::<_, String>(2)?,
                        r.get::<_, String>(3)?,
                        r.get::<_, String>(4)?,
                    ))
                },
            )
            .optional()?
            .map(|(revision, json, id, created_at, updated_at)| {
                Ok(Record {
                    meta: RecordMeta {
                        schema_version: 1,
                        id,
                        created_at,
                        updated_at,
                    },
                    revision,
                    value: serde_json::from_str(&json)?,
                })
            })
            .transpose()
    }
    pub fn write<T: Serialize>(&self, key: &str, expected: i64, value: &T) -> Result<i64> {
        self.write_many(&[(key.into(), expected, serde_json::to_value(value)?)])?;
        Ok(expected + 1)
    }
    pub fn write_many(&self, values: &[(String, i64, serde_json::Value)]) -> Result<()> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        for (key, expected, value) in values {
            let json = serde_json::to_string(value)?;
            let changed = if *expected == 0 {
                tx.execute(
                "INSERT OR IGNORE INTO records(key,revision,json,updated_at,id,created_at) VALUES (?,1,?,?,?,?)",
                params![key, json, now(),id(),now()],
            )?
            } else {
                tx.execute("UPDATE records SET revision=revision+1,json=?,updated_at=? WHERE key=? AND revision=?", params![json,now(),key,expected])?
            };
            if changed == 0 {
                bail!("This record changed. Refresh before saving.");
            }
        }
        tx.commit()?;
        Ok(())
    }
    pub fn list<T: DeserializeOwned>(&self, prefix: &str) -> Result<Vec<Record<T>>> {
        let db = self.db()?;
        let mut stmt = db.prepare(
            "SELECT revision,json,id,created_at,updated_at FROM records WHERE key LIKE ? ORDER BY updated_at DESC",
        )?;
        let rows = stmt.query_map([format!("{prefix}%")], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, String>(4)?,
            ))
        })?;
        rows.map(|r| {
            let (revision, json, id, created_at, updated_at) = r?;
            Ok(Record {
                meta: RecordMeta {
                    schema_version: 1,
                    id,
                    created_at,
                    updated_at,
                },
                revision,
                value: serde_json::from_str(&json)?,
            })
        })
        .collect()
    }
    pub fn notes(&self) -> Result<Vec<Note>> {
        let db = self.db()?;
        let mut stmt = db.prepare("SELECT json FROM sources ORDER BY updated_at DESC")?;
        let rows = stmt.query_map([], |r| r.get::<_, String>(0))?;
        rows.map(|r| Ok(serde_json::from_str(&r?)?)).collect()
    }
    pub fn note(&self, id: &str) -> Result<Note> {
        let json: String =
            self.db()?
                .query_row("SELECT json FROM sources WHERE id=?", [id], |r| r.get(0))?;
        Ok(serde_json::from_str(&json)?)
    }
    fn note_path(&self, id: &str) -> Result<PathBuf> {
        if id.len() != 36 || !id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
            bail!("Invalid note identifier");
        }
        Ok(self.root.join("notes").join(format!("{id}.md")))
    }
    pub fn save_note(&self, mut note: Note) -> Result<Note> {
        let path = self.note_path(&note.id)?;
        let db = self.db()?;
        let previous: Option<(i64, String)> = db
            .query_row(
                "SELECT revision,file_hash FROM sources WHERE id=?",
                [&note.id],
                |r| Ok((r.get(0)?, r.get(1)?)),
            )
            .optional()?;
        match previous {
            Some((revision, file_hash)) => {
                if revision != note.revision {
                    bail!("Note changed; reload before saving");
                }
                if hash(
                    &fs::read_to_string(&path)
                        .context("Note moved or deleted outside Consilium")?,
                ) != file_hash
                {
                    bail!("External edit detected. Reload the note before saving.");
                }
            }
            None if note.revision != 0 || path.exists() => bail!("Note conflict"),
            _ => {}
        }
        note.revision += 1;
        note.updated_at = now();
        let mut metadata = note.clone();
        metadata.body.clear();
        let text = format!(
            "---\n{}\n---\n{}",
            serde_json::to_string_pretty(&metadata)?,
            note.body
        );
        let mut temp = tempfile::NamedTempFile::new_in(self.root.join("notes"))?;
        temp.write_all(text.as_bytes())?;
        temp.as_file().sync_all()?;
        temp.persist(&path)?;
        self.index_note(&note, &text)?;
        Ok(note)
    }
    fn index_note(&self, note: &Note, text: &str) -> Result<()> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        tx.execute("INSERT INTO sources(id,revision,json,file_hash,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET revision=excluded.revision,json=excluded.json,file_hash=excluded.file_hash,updated_at=excluded.updated_at",params![note.id,note.revision,serde_json::to_string(note)?,hash(text),note.updated_at])?;
        tx.execute("DELETE FROM notes_fts WHERE id=?", [&note.id])?;
        tx.execute(
            "INSERT INTO notes_fts(id,title,body,tags) VALUES(?,?,?,?)",
            params![note.id, note.title, note.body, note.tags.join(" ")],
        )?;
        tx.execute("DELETE FROM chunks WHERE source_id=?", [&note.id])?;
        tx.execute("DELETE FROM vectors WHERE source_id=?", [&note.id])?;
        tx.execute("DELETE FROM embedding_jobs WHERE source_id=?", [&note.id])?;
        tx.execute(
            "DELETE FROM records WHERE key LIKE 'memory:%' AND json_extract(json,'$.source_id')=?",
            [&note.id],
        )?;
        for chunk in chunks(&format!("{}\n{}", note.title, note.body)) {
            let h = hash(&chunk);
            tx.execute(
                "INSERT OR IGNORE INTO chunks(source_id,revision,hash,text) VALUES(?,?,?,?)",
                params![note.id, note.revision, h, chunk],
            )?;
            tx.execute("INSERT OR IGNORE INTO embedding_jobs(index_id,source_id,revision,hash) SELECT id,?,?,? FROM embedding_indexes WHERE status IN ('building','ready')",params![note.id,note.revision,h])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn reconcile(&self) -> Result<()> {
        for entry in fs::read_dir(self.root.join("notes"))? {
            let path = entry?.path();
            if path.extension().and_then(|s| s.to_str()) != Some("md") {
                continue;
            }
            let text = fs::read_to_string(&path)?;
            let Some(rest) = text.strip_prefix("---\n") else {
                continue;
            };
            let Some((meta, body)) = rest.split_once("\n---\n") else {
                continue;
            };
            let Ok(mut note) = serde_json::from_str::<Note>(meta) else {
                continue;
            };
            if self.note_path(&note.id)? != path {
                continue;
            }
            let existing: Option<(i64, String)> = self
                .db()?
                .query_row(
                    "SELECT revision,file_hash FROM sources WHERE id=?",
                    [&note.id],
                    |r| Ok((r.get(0)?, r.get(1)?)),
                )
                .optional()?;
            if existing.as_ref().is_some_and(|(_, h)| h == &hash(&text)) {
                continue;
            }
            note.body = body.into();
            note.revision = existing.map_or(note.revision.max(1), |(r, _)| r + 1);
            note.updated_at = now();
            self.index_note(&note, &text)?;
        }
        for note in self.notes()? {
            if !self.note_path(&note.id)?.exists() {
                self.remove_source(&note.id)?;
            }
        }
        Ok(())
    }
    fn remove_source(&self, id: &str) -> Result<()> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        for table in ["vectors", "chunks", "embedding_jobs"] {
            tx.execute(&format!("DELETE FROM {table} WHERE source_id=?"), [id])?;
        }
        tx.execute("DELETE FROM notes_fts WHERE id=?", [id])?;
        tx.execute("DELETE FROM sources WHERE id=?", [id])?;
        tx.execute(
            "DELETE FROM records WHERE key LIKE 'review:%' AND json_extract(json,'$.note_id')=?",
            [id],
        )?;
        tx.execute(
            "DELETE FROM records WHERE key LIKE 'memory:%' AND json_extract(json,'$.source_id')=?",
            [id],
        )?;
        tx.commit()?;
        Ok(())
    }
    pub fn delete_note(&self, id: &str) -> Result<()> {
        let path = self.note_path(id)?;
        if path.exists() {
            fs::remove_file(path)?;
        }
        self.remove_source(id)
    }
    pub fn lexical(&self, query: &str) -> Result<Vec<Hit>> {
        let terms = query
            .split_whitespace()
            .map(|t| format!("\"{}\"", t.replace('"', "\"\"")))
            .collect::<Vec<_>>()
            .join(" OR ");
        if terms.is_empty() {
            return Ok(vec![]);
        }
        let db = self.db()?;
        let mut stmt=db.prepare("SELECT s.json,bm25(notes_fts) FROM notes_fts JOIN sources s ON s.id=notes_fts.id WHERE notes_fts MATCH ? ORDER BY bm25(notes_fts) LIMIT 30")?;
        let rows = stmt.query_map([terms], |r| {
            Ok((r.get::<_, String>(0)?, r.get::<_, f64>(1)?))
        })?;
        rows.map(|r| {
            let (json, score) = r?;
            let n: Note = serde_json::from_str(&json)?;
            Ok(Hit {
                id: n.id,
                title: n.title,
                excerpt: n.body.chars().take(600).collect(),
                revision: n.revision,
                score: -score,
            })
        })
        .collect()
    }
    pub fn begin_index(&self, identity: &EmbeddingIdentity, force: bool) -> Result<String> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        let serialized = serde_json::to_string(identity)?;
        if !force {
            if let Some(existing)=tx.query_row("SELECT id FROM embedding_indexes WHERE identity=? AND status IN ('building','ready') ORDER BY created_at DESC LIMIT 1",[&serialized],|r|r.get::<_,String>(0)).optional()?{
            tx.execute("UPDATE embedding_indexes SET status='retired' WHERE status='building' AND id<>?",[&existing])?;
            tx.execute("INSERT INTO metadata(key,value) VALUES('selected_index',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&existing])?;
            tx.commit()?;return Ok(existing);
        }
        }
        tx.execute(
            "UPDATE embedding_indexes SET status='retired' WHERE status IN ('building','failed')",
            [],
        )?;
        let index = id();
        tx.execute("INSERT INTO embedding_indexes(id,identity,provider_kind,endpoint_identity,model_name,model_fingerprint,dimensions,distance_metric,normalization_version,chunker_version,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,'building',?)",params![index,serialized,identity.provider_kind,identity.endpoint_identity,identity.model_name,identity.model_fingerprint,identity.dimensions,identity.distance_metric,identity.normalization_version,identity.chunker_version,now()])?;
        tx.execute("INSERT INTO embedding_jobs(index_id,source_id,revision,hash) SELECT ?,source_id,revision,hash FROM chunks",[&index])?;
        tx.execute("INSERT INTO metadata(key,value) VALUES('selected_index',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[&index])?;
        tx.commit()?;
        Ok(index)
    }
    pub fn indexes(&self) -> Result<Vec<IndexStatus>> {
        let db = self.db()?;
        let mut stmt=db.prepare("SELECT i.id,i.identity,i.status,(SELECT count(*) FROM embedding_jobs j WHERE j.index_id=i.id AND j.status='done'),(SELECT count(*) FROM embedding_jobs j WHERE j.index_id=i.id),(SELECT count(*) FROM embedding_jobs j WHERE j.index_id=i.id AND j.status='failed') FROM embedding_indexes i ORDER BY i.created_at DESC")?;
        let rows = stmt.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get(2)?,
                r.get(3)?,
                r.get(4)?,
                r.get(5)?,
            ))
        })?;
        rows.map(|r| {
            let (id, json, status, done, total, failed) = r?;
            Ok(IndexStatus {
                id,
                identity: serde_json::from_str(&json)?,
                status,
                done,
                total,
                failed,
            })
        })
        .collect()
    }
    pub fn next_job(&self) -> Result<Option<Job>> {
        Ok(self.db()?.query_row("SELECT j.index_id,j.source_id,j.revision,j.hash,c.text,j.attempts FROM embedding_jobs j JOIN chunks c ON c.source_id=j.source_id AND c.revision=j.revision AND c.hash=j.hash JOIN embedding_indexes i ON i.id=j.index_id WHERE i.status IN ('building','ready') AND j.status='pending' AND j.next_attempt<=unixepoch() ORDER BY i.created_at DESC LIMIT 1",[],|r|Ok(Job{index_id:r.get(0)?,source_id:r.get(1)?,revision:r.get(2)?,hash:r.get(3)?,text:r.get(4)?,attempts:r.get(5)?})).optional()?)
    }
    pub fn complete_job(&self, job: &Job, vector: &[f32]) -> Result<()> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        let valid:bool=tx.query_row("SELECT EXISTS(SELECT 1 FROM chunks c JOIN embedding_indexes i ON i.id=? WHERE c.source_id=? AND c.revision=? AND c.hash=? AND i.status IN ('building','ready'))",params![job.index_id,job.source_id,job.revision,job.hash],|r|r.get(0))?;
        if valid {
            let dimensions: usize = tx.query_row(
                "SELECT dimensions FROM embedding_indexes WHERE id=?",
                [&job.index_id],
                |r| r.get(0),
            )?;
            let vector = normalize(vector, dimensions)?;
            tx.execute("INSERT OR REPLACE INTO vectors(index_id,source_id,revision,hash,vector) VALUES(?,?,?,?,?)",params![job.index_id,job.source_id,job.revision,job.hash,serde_json::to_string(&vector)?])?;
            tx.execute("UPDATE embedding_jobs SET status='done' WHERE index_id=? AND source_id=? AND revision=? AND hash=?",params![job.index_id,job.source_id,job.revision,job.hash])?;
        }
        tx.commit()?;
        Ok(())
    }
    pub fn fail_job(&self, job: &Job) -> Result<()> {
        self.db()?.execute("UPDATE embedding_jobs SET attempts=attempts+1,status=CASE WHEN attempts>=2 THEN 'failed' ELSE 'pending' END,next_attempt=unixepoch()+? WHERE index_id=? AND source_id=? AND revision=? AND hash=?",params![2i64.pow((job.attempts+1).min(6) as u32),job.index_id,job.source_id,job.revision,job.hash])?;
        Ok(())
    }
    pub fn retry_index(&self, id: &str) -> Result<()> {
        self.db()?.execute("UPDATE embedding_jobs SET status='pending',attempts=0,next_attempt=0 WHERE index_id=? AND status='failed'",[id])?;
        Ok(())
    }
    pub fn activate_ready(&self) -> Result<()> {
        let mut db = self.db()?;
        let tx = db.transaction()?;
        let selected: Option<String> = tx
            .query_row(
                "SELECT value FROM metadata WHERE key='selected_index'",
                [],
                |r| r.get(0),
            )
            .optional()?;
        if let Some(index) = selected {
            let missing:i64=tx.query_row("SELECT count(*) FROM chunks c WHERE NOT EXISTS(SELECT 1 FROM vectors v WHERE v.index_id=? AND v.source_id=c.source_id AND v.revision=c.revision AND v.hash=c.hash)",[&index],|r|r.get(0))?;
            if missing == 0 {
                tx.execute(
                    "UPDATE embedding_indexes SET status='retired' WHERE status='ready' AND id<>?",
                    [&index],
                )?;
                tx.execute("UPDATE embedding_indexes SET status='ready',completed_at=? WHERE id=? AND status IN ('building','ready')",params![now(),index])?;
                tx.execute("INSERT INTO metadata(key,value) VALUES('active_index',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",[index])?;
            }
        }
        tx.commit()?;
        Ok(())
    }
    pub fn semantic(&self, index: &str, query: &[f32]) -> Result<Vec<Hit>> {
        let db = self.db()?;
        let mut stmt=db.prepare("SELECT s.json,v.vector,c.text FROM vectors v JOIN sources s ON s.id=v.source_id AND s.revision=v.revision JOIN chunks c ON c.source_id=v.source_id AND c.revision=v.revision AND c.hash=v.hash WHERE v.index_id=?")?;
        let rows = stmt.query_map([index], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, String>(2)?,
            ))
        })?;
        let mut hits = vec![];
        for row in rows {
            let (n, v, text) = row?;
            let note: Note = serde_json::from_str(&n)?;
            let vector: Vec<f32> = serde_json::from_str(&v)?;
            let vector = normalize(&vector, query.len())?;
            let score = query
                .iter()
                .zip(vector)
                .map(|(a, b)| f64::from(a * b))
                .sum();
            hits.push(Hit {
                id: note.id,
                title: note.title,
                excerpt: text,
                revision: note.revision,
                score,
            });
        }
        hits.sort_by(|a, b| b.score.total_cmp(&a.score));
        hits.truncate(30);
        Ok(hits)
    }
    pub fn backup(&self) -> Result<PathBuf> {
        self.reconcile()?;
        let dest = self.root.join("backups").join(id());
        fs::create_dir_all(dest.join("notes"))?;
        self.db()?.backup(
            rusqlite::DatabaseName::Main,
            dest.join("consilium.sqlite"),
            None,
        )?;
        for note in self.notes()? {
            fs::copy(
                self.note_path(&note.id)?,
                dest.join("notes").join(format!("{}.md", note.id)),
            )?;
        }
        Ok(dest)
    }
    pub fn restore_copy(&self, backup_id: &str, destination: PathBuf) -> Result<Store> {
        if backup_id.len() != 36 || !backup_id.chars().all(|c| c.is_ascii_hexdigit() || c == '-') {
            bail!("Invalid backup identifier");
        }
        if destination.exists() {
            bail!("Restore destination must be new");
        }
        let backup = self.root.join("backups").join(backup_id);
        let db = Connection::open_with_flags(
            backup.join("consilium.sqlite"),
            rusqlite::OpenFlags::SQLITE_OPEN_READ_ONLY,
        )?;
        let integrity: String = db.query_row("PRAGMA integrity_check", [], |r| r.get(0))?;
        if integrity != "ok" {
            bail!("Backup integrity check failed");
        }
        drop(db);
        fs::create_dir_all(destination.join("notes"))?;
        fs::copy(
            backup.join("consilium.sqlite"),
            destination.join("consilium.sqlite"),
        )?;
        for entry in fs::read_dir(backup.join("notes"))? {
            let entry = entry?;
            if entry.file_type()?.is_file()
                && entry.path().extension().and_then(|e| e.to_str()) == Some("md")
            {
                fs::copy(
                    entry.path(),
                    destination.join("notes").join(entry.file_name()),
                )?;
            }
        }
        let restored = Store::new(destination)?;
        restored.reconcile()?;
        Ok(restored)
    }
    pub fn backups(&self) -> Result<Vec<serde_json::Value>> {
        let directory = self.root.join("backups");
        if !directory.exists() {
            return Ok(vec![]);
        }
        let mut results = vec![];
        for entry in fs::read_dir(directory)? {
            let entry = entry?;
            if entry.file_type()?.is_dir() && entry.path().join("consilium.sqlite").is_file() {
                results.push(serde_json::json!({"id":entry.file_name().to_string_lossy(),"modified":entry.metadata()?.modified()?.duration_since(std::time::UNIX_EPOCH)?.as_secs()}));
            }
        }
        results.sort_by_key(|v| std::cmp::Reverse(v["modified"].as_u64().unwrap_or(0)));
        Ok(results)
    }
    pub fn export(&self) -> Result<PathBuf> {
        let destination = self.root.join("exports");
        fs::create_dir_all(&destination)?;
        let db = self.db()?;
        let mut statement = db.prepare("SELECT key FROM records ORDER BY key")?;
        let keys = statement
            .query_map([], |r| r.get::<_, String>(0))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        let mut records = serde_json::Map::new();
        for key in keys {
            records.insert(
                key.clone(),
                serde_json::to_value(
                    self.read::<serde_json::Value>(&key)?
                        .context("Record disappeared during export")?,
                )?,
            );
        }
        let snapshot = serde_json::json!({"schema_version":1,"exported_at":now(),"records":records,"notes":self.notes()?});
        let path = destination.join(format!("{}.json", id()));
        let mut temp = tempfile::NamedTempFile::new_in(&destination)?;
        temp.write_all(serde_json::to_string_pretty(&snapshot)?.as_bytes())?;
        temp.as_file().sync_all()?;
        temp.persist(&path)?;
        Ok(path)
    }
}
pub fn chunks(text: &str) -> Vec<String> {
    let chars: Vec<char> = text.chars().collect();
    let mut out = vec![];
    let mut start = 0;
    while start < chars.len() {
        let end = (start + 1600).min(chars.len());
        out.push(chars[start..end].iter().collect());
        if end == chars.len() {
            break;
        }
        start = end - 160;
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    #[ignore = "Run explicitly for a 10,000-note lexical-search baseline"]
    fn lexical_search_reference_baseline() {
        let directory = tempfile::tempdir().unwrap();
        let store = Store::new(directory.path().into()).unwrap();
        let mut db = store.db().unwrap();
        let tx = db.transaction().unwrap();
        for i in 0..10_000 {
            let mut n = note();
            n.title = format!("History note {i}");
            n.body = format!("Athens democracy philosophy history module {}", i % 100);
            let text = serde_json::to_string(&n).unwrap();
            tx.execute("INSERT INTO sources(id,revision,json,file_hash,updated_at) VALUES(?,1,?,'fixture',?)",params![n.id,text,now()]).unwrap();
            tx.execute(
                "INSERT INTO notes_fts(id,title,body,tags) VALUES(?,?,?,'history')",
                params![n.id, n.title, n.body],
            )
            .unwrap();
        }
        tx.commit().unwrap();
        let mut samples = vec![];
        for _ in 0..30 {
            let start = std::time::Instant::now();
            assert!(!store.lexical("Athens democracy").unwrap().is_empty());
            samples.push(start.elapsed().as_secs_f64() * 1000.);
        }
        samples.sort_by(f64::total_cmp);
        println!(
            "10,000-note lexical search: p50={:.2}ms p95={:.2}ms (30 queries)",
            samples[15], samples[28]
        );
    }
    #[test]
    fn schema_one_migrates_without_losing_records() {
        let directory = tempfile::tempdir().unwrap();
        let path = directory.path().join("consilium.sqlite");
        let db = Connection::open(path).unwrap();
        db.execute_batch(include_str!("../../../schemas/001.sql"))
            .unwrap();
        db.execute(
            "INSERT INTO records(key,revision,json,updated_at) VALUES('profile',4,?,?)",
            params![serde_json::to_string(&Profile::default()).unwrap(), now()],
        )
        .unwrap();
        drop(db);
        let store = Store::new(directory.path().into()).unwrap();
        let record = store.read::<Profile>("profile").unwrap().unwrap();
        assert_eq!(record.revision, 4);
        assert_eq!(record.meta.id.len(), 36);
        assert!(!record.meta.created_at.is_empty());
    }
    #[test]
    fn stale_batch_rolls_back_all_changes() {
        let directory = tempfile::tempdir().unwrap();
        let store = Store::new(directory.path().into()).unwrap();
        store.write("existing", 0, &true).unwrap();
        assert!(store
            .write_many(&[
                ("new".into(), 0, serde_json::json!(true)),
                ("existing".into(), 0, serde_json::json!(false))
            ])
            .is_err());
        assert!(store.read::<bool>("new").unwrap().is_none());
        assert!(store.read::<bool>("existing").unwrap().unwrap().value);
    }
    #[test]
    fn restoring_a_copy_preserves_original_and_validates_destination() {
        let directory = tempfile::tempdir().unwrap();
        let store = Store::new(directory.path().join("original")).unwrap();
        let note = store.save_note(note()).unwrap();
        let backup = store.backup().unwrap();
        let destination = directory.path().join("restored");
        let restored = store
            .restore_copy(
                backup.file_name().unwrap().to_str().unwrap(),
                destination.clone(),
            )
            .unwrap();
        assert_eq!(restored.note(&note.id).unwrap().body, note.body);
        assert!(store.note(&note.id).is_ok());
        assert!(store
            .restore_copy("../../escape", directory.path().join("invalid"))
            .is_err());
        assert!(store
            .restore_copy(backup.file_name().unwrap().to_str().unwrap(), destination)
            .is_err());
    }
    fn identity(name: &str) -> EmbeddingIdentity {
        EmbeddingIdentity {
            provider_kind: "ollama".into(),
            endpoint_identity: "http://127.0.0.1:11434".into(),
            model_name: name.into(),
            model_fingerprint: None,
            dimensions: 2,
            distance_metric: "cosine".into(),
            normalization_version: 1,
            chunker_version: 1,
        }
    }
    fn note() -> Note {
        Note {
            id: id(),
            title: "History".into(),
            body: "Athens and democracy".into(),
            schema_version: 1,
            created_at: now(),
            kind: "note".into(),
            session_id: None,
            local_date: None,
            energy: None,
            difficulty: None,
            tags: vec![],
            track_id: None,
            revision: 0,
            updated_at: now(),
        }
    }
    #[test]
    fn rebuild_is_resumable_and_activation_requires_latest_revision() {
        let dir = tempfile::tempdir().unwrap();
        let store = Store::new(dir.path().into()).unwrap();
        let mut n = store.save_note(note()).unwrap();
        let first = store.begin_index(&identity("a"), false).unwrap();
        let stale = store.next_job().unwrap().unwrap();
        n.body = "Changed source".into();
        store.save_note(n).unwrap();
        store.complete_job(&stale, &[1., 0.]).unwrap();
        store.activate_ready().unwrap();
        assert_eq!(store.indexes().unwrap()[0].status, "building");
        let restarted = Store::new(dir.path().into()).unwrap();
        let job = restarted.next_job().unwrap().unwrap();
        restarted.complete_job(&job, &[1., 0.]).unwrap();
        restarted.activate_ready().unwrap();
        assert_eq!(restarted.indexes().unwrap()[0].status, "ready");
        let second = restarted.begin_index(&identity("b"), false).unwrap();
        assert_ne!(first, second);
        assert_eq!(
            restarted.begin_index(&identity("b"), false).unwrap(),
            second
        );
    }
    #[test]
    fn external_edits_conflict_and_reconcile() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().into()).unwrap();
        let n = s.save_note(note()).unwrap();
        let p = s.note_path(&n.id).unwrap();
        let text = fs::read_to_string(&p).unwrap();
        fs::write(&p, text.replace("Athens and democracy", "Sparta")).unwrap();
        assert!(s.save_note(n.clone()).is_err());
        s.reconcile().unwrap();
        assert_eq!(s.note(&n.id).unwrap().revision, 2);
        assert_eq!(s.lexical("Sparta").unwrap().len(), 1);
    }
    #[test]
    fn stale_record_write_is_rejected() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().into()).unwrap();
        s.write("profile", 0, &Profile::default()).unwrap();
        assert!(s.write("profile", 0, &Profile::default()).is_err());
    }
    #[test]
    fn switching_back_cancels_wrong_generation() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().into()).unwrap();
        let a = s.begin_index(&identity("a"), false).unwrap();
        s.activate_ready().unwrap();
        let b = s.begin_index(&identity("b"), false).unwrap();
        assert_eq!(a, s.begin_index(&identity("a"), false).unwrap());
        s.activate_ready().unwrap();
        assert_eq!(
            s.indexes()
                .unwrap()
                .iter()
                .find(|i| i.id == b)
                .unwrap()
                .status,
            "retired"
        );
    }
    #[test]
    fn backup_roundtrip_preserves_sources_and_records() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().into()).unwrap();
        let n = s.save_note(note()).unwrap();
        s.write("profile", 0, &Profile::default()).unwrap();
        let path = s.backup().unwrap();
        let restored = Store::new(path).unwrap();
        restored.reconcile().unwrap();
        assert_eq!(restored.note(&n.id).unwrap().body, n.body);
        assert_eq!(
            restored
                .read::<Profile>("profile")
                .unwrap()
                .unwrap()
                .revision,
            1
        );
    }
    #[test]
    fn deletion_excludes_vectors_and_memories() {
        let dir = tempfile::tempdir().unwrap();
        let s = Store::new(dir.path().into()).unwrap();
        let n = s.save_note(note()).unwrap();
        let idx = s.begin_index(&identity("a"), false).unwrap();
        let job = s.next_job().unwrap().unwrap();
        s.complete_job(&job, &[1., 0.]).unwrap();
        s.delete_note(&n.id).unwrap();
        assert!(s.semantic(&idx, &[1., 0.]).unwrap().is_empty());
        assert!(s.lexical("Athens").unwrap().is_empty());
    }
}
