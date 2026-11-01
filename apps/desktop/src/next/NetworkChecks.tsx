import { useEffect, useState } from "react";
import { native } from "../api";
import { call, Data, uid, useWorkspace } from "./state";

function patchResource(
  network: Data,
  nodeId: string,
  field: string,
  value: unknown,
  format?: string,
): Data {
  return {
    ...network,
    nodes: network.nodes.map((n: Data) =>
      n.id === nodeId
        ? {
            ...n,
            config: {
              ...n.config,
              [field]: value,
              ...(format && n.kind === "file_read" ? { format } : {}),
            },
          }
        : n.kind === "loop"
          ? {
              ...n,
              config: {
                ...n.config,
                body: patchResource(
                  n.config.body,
                  nodeId,
                  field,
                  value,
                  format,
                ),
              },
            }
          : n,
    ),
  };
}
export function NetworkChecks({
  network,
  revision,
  onChange,
}: {
  network: Data;
  revision: number;
  onChange?: (n: Data) => void;
}) {
  const w = useWorkspace();
  const [checks, setChecks] = useState<Data | null>(null),
    [error, setError] = useState(""),
    [review, setReview] = useState<Data | null>(null),
    [trusted, setTrusted] = useState(false),
    [sample, setSample] = useState<Data | null>(null),
    [expected, setExpected] = useState<Data | null>(null),
    [node, setNode] = useState(""),
    [pointer, setPointer] = useState(""),
    [result, setResult] = useState<Data | null>(null),
    [busy, setBusy] = useState(false),
    [pending, setPending] = useState<Data | null>(null),
    [refresh, setRefresh] = useState(0);
  const signature = JSON.stringify(network);
  useEffect(() => {
    if (!native) return;
    let live = true;
    setChecks(null);
    const timer = setTimeout(
      () =>
        void call("next_authoring_readiness", { network, revision })
          .then((c) => {
            if (live) {
              setChecks(c);
              setError("");
            }
          })
          .catch((e) => {
            if (live) setError(String(e));
          }),
      350,
    );
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [
    signature,
    revision,
    w.data.binding,
    w.data.profile,
    w.data.run,
    refresh,
  ]);
  async function browseResource(r: Data) {
    try {
      const picked = await call("next_pick_path", {
        kind: r.resource_kind,
        writable: r.writable,
      });
      if (!picked.path) return;
      const value = {
        id: uid(),
        name: picked.path.split(/[\\/]/).pop(),
        kind: r.resource_kind,
        path: picked.path,
        writable: r.writable,
      };
      await w.save("binding", value);
      onChange?.(
        patchResource(
          network,
          r.node_id,
          r.field,
          value.id,
          picked.path.toLowerCase().endsWith(".json") ? "json" : "text",
        ),
      );
    } catch (e) {
      w.error(e);
    }
  }
  async function chooseTest(which: "input" | "expected") {
    try {
      const p = await call("next_pick_path", { kind: "file" });
      if (!p.path) return;
      const data = await call("next_authoring_json_file", { path: p.path });
      if (which === "input") setSample(data);
      else setExpected(data);
    } catch (e) {
      w.error(e);
    }
  }
  async function chooseSchema(nodeId: string) {
    try {
      const picked = await call("next_pick_path", { kind: "file" });
      if (!picked.path) return;
      const data = await call("next_authoring_json_file", {
        path: picked.path,
      });
      onChange?.(patchResource(network, nodeId, "schema", data.value));
    } catch (e) {
      w.error(e);
    }
  }
  async function openTest() {
    try {
      const r = await call("next_authoring_review", { network, revision });
      setReview(r);
      setTrusted(false);
      setNode(
        network.nodes.find((n: Data) => n.kind === "output")?.id ||
          network.nodes.at(-1)?.id ||
          "",
      );
      setResult(null);
      setPending(null);
    } catch (e) {
      w.error(e);
    }
  }
  async function loadResult(runId: string) {
    const r = await call("next_authoring_test_result", { run_id: runId });
    setResult(r);
    if (r.status === "awaiting_approval")
      setPending((await call("next_get", { kind: "run", id: runId })).value);
    else setPending(null);
    await w.refresh();
    setRefresh((x) => x + 1);
  }
  async function test() {
    setBusy(true);
    try {
      const r = await call("next_authoring_test", {
        network: review!.plan.network,
        revision: review!.plan.revision,
        approval_digest: review!.approval_digest,
        approved: trusted,
        input: sample!.value,
        expected: expected!.value,
        output_node_id: node,
        pointer,
      });
      await loadResult(r.run_id);
    } catch (e) {
      w.error(e);
    } finally {
      setBusy(false);
    }
  }
  async function resume() {
    setBusy(true);
    try {
      await call("next_run_resume", {
        id: pending!.id,
        approval_digest: pending!.review.approval_digest,
        approved_nodes: Object.entries(pending!.nodes)
          .filter(([, s]) => (s as Data).state === "awaiting_approval")
          .map(([id]) => id),
        retry_nodes: [],
      });
      await loadResult(pending!.id);
    } catch (e) {
      w.error(e);
    } finally {
      setBusy(false);
    }
  }
  if (!native)
    return (
      <small>
        Readiness and sample execution checks are available in the desktop app.
      </small>
    );
  return (
    <section className="nx-readiness" aria-label="Network readiness">
      <div className="nx-actions">
        <strong>Readiness</strong>
        <span>
          {checks
            ? checks.structure_valid
              ? "Structure valid"
              : "Structure needs work"
            : "Checking…"}
        </span>
        <span>
          {checks
            ? checks.resources_ready
              ? "Resources configured"
              : "Resources need setup"
            : ""}
        </span>
        <span>
          Behavior{" "}
          {checks?.tests.some(
            (t: Data) => t.current_revision && t.status === "failed",
          )
            ? "has failing sample tests"
            : checks?.tests.some(
                  (t: Data) => t.current_revision && t.status === "passed",
                )
              ? "passed a sample test"
              : "not verified"}
        </span>
      </div>
      {error && <p className="nx-error">{error}</p>}
      <details>
        <summary>Set up resources and inspect warnings</summary>
        {checks?.structure_error && (
          <p className="nx-error">{checks.structure_error}</p>
        )}
        {checks?.resource_error && (
          <p className="nx-error">{checks.resource_error}</p>
        )}
        <p>
          Confirm each file is the intended input. A matching resource type does
          not establish correct contents.
        </p>
        {checks?.requirements.map((r: Data) => (
          <div className="nx-attachment" key={`${r.node_id}:${r.field}`}>
            <strong>
              {r.node_title} · {r.field.replaceAll("_", " ")}
            </strong>
            <small>
              {r.ready ? `Configured: ${r.name || r.id}` : r.problem}
            </small>
            {onChange && (
              <>
                <select
                  aria-label={`${r.node_title} ${r.field}`}
                  value={r.id || ""}
                  onChange={(e) =>
                    onChange(
                      patchResource(
                        network,
                        r.node_id,
                        r.field,
                        e.target.value,
                      ),
                    )
                  }
                >
                  <option value="">
                    Choose {r.resource_kind || r.record_kind}…
                  </option>
                  {(w.data[r.record_kind] || [])
                    .filter(
                      (x) =>
                        !x.value.deleted &&
                        (r.record_kind !== "binding" ||
                          (x.value.kind === r.resource_kind &&
                            !!x.value.writable === r.writable)),
                    )
                    .map((x) => (
                      <option key={x.value.id} value={x.value.id}>
                        {x.value.name || x.value.title || x.value.id}
                      </option>
                    ))}
                </select>
                {r.record_kind === "binding" && (
                  <button onClick={() => void browseResource(r)}>
                    {r.resource_kind === "executable"
                      ? "Locate runtime…"
                      : r.writable
                        ? "Choose output…"
                        : "Choose input…"}
                  </button>
                )}
              </>
            )}
          </div>
        ))}
        {onChange &&
          network.nodes
            .filter((n: Data) => n.kind === "validate" || n.kind === "agent")
            .map((n: Data) => (
              <div className="nx-attachment" key={`schema:${n.id}`}>
                <strong>{n.title} · Output schema</strong>
                <small>
                  Import the actual JSON Schema contract. Structure checks
                  validate it locally.
                </small>
                <button onClick={() => void chooseSchema(n.id)}>
                  Choose schema JSON…
                </button>
              </div>
            ))}
        {checks?.warnings.map((r: Data, i: number) => (
          <p key={i} className="nx-warning">
            {r.node_id}: {r.message}
          </p>
        ))}
        {!checks?.warnings.length && (
          <small>
            No heuristic warnings found. This is not proof of a complete
            implementation.
          </small>
        )}
      </details>
      <details>
        <summary>Sample tests · {checks?.tests.length || 0} runs</summary>
        <p>
          Tests execute real code with the reviewed permissions, and can write
          files or call models. They are not a sandbox. Use synthetic input and
          isolated output destinations. Retest after changing external input
          files; resource checks do not establish that those files still contain
          the tested data.
        </p>
        <button
          disabled={!checks?.resources_ready}
          onClick={() => void openTest()}
        >
          Test with sample data…
        </button>
        {checks?.tests.map((t: Data) => (
          <p key={t.run_id}>
            {t.status} ·{" "}
            {t.current_revision
              ? "current graph/resources"
              : "older graph/resources"}{" "}
            · {t.run_id.slice(0, 8)}{" "}
            <button
              onClick={() =>
                void call("next_authoring_test_result", { run_id: t.run_id })
                  .then(setResult)
                  .catch(w.error)
              }
            >
              Inspect result
            </button>
          </p>
        ))}
      </details>
      {result && !review && (
        <details open>
          <summary>Test result: {result.status}</summary>
          <pre>{JSON.stringify(result, null, 2)}</pre>
        </details>
      )}
      {review && (
        <div className="nx-overlay">
          <section
            className="nx-dialog nx-wide"
            role="dialog"
            aria-modal="true"
            aria-label="Review sample test"
          >
            <header>
              <h2>Review sample test</h2>
              <button disabled={busy} onClick={() => setReview(null)}>
                Close
              </button>
            </header>
            <p>
              {review.warning} Testing this draft does not accept or save its
              graph.
            </p>
            <details>
              <summary>
                Review scripts, model destinations, bindings and writes
              </summary>
              <pre>
                {JSON.stringify(
                  { graph: review.plan.network, resources: review.resources },
                  null,
                  2,
                )}
              </pre>
            </details>
            <p>
              Sample input goes to Input nodes. File-read nodes still read their
              configured files; select the intended file in resource setup.
            </p>
            <div className="nx-actions">
              <button disabled={busy} onClick={() => void chooseTest("input")}>
                Choose sample JSON…
              </button>
              <span>{sample?.name || "No input selected"}</span>
              <button
                disabled={busy}
                onClick={() => void chooseTest("expected")}
              >
                Choose expected JSON…
              </button>
              <span>{expected?.name || "No expectation selected"}</span>
            </div>
            <label>
              Output node
              <select
                aria-label="Test output node"
                value={node}
                onChange={(e) => setNode(e.target.value)}
              >
                {review.plan.network.nodes.map((n: Data) => (
                  <option key={n.id} value={n.id}>
                    {n.title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              JSON pointer to compare (empty = whole output)
              <input
                value={pointer}
                onChange={(e) => setPointer(e.target.value)}
                placeholder="/results"
              />
            </label>
            <details>
              <summary>Review test data</summary>
              <pre>
                {JSON.stringify(
                  { input: sample?.value, expected: expected?.value },
                  null,
                  2,
                )}
              </pre>
            </details>
            <label className="nx-check">
              <input
                type="checkbox"
                checked={trusted}
                onChange={(e) => setTrusted(e.target.checked)}
              />
              I reviewed this test's code, data destinations and writes.
            </label>
            <button
              className="nx-primary"
              disabled={busy || !trusted || !sample || !expected || !node}
              onClick={() => void test()}
            >
              {busy ? "Running test…" : "Run reviewed test"}
            </button>
            {result && (
              <>
                <h3>Result: {result.status}</h3>
                <p>{result.message}</p>
                <pre>
                  {JSON.stringify(
                    { actual: result.actual, expected: result.expected },
                    null,
                    2,
                  )}
                </pre>
              </>
            )}
            {pending && (
              <div>
                <h3>Approval required</h3>
                <p>Inspect the pending node outputs before continuing.</p>
                <pre>
                  {JSON.stringify(
                    Object.fromEntries(
                      Object.entries(pending.nodes).filter(
                        ([, s]) => (s as Data).state === "awaiting_approval",
                      ),
                    ),
                    null,
                    2,
                  )}
                </pre>
                <button disabled={busy} onClick={() => void resume()}>
                  Approve waiting test steps and continue
                </button>
              </div>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
