import { useEffect, useState } from "react";
import { call, Data, useWorkspace } from "./state";
export function Addons() {
  const w = useWorkspace();
  const [review, setReview] = useState<Data | null>(null),
    [trusted, setTrusted] = useState(false),
    [samples, setSamples] = useState<Data[]>([]);
  useEffect(() => {
    void call("next_addon_samples")
      .then(setSamples)
      .catch(() => {});
  }, []);
  async function browse() {
    try {
      const f = await call("next_pick_path", { kind: "file" });
      if (f.path) {
        setReview(await call("next_addon_inspect", { path: f.path }));
        setTrusted(false);
      }
    } catch (e) {
      w.error(e);
    }
  }
  return (
    <section>
      <h2>Program add-ons</h2>
      <p>
        Optional local Node, Python and Godot adapters. Review source before
        installing. Runtimes and dependencies are installed separately; add-ons
        run with your Windows permissions.
      </p>
      <button onClick={() => void browse()}>Choose add-on manifest…</button>
      <div className="nx-actions">
        {samples.map((s) => (
          <button
            key={s.manifest.id}
            onClick={() => {
              setReview(s);
              setTrusted(false);
            }}
          >
            Review {s.manifest.name}
          </button>
        ))}
      </div>
      {(w.data.addon || []).map((r) => (
        <div className="nx-validation" key={r.value.id}>
          <strong>
            {r.value.name}
            {!r.value.enabled && " (disabled)"}
          </strong>
          <button
            onClick={() => {
              setReview({ manifest: r.value.manifest, digest: r.value.digest });
              setTrusted(false);
            }}
          >
            Review / enable
          </button>
          <small>
            {r.value.manifest.runtime} · {r.value.digest.slice(0, 12)}
          </small>
          <button
            onClick={() =>
              void call("next_addon_example", { id: r.value.id })
                .then(async (n) => {
                  await w.refresh();
                  w.open("network", n.value.id, n.value.name);
                })
                .catch(w.error)
            }
          >
            Create example network
          </button>
          <button
            onClick={() =>
              void call("next_addon_remove", { id: r.value.id })
                .then(w.refresh)
                .catch(w.error)
            }
          >
            Disable (keep outputs)
          </button>
        </div>
      ))}
      {review && (
        <div className="nx-overlay">
          <section
            className="nx-dialog nx-wide"
            role="dialog"
            aria-label="Review add-on"
          >
            <header>
              <h2>{review.manifest.name}</h2>
              <button aria-label="Close dialog" onClick={() => setReview(null)}>
                ×
              </button>
            </header>
            <p>{review.manifest.description}</p>
            <p>
              Runtime: {review.manifest.runtime}. Declared capabilities:{" "}
              {review.manifest.capabilities.join(", ") ||
                "standard input/output"}
              .
            </p>
            <p>
              Trusted native code, not a sandbox. Installation stores this exact
              source and does not execute it.
            </p>
            <details open>
              <summary>Program source</summary>
              <pre>{review.manifest.source}</pre>
            </details>
            <details>
              <summary>Input/output contracts</summary>
              <pre>
                {JSON.stringify(
                  {
                    input: review.manifest.input_schema,
                    output: review.manifest.output_schema,
                  },
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
              />{" "}
              I reviewed and trust this source
            </label>
            <footer>
              <button onClick={() => setReview(null)}>Cancel</button>
              <button
                className="nx-primary"
                disabled={!trusted}
                onClick={() =>
                  void call("next_addon_install", { ...review, approved: true })
                    .then(async () => {
                      await w.refresh();
                      setReview(null);
                    })
                    .catch(w.error)
                }
              >
                Install reviewed add-on
              </button>
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
