import { useState, forwardRef, useImperativeHandle } from "react";
import { call, Data, useWorkspace } from "./state";
export const Attachments = forwardRef<
  { add: () => void },
  {
    files: Data[];
    onChange: (v: Data[]) => void;
    provider: string;
    disabled?: boolean;
    hideButton?: boolean;
  }
>(function Attachments(
  {
    files,
    onChange,
    provider,
    disabled = false,
    hideButton = false,
  }: {
    files: Data[];
    onChange: (v: Data[]) => void;
    provider: string;
    disabled?: boolean;
    hideButton?: boolean;
  },
  ref,
) {
  const w = useWorkspace();
  const [preview, setPreview] = useState<Data | null>(null);
  async function add() {
    try {
      const picked = await call("next_pick_path", { kind: "file" });
      if (!picked.path) return;
      const file = await call("next_attachment_add", { path: picked.path });
      onChange([
        ...files,
        { ...file, workflow_input: true, share_content: false },
      ]);
      await w.refresh();
    } catch (e) {
      w.error(e);
    }
  }
  useImperativeHandle(ref, () => ({
    add: () => {
      if (!disabled && files.length < 6) void add();
    },
  }));
  return (
    <div className="nx-attachments">
      {!hideButton && (
        <button
          type="button"
          disabled={disabled || files.length >= 6}
          onClick={() => void add()}
        >
          Add files…
        </button>
      )}
      {files.length > 0 && (
        <small>
          Files are copied locally. Contents reach {provider} only when you
          select Share contents and Send. Up to six UTF-8 files, 1 MB each. File
          names and sharing status accompany your message. Removing a file here
          keeps its local snapshot for workflow use.
        </small>
      )}
      {files.map((f) => (
        <div className="nx-attachment" key={f.id}>
          <strong>{f.name}</strong>
          <small>
            {f.bytes} bytes ·{" "}
            {f.share_content
              ? f.content_status === "partial"
                ? "Partial excerpt will be shared (16,000 characters)"
                : "Full contents will be shared"
              : "Contents not shared"}{" "}
            · {f.format}
          </small>
          <label className="nx-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={f.workflow_input}
              onChange={(e) =>
                onChange(
                  files.map((x) =>
                    x.id === f.id
                      ? { ...x, workflow_input: e.target.checked }
                      : x,
                  ),
                )
              }
            />
            Use as workflow input
          </label>
          <label className="nx-check">
            <input
              type="checkbox"
              disabled={disabled}
              checked={f.share_content}
              onChange={(e) =>
                onChange(
                  files.map((x) =>
                    x.id === f.id
                      ? { ...x, share_content: e.target.checked }
                      : x,
                  ),
                )
              }
            />
            Share contents with {provider}
          </label>
          <button
            type="button"
            onClick={() =>
              void call("next_attachment_preview", { id: f.id })
                .then(setPreview)
                .catch(w.error)
            }
          >
            Preview contents
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange(files.filter((x) => x.id !== f.id))}
          >
            Remove from message
          </button>
        </div>
      ))}
      {preview && (
        <div className="nx-overlay">
          <section
            className="nx-dialog nx-wide"
            role="dialog"
            aria-label="Attachment preview"
          >
            <header>
              <h2>{preview.name}</h2>
              <button type="button" onClick={() => setPreview(null)}>
                Close
              </button>
            </header>
            <p>
              {preview.content_status === "partial"
                ? "Partial excerpt; the model will not see the rest."
                : "Full text snapshot"}
            </p>
            <pre>{preview.text}</pre>
          </section>
        </div>
      )}
    </div>
  );
});
