import { createContext, useContext } from "react";
import { rpc, native } from "../api";
export type Data = Record<string, any>;
export type Row = { revision: number; value: Data; updated_at?: string };
export type Snapshot = Record<string, Row[]>;
export type TabDescriptor = {
  id: string;
  kind: string;
  objectId: string;
  title: string;
};
export const uid = () => crypto.randomUUID();
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;
export const colors: Record<string, string> = {
  green: "#9bc7ab",
  blue: "#8bb7e9",
  purple: "#bba4dd",
  amber: "#dfc17b",
  red: "#d99292",
  gray: "#ababab",
};
export const colorInk = (value: string) => {
  const color = colors[value] || value;
  const match = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color);
  if (!match) return "#151515";
  const hex =
    match[1].length === 3 ? [...match[1]].map((c) => c + c).join("") : match[1];
  const [r, g, b] = [0, 2, 4].map(
    (i) => parseInt(hex.slice(i, i + 2), 16) / 255,
  );
  const luminance = [r, g, b].map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * luminance[0] + 0.7152 * luminance[1] + 0.0722 * luminance[2] >
    0.42
    ? "#111111"
    : "#ffffff";
};
const kinds = [
  "calendar",
  "label",
  "task",
  "occurrence",
  "document",
  "thread",
  "profile",
  "binding",
  "network",
  "changeset",
  "layout",
  "run",
  "artifact",
  "automation",
  "addon",
  "annotation",
];
export const empty = () =>
  Object.fromEntries(kinds.map((k) => [k, []])) as Snapshot;
// Browser preview is explicitly separate from the native vault and cannot run code or call providers.
export async function call<T = any>(action: string, p: Data = {}): Promise<T> {
  if (native) return rpc<T>(action, p);
  const data: Snapshot = {
    ...empty(),
    ...JSON.parse(
      localStorage.getItem("consilium-next-browser") || JSON.stringify(empty()),
    ),
  };
  if (action === "next_snapshot")
    return Object.fromEntries(
      Object.entries(data).map(([k, v]) => [
        k,
        v.filter((r) => !r.value.deleted),
      ]),
    ) as T;
  if (action === "next_delete") {
    const record = data[p.kind].find((r) => r.value.id === p.id);
    if (!record || record.revision !== p.revision)
      throw Error("Item changed; refresh before deleting");
    const removed: string[] = [];
    for (const [kind, records] of Object.entries(data))
      for (const r of records)
        if (
          (kind === p.kind && r.value.id === p.id) ||
          (p.kind === "calendar" &&
            ["task", "label"].includes(kind) &&
            r.value.calendar_id === p.id)
        ) {
          r.value.deleted = true;
          r.revision++;
          removed.push(kind + ":" + r.value.id);
        }
    localStorage.setItem("consilium-next-browser", JSON.stringify(data));
    return { removed } as T;
  }
  if (action === "next_get")
    return data[p.kind].find((r) => r.value.id === p.id) as T;
  if (action === "next_save") {
    const old = data[p.kind].find((r) => r.value.id === p.value.id);
    if ((old?.revision || 0) !== p.revision)
      throw Error("This record changed. Refresh before saving.");
    const row = {
      revision: p.revision + 1,
      value: p.value,
      updated_at: new Date().toISOString(),
    };
    data[p.kind] = [...data[p.kind].filter((r) => r !== old), row];
    localStorage.setItem("consilium-next-browser", JSON.stringify(data));
    return row as T;
  }
  if (action === "next_occurrences")
    return data.task
      .filter(
        (r) =>
          r.value.calendar_id === p.calendar_id &&
          !r.value.deleted &&
          (p.include_archived || !r.value.archived) &&
          r.value.start_date <= p.to &&
          r.value.end_date >= p.from,
      )
      .map((r) => ({
        revision: r.revision,
        occurrence: {
          id: r.value.id,
          series_id: r.value.id,
          original_date: r.value.start_date,
          task: r.value,
          overridden: false,
        },
      })) as T;
  throw Error(
    "This action requires Consilium Next desktop. Browser preview does not run workflows or connect providers.",
  );
}
export type Workspace = {
  data: Snapshot;
  refresh: () => Promise<void>;
  save: (kind: string, value: Data, revision?: number) => Promise<Row>;
  open: (kind: string, id?: string, title?: string) => void;
  bindThread: (tabId: string, threadId: string, title: string) => void;
  create: (calendar?: string, date?: string, parent?: string) => void;
  error: (e: unknown) => void;
  busy: boolean;
  setBusy: (v: boolean) => void;
};
export const WorkspaceContext = createContext<Workspace>(null!);
export const useWorkspace = () => useContext(WorkspaceContext);
export const documentFlushers = new Map<string, () => Promise<boolean>>();
export async function flushDocuments(id?: string) {
  const handlers = id
    ? [...documentFlushers.entries()]
        .filter(([key]) => key === id || key.startsWith(`drawing:${id}:`))
        .map(([, handler]) => handler)
    : [...documentFlushers.values()];
  return (await Promise.all(handlers.map((handler) => handler!()))).every(
    Boolean,
  );
}
export function row(data: Snapshot, kind: string, id: string) {
  return data[kind]?.find((r) => r.value.id === id);
}
export function taskDefault(
  calendar_id: string,
  date = localDate(),
  timezone = zone(),
): Data {
  return {
    id: uid(),
    calendar_id,
    title: "",
    kind: "flexible",
    start_date: date,
    end_date: date,
    start_time: "09:00",
    end_time: "09:30",
    timezone,
    label_id: null,
    parent_id: null,
    color: "green",
    description: "",
    completed: false,
    steps: [],
    target: null,
    progress: 0,
    unit: "",
    recurrence: null,
    deleted: false,
  };
}
export function download(name: string, value: unknown) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(
    new Blob(
      [typeof value === "string" ? value : JSON.stringify(value, null, 2)],
      { type: "application/json" },
    ),
  );
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
