import { useState } from "react";
import { call, Data, row, useWorkspace } from "./state";
export function NetworkFiles({ graph }: { graph: Data }) {
  const w = useWorkspace(),
    [preview, setPreview] = useState<{ name: string; text: string } | null>(
      null,
    ),
    [status, setStatus] = useState("");
  const files = graph.nodes.filter((n: Data) =>
    ["file_read", "folder_read", "file_write"].includes(n.kind),
  );
  return (
    <section className="nx-network-files">
      <h2>Files</h2>
      {!files.length && (
        <small>Add a Read file or Write file node to connect files.</small>
      )}
      {files.map((n: Data) => {
        const b = row(w.data, "binding", n.config.binding_id)?.value;
        const written = w.data.artifact?.some(
          (r) => r.value.binding_id === b?.id && r.value.node_id === n.id,
        );
        return (
          <article key={n.id}>
            <strong>{n.title}</strong>
            <small>
              {n.kind === "file_write"
                ? written
                  ? "Output created"
                  : "Expected output"
                : "Input · stays local until used"}
            </small>
            <span className="nx-file-path" title={b?.path}>
              {b?.name || "Choose a file in node properties"}
              {b?.path && <small>{b.path}</small>}
            </span>
            {b?.kind === "file" && (
              <button
                onClick={() => {
                  setStatus("Loading…");
                  void call("next_preview_binding", { id: b.id })
                    .then((r) => {
                      setPreview({ name: b.name, text: r.text });
                      setStatus("");
                    })
                    .catch((e) => {
                      setPreview(null);
                      setStatus(String(e));
                    });
                }}
              >
                Preview {n.kind === "file_write" ? "output" : "input"}
              </button>
            )}
          </article>
        );
      })}
      {status && <p role="status">{status}</p>}
      {preview && (
        <section>
          <header>
            <strong>{preview.name}</strong>
            <button
              aria-label="Close file preview"
              onClick={() => setPreview(null)}
            >
              ×
            </button>
          </header>
          <pre tabIndex={0}>{preview.text}</pre>
        </section>
      )}
    </section>
  );
}
