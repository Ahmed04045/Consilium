import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  MousePointer2,
  PenLine,
  Highlighter,
  Eraser,
  Undo2,
  Redo2,
  X,
  MoreHorizontal,
} from "lucide-react";
import { ComposerMenu } from "./ComposerMenu";
import {
  call,
  download,
  uid,
  useWorkspace,
  documentFlushers,
  type Data,
} from "./state";
type Point = [number, number];
type Mark = {
  id: string;
  tool: "pen" | "highlight";
  color: string;
  width: number;
  points: Point[];
};
type Tool = "select" | "pen" | "highlight" | "eraser";
type Props = {
  ownerKind: "calendar" | "network";
  ownerId: string;
  viewKey: string;
  active: boolean;
  onActive: (active: boolean) => void;
  viewport?: { x: number; y: number; zoom: number };
  hourly?: boolean;
};
function strokePath(points: Point[]) {
  if (points.length < 2) return "";
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++)
    d += ` Q ${points[i][0]} ${points[i][1]} ${(points[i][0] + points[i + 1][0]) / 2} ${(points[i][1] + points[i + 1][1]) / 2}`;
  return d + ` L ${points.at(-1)![0]} ${points.at(-1)![1]}`;
}
function distance(p: Point, a: Point, b: Point) {
  const dx = b[0] - a[0],
    dy = b[1] - a[1],
    length = dx * dx + dy * dy;
  const t = length
    ? Math.max(
        0,
        Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / length),
      )
    : 0;
  return Math.hypot(p[0] - a[0] - t * dx, p[1] - a[1] - t * dy);
}
export function AnnotationBoard({
  ownerKind,
  ownerId,
  viewKey,
  active,
  onActive,
  viewport,
  hourly,
}: Props) {
  const w = useWorkspace(),
    space = ownerKind === "network" ? "world" : "normalized";
  const record = (w.data.annotation || []).find(
    (r) =>
      r.value.owner_kind === ownerKind &&
      r.value.owner_id === ownerId &&
      r.value.view_key === viewKey,
  );
  const recoveryKey = `consilium-drawing:${ownerKind}:${ownerId}:${viewKey}`;
  const [initial] = useState(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(recoveryKey) || "null");
      if (
        Array.isArray(draft?.marks) &&
        draft.marks.length <= 300 &&
        draft.marks.every(
          (m: Mark) =>
            ["pen", "highlight"].includes(m.tool) &&
            /^#[0-9a-f]{6}$/i.test(m.color) &&
            Number.isFinite(m.width) &&
            m.width >= 1 &&
            m.width <= 12 &&
            Array.isArray(m.points) &&
            m.points.length > 0 &&
            m.points.length <= 4096 &&
            (m.tool !== "highlight" || m.points.length === 2) &&
            m.points.every(
              (p) =>
                Array.isArray(p) &&
                p.length === 2 &&
                p.every(
                  (n) =>
                    Number.isFinite(n) &&
                    (space === "normalized"
                      ? n >= 0 && n <= 1000
                      : Math.abs(n) <= 1000000),
                ),
            ),
        ) &&
        draft.marks.reduce((n: number, m: Mark) => n + m.points.length, 0) <=
          40000 &&
        draft.owner_kind === ownerKind &&
        draft.space === space &&
        draft.owner_id === ownerId &&
        draft.view_key === viewKey
      )
        return draft;
    } catch {}
    return null;
  });
  const [marks, setMarks] = useState<Mark[]>(
      initial?.marks || record?.value.marks || [],
    ),
    [working, setWorking] = useState<Mark[] | null>(null),
    [tool, setTool] = useState<Tool>("pen"),
    [color, setColor] = useState("#a3c9ae"),
    [width, setWidth] = useState(3),
    [undo, setUndo] = useState<Mark[][]>([]),
    [redo, setRedo] = useState<Mark[][]>([]),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(
      initial
        ? initial.base_revision !== (record?.revision || 0)
          ? "A saved drawing changed while this recovery draft was open. Export your draft or load the saved drawing."
          : "Recovered an unsaved drawing. Retry save to keep it."
        : "",
    ),
    [toolbarHost, setToolbarHost] = useState<Element | null>(null);
  const svg = useRef<SVGSVGElement>(null),
    current = useRef(marks),
    boardId = useRef<string>(initial?.id || record?.value.id || uid()),
    revision = useRef(initial?.base_revision ?? record?.revision ?? 0),
    saved = useRef(JSON.stringify(record?.value.marks || [])),
    queue = useRef(Promise.resolve()),
    failed = useRef(!!error),
    recovering = useRef(!!initial),
    generation = useRef(0),
    alive = useRef(true),
    pendingCount = useRef(0),
    gesture = useRef<{
      pointer: number;
      before: Mark[];
      draft: Mark[];
      mark?: Mark;
    } | null>(null);
  current.current = marks;
  useEffect(() => {
    const key = "drawing:" + ownerId + ":" + viewKey;
    const flush = async () => {
      if (gesture.current) return false;
      await queue.current;
      return !failed.current;
    };
    documentFlushers.set(key, flush);
    return () => {
      void queue.current.finally(() => {
        if (documentFlushers.get(key) === flush) documentFlushers.delete(key);
      });
    };
  }, [ownerId, viewKey]);
  useEffect(() => {
    alive.current = true;
    const root = svg.current?.closest(".nx-calendar");
    setToolbarHost(
      root?.querySelector(".nx-calendar-annotation-tools") || null,
    );
    return () => {
      alive.current = false;
    };
  }, []);
  useEffect(() => {
    if (
      record &&
      record.revision !== revision.current &&
      !saving &&
      !gesture.current &&
      JSON.stringify(current.current) === saved.current &&
      !recovering.current
    ) {
      boardId.current = record.value.id;
      revision.current = record.revision;
      saved.current = JSON.stringify(record.value.marks);
      current.current = record.value.marks;
      setMarks(record.value.marks);
      setUndo([]);
      setRedo([]);
    }
  }, [record?.revision, saving]);
  function persist(next: Mark[]) {
    const nonce = uid(),
      epoch = generation.current;
    const value = {
      id: boardId.current,
      schema_version: 1,
      owner_kind: ownerKind,
      owner_id: ownerId,
      view_key: viewKey,
      space,
      marks: next,
    };
    try {
      localStorage.setItem(
        recoveryKey,
        JSON.stringify({ ...value, base_revision: revision.current, nonce }),
      );
    } catch {
      setError(
        "Recovery storage is full. Keep this view open until the drawing is saved.",
      );
    }
    pendingCount.current++;
    setSaving(true);
    queue.current = queue.current
      .then(async () => {
        if (epoch !== generation.current || failed.current) return;
        try {
          const r = await w.save("annotation", value, revision.current);
          revision.current = r.revision;
          saved.current = JSON.stringify(next);
          recovering.current = false;
          try {
            const draft = JSON.parse(
              localStorage.getItem(recoveryKey) || "null",
            );
            if (draft?.nonce === nonce) localStorage.removeItem(recoveryKey);
          } catch {}
          if (alive.current) setError("");
        } catch (e) {
          failed.current = true;
          if (alive.current) setError(String(e).replace(/^Error: /, ""));
        }
      })
      .finally(() => {
        pendingCount.current--;
        if (
          alive.current &&
          epoch === generation.current &&
          pendingCount.current === 0
        )
          setSaving(false);
      });
  }
  function commit(next: Mark[]) {
    if (
      next.length > 300 ||
      next.reduce((n, m) => n + m.points.length, 0) > 40000
    ) {
      setError("Drawing limit reached. Erase some marks before adding more.");
      return;
    }
    const before = current.current;
    setUndo((old) => [...old.slice(-29), before]);
    setRedo([]);
    current.current = next;
    setMarks(next);
    persist(next);
  }
  function history(back: boolean) {
    if (gesture.current) return;
    const stack = back ? undo : redo;
    if (!stack.length) return;
    const next = stack.at(-1)!;
    const before = current.current;
    if (back) {
      setRedo((old) => [...old, before]);
      setUndo(stack.slice(0, -1));
    } else {
      setUndo((old) => [...old, before]);
      setRedo(stack.slice(0, -1));
    }
    current.current = next;
    setMarks(next);
    persist(next);
  }
  async function loadSaved() {
    try {
      const data = await call("next_snapshot");
      const r = (data.annotation || []).find(
        (r: Data) =>
          r.value.owner_kind === ownerKind &&
          r.value.owner_id === ownerId &&
          r.value.view_key === viewKey,
      );
      generation.current++;
      failed.current = false;
      recovering.current = false;
      boardId.current = r?.value.id || uid();
      revision.current = r?.revision || 0;
      const next = r?.value.marks || [];
      saved.current = JSON.stringify(next);
      current.current = next;
      setMarks(next);
      setUndo([]);
      setRedo([]);
      setError("");
      setSaving(false);
      localStorage.removeItem(recoveryKey);
    } catch (e) {
      setError(String(e));
    }
  }
  useEffect(() => {
    if (!active) return;
    const key = (e: KeyboardEvent) => {
      if (
        (e.target as HTMLElement)?.closest(
          'input,textarea,select,[contenteditable="true"]',
        )
      )
        return;
      if (tool !== "select" && ["Delete", "Backspace"].includes(e.key)) {
        e.preventDefault();
        e.stopImmediatePropagation();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopImmediatePropagation();
        gesture.current = null;
        setWorking(null);
        onActive(false);
      }
      if (
        (e.ctrlKey || e.metaKey) &&
        ["z", "y"].includes(e.key.toLowerCase())
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        history(e.key.toLowerCase() === "z" && !e.shiftKey);
      }
    };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [active, undo, redo, tool]);
  function point(e: { clientX: number; clientY: number }): Point {
    const r = svg.current!.getBoundingClientRect();
    return space === "world"
      ? [
          (e.clientX - r.left - (viewport?.x || 0)) / (viewport?.zoom || 1),
          (e.clientY - r.top - (viewport?.y || 0)) / (viewport?.zoom || 1),
        ]
      : [
          Math.max(0, Math.min(1000, ((e.clientX - r.left) / r.width) * 1000)),
          Math.max(0, Math.min(1000, ((e.clientY - r.top) / r.height) * 1000)),
        ];
  }
  function hit(m: Mark, p: Point) {
    const r = svg.current!.getBoundingClientRect();
    const scale: Point =
      space === "world"
        ? [viewport?.zoom || 1, viewport?.zoom || 1]
        : [r.width / 1000, r.height / 1000];
    const pixel = (x: Point): Point => [x[0] * scale[0], x[1] * scale[1]];
    const q = pixel(p);
    if (m.tool === "highlight") {
      const a = pixel(m.points[0]),
        b = pixel(m.points[1]);
      return (
        q[0] >= Math.min(a[0], b[0]) - 5 &&
        q[0] <= Math.max(a[0], b[0]) + 5 &&
        q[1] >= Math.min(a[1], b[1]) - 5 &&
        q[1] <= Math.max(a[1], b[1]) + 5
      );
    }
    if (m.points.length === 1)
      return distance(q, pixel(m.points[0]), pixel(m.points[0])) < 12;
    return m.points.some(
      (a, i) =>
        i > 0 &&
        distance(q, pixel(m.points[i - 1]), pixel(a)) <
          Math.max(10, m.width * 2),
    );
  }
  function begin(e: ReactPointerEvent<SVGSVGElement>) {
    if (tool === "select" || gesture.current || e.button !== 0 || !e.isPrimary)
      return;
    e.preventDefault();
    svg.current!.setPointerCapture(e.pointerId);
    const p = point(e);
    if (tool === "eraser") {
      const draft = current.current.filter((m) => !hit(m, p));
      gesture.current = {
        pointer: e.pointerId,
        before: current.current,
        draft,
      };
      setWorking(draft);
    } else {
      const mark: Mark = {
        id: uid(),
        tool,
        color,
        width,
        points: tool === "highlight" ? [p, p] : [p],
      };
      const draft = [...current.current, mark];
      gesture.current = {
        pointer: e.pointerId,
        before: current.current,
        draft,
        mark,
      };
      setWorking(draft);
    }
  }
  function move(e: ReactPointerEvent<SVGSVGElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();
    const p = point(e);
    if (g.mark) {
      const m = g.mark;
      if (m.tool === "highlight") m.points = [m.points[0], p];
      else if (m.points.length < 4096) {
        const last = m.points.at(-1)!;
        if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.35)
          m.points = [...m.points, p];
      }
      g.draft = [...g.before, { ...m }];
    } else g.draft = g.draft.filter((m) => !hit(m, p));
    setWorking([...g.draft]);
  }
  function end(e: ReactPointerEvent<SVGSVGElement>, cancel = false) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    e.stopPropagation();
    gesture.current = null;
    setWorking(null);
    if (svg.current?.hasPointerCapture(e.pointerId))
      svg.current.releasePointerCapture(e.pointerId);
    if (!cancel && JSON.stringify(g.draft) !== JSON.stringify(g.before))
      commit(g.draft);
  }
  const toolbar = (
    <div className={`nx-ink-panel ${toolbarHost ? "nx-ink-inline" : ""}`}>
      {active && (
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="nx-ink-toolbar"
        >
          {(
            [
              ["select", "Navigate", MousePointer2],
              ["pen", "Pen", PenLine],
              ["highlight", "Highlight block", Highlighter],
              ["eraser", "Eraser", Eraser],
            ] as const
          ).map(([value, label, Icon]) => (
            <button
              key={value}
              aria-label={label}
              title={label}
              aria-pressed={tool === value}
              onClick={() => {
                gesture.current = null;
                setWorking(null);
                setTool(value);
              }}
            >
              <Icon size={17} />
            </button>
          ))}
          <input
            type="color"
            aria-label="Ink color"
            title="Ink color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
          <select
            aria-label="Pen width"
            title="Pen width"
            value={width}
            onChange={(e) => setWidth(Number(e.target.value))}
          >
            {[2, 3, 6, 10].map((n) => (
              <option key={n} value={n}>
                {n}px
              </option>
            ))}
          </select>
          <button
            aria-label="Undo drawing"
            title="Undo drawing (Ctrl+Z)"
            disabled={!undo.length}
            onClick={() => history(true)}
          >
            <Undo2 size={17} />
          </button>
          <button
            aria-label="Redo drawing"
            title="Redo drawing (Ctrl+Shift+Z)"
            disabled={!redo.length}
            onClick={() => history(false)}
          >
            <Redo2 size={17} />
          </button>
          <ComposerMenu
            label="Drawing actions"
            trigger={<MoreHorizontal size={17} />}
          >
            {(close) => (
              <>
                <button
                  role="menuitem"
                  disabled={!marks.length}
                  onClick={() => {
                    close();
                    commit([]);
                  }}
                >
                  Clear drawing
                </button>
                <button
                  role="menuitem"
                  onClick={() => {
                    close();
                    download("drawing.json", {
                      schema_version: 1,
                      owner_kind: ownerKind,
                      owner_id: ownerId,
                      view_key: viewKey,
                      space,
                      marks: current.current,
                    });
                  }}
                >
                  Export drawing
                </button>
              </>
            )}
          </ComposerMenu>
          <button
            aria-label="Close drawing tools"
            title="Close drawing tools (Escape)"
            onClick={() => onActive(false)}
          >
            <X size={17} />
          </button>
        </div>
      )}
      {error && (
        <div className="nx-ink-error" role="alert">
          <span>Drawing not saved: {error}</span>
          <button
            onClick={() => {
              failed.current = false;
              setError("");
              persist(current.current);
            }}
          >
            Retry save
          </button>
          <button onClick={() => void loadSaved()}>Load saved drawing</button>
          <button
            onClick={() =>
              download("drawing-recovery.json", {
                owner_kind: ownerKind,
                owner_id: ownerId,
                view_key: viewKey,
                space,
                marks: current.current,
              })
            }
          >
            Export recovery copy
          </button>
        </div>
      )}
      <span className="nx-visually-hidden" role="status">
        {saving
          ? "Saving drawing…"
          : error
            ? "Drawing has unsaved changes"
            : "Drawing saved"}
      </span>
    </div>
  );
  const visible = working || marks;
  return (
    <>
      <svg
        ref={svg}
        className={`nx-ink-layer ${active && tool !== "select" ? "nx-ink-active" : ""} nx-ink-${tool}`}
        style={hourly ? { left: 55, width: "calc(100% - 55px)" } : undefined}
        role="img"
        aria-label={`Drawing surface · ${visible.length} marks`}
        data-view-key={viewKey}
        data-space={space}
        viewBox={space === "normalized" ? "0 0 1000 1000" : undefined}
        preserveAspectRatio="none"
        onPointerDown={begin}
        onPointerMove={move}
        onPointerUp={(e) => end(e)}
        onPointerCancel={(e) => end(e, true)}
      >
        <g
          transform={
            space === "world"
              ? `translate(${viewport?.x || 0} ${viewport?.y || 0}) scale(${viewport?.zoom || 1})`
              : undefined
          }
        >
          {[
            ...visible.filter((m) => m.tool === "highlight"),
            ...visible.filter((m) => m.tool === "pen"),
          ].map((m) =>
            m.tool === "highlight" ? (
              <rect
                key={m.id}
                data-mark-id={m.id}
                data-tool={m.tool}
                x={Math.min(m.points[0][0], m.points[1][0])}
                y={Math.min(m.points[0][1], m.points[1][1])}
                width={Math.abs(m.points[1][0] - m.points[0][0])}
                height={Math.abs(m.points[1][1] - m.points[0][1])}
                fill={m.color}
                opacity={0.23}
              />
            ) : m.points.length === 1 ? (
              <circle
                key={m.id}
                data-mark-id={m.id}
                data-tool={m.tool}
                cx={m.points[0][0]}
                cy={m.points[0][1]}
                r={m.width / 2}
                fill={m.color}
              />
            ) : (
              <path
                key={m.id}
                data-mark-id={m.id}
                data-tool={m.tool}
                d={strokePath(m.points)}
                fill="none"
                stroke={m.color}
                strokeWidth={m.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                vectorEffect={
                  space === "normalized" ? "non-scaling-stroke" : undefined
                }
              />
            ),
          )}
        </g>
      </svg>
      {toolbarHost ? createPortal(toolbar, toolbarHost) : toolbar}
    </>
  );
}
