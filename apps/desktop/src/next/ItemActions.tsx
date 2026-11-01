import { useEffect, useRef, useState, ReactNode } from "react";
import { MoreHorizontal } from "lucide-react";
import { call, flushDocuments, row, useWorkspace } from "./state";
export function ItemActions({
  kind,
  id,
  children,
}: {
  kind: string;
  id: string;
  children: ReactNode;
}) {
  const w = useWorkspace(),
    root = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false),
    [confirm, setConfirm] = useState(false),
    [busy, setBusy] = useState(false);
  const record = row(w.data, kind, id),
    title = record?.value.name || record?.value.title || kind;
  useEffect(() => {
    const outside = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setMenu(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(false);
        setConfirm(false);
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, []);
  async function remove() {
    if (!record) return;
    setBusy(true);
    try {
      if (!(await flushDocuments()))
        throw Error("Save or recover open document drafts first.");
      const result = await call("next_delete", {
        kind,
        id,
        revision: record.revision,
      });
      window.dispatchEvent(
        new CustomEvent("consilium-items-deleted", { detail: result.removed }),
      );
      await w.refresh();
      setConfirm(false);
    } catch (e) {
      w.error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div
      ref={root}
      className="nx-item-row"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu(true);
      }}
    >
      {children}
      <button
        aria-label={`Actions for ${title}`}
        onClick={() => setMenu(!menu)}
      >
        <MoreHorizontal size={15} />
      </button>
      {menu && (
        <div className="nx-item-menu" role="menu">
          <button
            role="menuitem"
            onClick={() => {
              setMenu(false);
              w.open(kind, id, title);
            }}
          >
            Open in app
          </button>
          <button
            role="menuitem"
            onClick={() => {
              setMenu(false);
              setConfirm(true);
            }}
          >
            Delete…
          </button>
        </div>
      )}
      {confirm && (
        <div className="nx-overlay" onClick={() => !busy && setConfirm(false)}>
          <section
            className="nx-dialog"
            role="dialog"
            aria-label="Delete item"
            onClick={(e) => e.stopPropagation()}
          >
            <h2>Delete {title}?</h2>
            <p>
              {kind === "calendar"
                ? "Its tasks and calendar-owned labels will also be deleted. "
                : ""}
              Files on your device are kept.
            </p>
            <footer>
              <button disabled={busy} onClick={() => setConfirm(false)}>
                Cancel
              </button>
              <button disabled={busy} onClick={() => void remove()}>
                Delete
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
