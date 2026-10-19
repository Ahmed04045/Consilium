# Backup and recovery

Settings creates a SQLite backup and copies reconciled Markdown files while application writes are serialized. The generated directory is under the vault's `backups/` folder. Credential Manager secrets are excluded.

## Restore in the app

Save any open notes. In Settings, choose **Browse backups**, then **Restore copy**. Consilium checks SQLite integrity, copies the selected backup into a new vault, and restarts using that copy. Both the original vault and the backup remain untouched. Use **Choose vault & restart** to return to another existing vault.

The active vault pointer is stored atomically at `%LOCALAPPDATA%\Consilium\vault-location.json`. The default remains `%LOCALAPPDATA%\Consilium` when that pointer does not exist.

## Manual recovery

1. Close Consilium completely.
2. Copy the entire current `%LOCALAPPDATA%\Consilium` directory to a separate recovery location. Keep it until you have verified recovery.
3. Select the desired backup directory. Its `consilium.sqlite` and `notes/` belong together.
4. Replace the closed application's database and notes folder with that matching pair. Do not retain old `consilium.sqlite-wal` or `consilium.sqlite-shm` sidecars from the replaced database.
5. Restart Consilium. Verify notes, profile, tracks, and plans. Rebuild embeddings if the configured model has changed.

Automated tests verify backup round-trips, non-destructive restore copies, destination validation, and preservation of the original vault.

JSON exports are for inspection and portability; they are not a substitute for the complete backup when restoring an index or session history. Backups and exports contain personal content. Forgetting live context does not rewrite previously created backups.

If a note conflicts with an external edit, copy your unsaved editor text before reopening the source. The application rejects stale saves and will not silently overwrite the external version.
