import { useEffect, useState } from "react";
import { call, flushDocuments, useWorkspace } from "./state";
export function ProjectFiles({
  kind,
  id,
  beforeSave,
}: {
  kind: string;
  id: string;
  beforeSave?: () => Promise<unknown>;
}) {
  const w = useWorkspace();
  const [location, setLocation] = useState("");
  const [vault, setVault] = useState("");
  const [dialog, setDialog] = useState<"save" | "export" | null>(null);
  const [format, setFormat] = useState("file");
  const [inputs, setInputs] = useState(true);
  const [folder, setFolder] = useState("Consilium project");
  const [busy, setBusy] = useState(false);
  const refresh = () =>
    call("next_project_status", { kind, id }).then((r) => {
      setLocation(r.location?.path || "");
      setVault(r.vault || "");
    });
  useEffect(() => {
    void refresh().catch(() => {});
  }, [kind, id]);
  useEffect(() => {
    const escape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setDialog(null);
    };
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, [busy]);
  async function write(existing = false) {
    setBusy(true);
    try {
      if (!(await flushDocuments()))
        throw Error("Save or recover unsaved edits before exporting this project.");
      await beforeSave?.();
      const result = await call(
        existing ? "next_project_write" : "next_project_dialog",
        {
          kind,
          id,
          mode: dialog === "export" && format !== "file" ? "folder" : "file",
          inputs:
            existing || dialog === "save"
              ? true
              : format === "algorithm"
                ? false
                : inputs,
          remember: existing || dialog === "save",
          save_folder: dialog === "save" && format === "folder",
          folder_name: folder,
        },
      );
      if (!result.cancelled) {
        await refresh();
        setDialog(null);
        w.error(`Saved to ${result.path}`);
      }
    } catch (e) {
      w.error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <button
        disabled={busy}
        title={location || "Choose where to save this project"}
        onClick={() =>
          location ? void write(true) : (setFormat("file"), setDialog("save"))
        }
      >
        Save{location ? "" : "…"}
      </button>
      <button
        disabled={busy}
        onClick={() => {
          setFormat("file");
          setDialog("save");
        }}
      >
        Save as…
      </button>
      <button
        disabled={busy}
        onClick={() => {
          setFormat("file");
          setDialog("export");
        }}
      >
        Export…
      </button>
      {dialog && (
        <div className="nx-overlay" onClick={() => !busy && setDialog(null)}>
          <section
            className="nx-dialog nx-project-dialog"
            role="dialog"
            aria-label={dialog === "save" ? "Save project" : "Export project"}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{dialog === "save" ? "Save project" : "Export project"}</h2>
              <button
                disabled={busy}
                aria-label="Close dialog"
                onClick={() => setDialog(null)}
              >
                ×
              </button>
            </header>
            <label>
              Format
              <select
                aria-label="Format"
                value={format}
                onChange={(e) => setFormat(e.target.value)}
              >
                <option value="file">Single Consilium file (.consi)</option>
                <option value="folder">
                  {dialog === "export"
                    ? "Folder with input files"
                    : "Project file in a chosen folder"}
                </option>
                {dialog === "export" && (
                  <option value="algorithm">
                    Folder without input content (algorithm only)
                  </option>
                )}
              </select>
            </label>
            {dialog === "export" && format !== "file" && (
              <label>
                New folder name
                <input
                  value={folder}
                  onChange={(e) => setFolder(e.target.value)}
                />
              </label>
            )}
            {dialog === "export" && format === "file" && (
              <label className="nx-check">
                <input
                  type="checkbox"
                  checked={inputs}
                  onChange={(e) => setInputs(e.target.checked)}
                />{" "}
                Include selected input files
              </label>
            )}
            <p>
              {format === "algorithm"
                ? "Includes the workflow and program source, without input values or selected data files. Bind inputs again after import."
                : "Includes this project, connected calendar/document records, program source and selected read-only inputs (up to 64 MB)."}
            </p>
            <p>
              Keys, model profiles, run logs and machine paths are excluded.
              Imported workflows require model/output bindings and never run
              automatically.
            </p>
            <small>
              Local drafts are autosaved for recovery. Save updates your chosen
              project file; Export creates a separate copy. Included content may
              be private.
            </small>
            {vault && (
              <small className="nx-file-path">Local vault: {vault}</small>
            )}
            <footer>
              <button disabled={busy} onClick={() => setDialog(null)}>
                Cancel
              </button>
              <button
                className="nx-primary"
                disabled={busy || (format !== "file" && !folder.trim())}
                onClick={() => void write()}
              >
                {busy ? "Saving…" : "Choose destination…"}
              </button>
            </footer>
          </section>
        </div>
      )}
    </>
  );
}
export async function openProject(w: ReturnType<typeof useWorkspace>) {
  const r = await call("next_project_dialog", { operation: "open" });
  if (!r.cancelled) {
    await w.refresh();
    w.open(r.kind, r.id);
  }
}
