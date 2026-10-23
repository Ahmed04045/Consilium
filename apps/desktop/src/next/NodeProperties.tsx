import { Data, useWorkspace } from "./state";
import { catalog } from "./NodeCatalog";

export function NodeProperties({
  node,
  update,
}: {
  node: Data;
  update: (patch: Data) => void;
}) {
  const w = useWorkspace(),
    c = node.config,
    kind = node.kind;
  function choose(
    label: string,
    field: string,
    recordKind: string,
    filter = (_: Data) => true,
    empty = "Choose…",
  ) {
    return (
      <label>
        {label}
        <select
          aria-label={label}
          value={c[field] || ""}
          onChange={(e) => {
            const id = e.target.value || undefined;
            const document =
              kind === "document_write" && field === "document_id"
                ? w.data.document.find((r) => r.value.id === id)
                : undefined;
            update({
              [field]: id,
              ...(kind === "document_write" && field === "document_id"
                ? {
                    expected_revision: document?.revision || 0,
                    ...(document
                      ? {
                          title: document.value.title,
                          scope: document.value.scope,
                        }
                      : {}),
                  }
                : {}),
            });
          }}
        >
          <option value="">{empty}</option>
          {w.data[recordKind]
            .filter((r) => !r.value.deleted && filter(r.value))
            .map((r) => (
              <option key={r.value.id} value={r.value.id}>
                {r.value.name || r.value.title}
              </option>
            ))}
        </select>
      </label>
    );
  }
  const field = (label: string, key: string, placeholder = "") => (
    <label>
      {label}
      <input
        value={c[key] || ""}
        placeholder={placeholder}
        onChange={(e) => update({ [key]: e.target.value })}
      />
    </label>
  );
  const number = (label: string, key: string, fallback: number) => (
    <label>
      {label}
      <input
        type="number"
        min={1}
        value={c[key] ?? fallback}
        onChange={(e) => update({ [key]: Number(e.target.value) })}
      />
    </label>
  );
  return (
    <div className="nx-node-properties">
      <p>{catalog[kind]?.description}</p>
      {kind === "agent" && (
        <>
          {choose("Model profile", "profile_id", "profile")}
          <label>
            Instructions
            <textarea
              rows={6}
              value={c.system_prompt || ""}
              onChange={(e) => update({ system_prompt: e.target.value })}
            />
          </label>
          <small>
            Text output by default. Set a JSON output schema under Advanced when
            the next node needs structured data.
          </small>
        </>
      )}
      {kind === "process" && (
        <>
          <label>
            Operation
            <select
              aria-label="Operation"
              value={c.operation || "script"}
              onChange={(e) =>
                update({
                  operation: e.target.value,
                  executable_binding: undefined,
                  script_binding: undefined,
                  fields: c.fields || ["title"],
                  template: c.template || "Result: {{title}}",
                })
              }
            >
              <option value="script">Run a program</option>
              <option value="select_fields">Keep selected fields</option>
              <option value="format_text">Format text</option>
            </select>
          </label>
          {c.operation === "select_fields" ? (
            <label>
              Fields to keep
              <input
                aria-label="Fields to keep"
                value={(c.fields || []).join(", ")}
                placeholder="title, summary"
                onChange={(e) =>
                  update({
                    fields: e.target.value.split(",").map((s) => s.trim()),
                  })
                }
              />
              <small>
                Top-level field names, separated by commas. Missing fields stop
                the run.
              </small>
            </label>
          ) : c.operation === "format_text" ? (
            <label>
              Text template
              <textarea
                rows={4}
                value={c.template || ""}
                onChange={(e) => update({ template: e.target.value })}
              />
              <small>
                Use {"{{title}}"} to insert a field or {"{{input}}"} for the
                whole input.
              </small>
            </label>
          ) : (
            <>
              {choose(
                "Installed runtime",
                "executable_binding",
                "binding",
                (b) => b.kind === "executable",
              )}
              <label>
                Language
                <select
                  value={c.extension || "py"}
                  onChange={(e) => {
                    const examples: Record<string, string> = {
                      py: "import sys, json\ndata = json.load(sys.stdin)\nprint(json.dumps(data))",
                      js: "const fs = require('node:fs');\nconst data = JSON.parse(fs.readFileSync(0, 'utf8'));\nconsole.log(JSON.stringify(data));",
                    };
                    update({
                      extension: e.target.value,
                      ...(Object.values(examples).includes(c.source)
                        ? { source: examples[e.target.value] }
                        : {}),
                    });
                  }}
                >
                  <option value="py">Python</option>
                  <option value="js">JavaScript (Node.js)</option>
                </select>
              </label>
              {choose(
                "Program file",
                "script_binding",
                "binding",
                (b) => b.kind === "file" && !b.writable,
                "Write code here",
              )}
              {!c.script_binding && (
                <label>
                  Program
                  <textarea
                    className="nx-code-input"
                    rows={10}
                    spellCheck={false}
                    value={c.source || ""}
                    onChange={(e) => update({ source: e.target.value })}
                  />
                </label>
              )}
              <small>
                The program receives JSON on standard input and must print JSON
                on standard output. A linked file is snapshotted during review;
                later edits require a new review. Programs run with your Windows
                permissions.
              </small>
              {number("Time limit (seconds)", "timeout_seconds", 300)}
            </>
          )}
          <small>
            For calendar changes, return a changes array and connect to Propose
            calendar changes. For file edits, connect the result to Write file.
          </small>
        </>
      )}
      {["file_read", "file_write", "folder_read"].includes(kind) && (
        <>
          {choose(
            kind === "folder_read" ? "Folder" : "File",
            "binding_id",
            "binding",
            (b) =>
              b.kind === (kind === "folder_read" ? "folder" : "file") &&
              (kind !== "file_write" || b.writable),
          )}
          {kind === "file_read" && (
            <label>
              Read as
              <select
                value={c.format || "text"}
                onChange={(e) => update({ format: e.target.value })}
              >
                <option value="text">Text</option>
                <option value="json">JSON data</option>
              </select>
            </label>
          )}
        </>
      )}
      {kind.startsWith("calendar_") &&
        choose("Calendar", "calendar_id", "calendar")}
      {kind.startsWith("document_") && (
        <>
          {choose(
            "Document",
            "document_id",
            "document",
            () => true,
            kind === "document_write" ? "Create a new document" : "Choose…",
          )}
          {kind === "document_write" &&
            field("Document title", "title", "Workflow document")}
        </>
      )}
      {(kind === "condition" || kind === "loop") && (
        <>
          {field(
            kind === "loop"
              ? "Stop when this field matches"
              : "Field to compare",
            kind === "loop" ? "stop_pointer" : "pointer",
            "/approved",
          )}
          <label>
            Expected value
            <input
              value={
                typeof c[kind === "loop" ? "stop_equals" : "equals"] ===
                "string"
                  ? c[kind === "loop" ? "stop_equals" : "equals"]
                  : JSON.stringify(
                      c[kind === "loop" ? "stop_equals" : "equals"],
                    )
              }
              onChange={(e) => {
                let value: any = e.target.value;
                try {
                  value = JSON.parse(value);
                } catch {}
                update({ [kind === "loop" ? "stop_equals" : "equals"]: value });
              }}
            />
          </label>
          <small>
            Use a field path such as /approved. Values can be text, a number,
            true or false.
          </small>
          {kind === "loop" &&
            number("Maximum repetitions", "max_iterations", 5)}
        </>
      )}
      {kind === "input" && (
        <label>
          Starting text
          <textarea
            rows={4}
            value={typeof c.value === "string" ? c.value : ""}
            placeholder="Or supply data when starting the run"
            onChange={(e) => update({ value: e.target.value || undefined })}
          />
          <small>Structured starting data is available under Advanced.</small>
        </label>
      )}
      {kind === "validate" && (
        <small>
          Set the required JSON schema under Advanced → Configuration JSON.
        </small>
      )}
      {["agent", "process", "file_read", "file_write", "folder_read"].includes(
        kind,
      ) && (
        <button onClick={() => w.open("settings")}>
          Manage models & local files
        </button>
      )}
    </div>
  );
}
