import { useEffect, useState } from "react";
import { readAppearance } from "../Customization";
import { AnnotationBoard } from "./Annotations";
import { ProjectFiles } from "./ProjectFiles";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Check,
  FileText,
  MessageSquare,
  Folder,
  MoreHorizontal,
  PenLine,
} from "lucide-react";
import {
  useWorkspace,
  row,
  call,
  Data,
  colors,
  colorInk,
  localDate,
  uid,
  taskDefault,
} from "./state";
export function TaskForm({
  initial,
  revision,
  onClose,
  occurrence,
}: {
  initial: Data;
  revision: number;
  onClose: () => void;
  occurrence?: Data;
}) {
  const w = useWorkspace(),
    [t, setT] = useState<Data>(structuredClone(initial)),
    [mode, setMode] = useState("occurrence"),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");
  const update = (key: string, value: any) => setT({ ...t, [key]: value });
  async function submit() {
    setSaving(true);
    setError("");
    try {
      const value = {
        ...t,
        steps: t.steps.filter((s: Data) => s.title.trim()),
        end_date: t.kind === "flexible" ? t.start_date : t.end_date,
        start_time: t.kind === "timed" ? t.start_time : "",
        end_time: t.kind === "timed" ? t.end_time : "",
      };
      if (occurrence)
        await call("next_edit_occurrence", {
          id: occurrence.series_id,
          original_date: occurrence.original_date,
          mode,
          revision,
          task: value,
        });
      else await w.save("task", value, revision);
      await w.refresh();
      onClose();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  }
  const labels = w.data.label.filter(
    (r) => !r.value.calendar_id || r.value.calendar_id === t.calendar_id,
  );
  return (
    <div className="nx-overlay">
      <form
        className="nx-dialog nx-task-dialog"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        role="dialog"
        aria-modal="true"
        aria-label={revision ? "Edit task" : "New task"}
      >
        <header>
          <h2>{revision ? "Edit task" : "New task"}</h2>
          <button type="button" aria-label="Close task" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <label>
          Calendar
          <select
            aria-label="Destination calendar"
            value={t.calendar_id}
            disabled={revision > 0}
            onChange={(e) =>
              setT({
                ...t,
                calendar_id: e.target.value,
                label_id: null,
                timezone: row(w.data, "calendar", e.target.value)?.value
                  .timezone,
              })
            }
          >
            {w.data.calendar.map((c) => (
              <option key={c.value.id} value={c.value.id}>
                {c.value.name}
              </option>
            ))}
          </select>
        </label>
        <input
          aria-label="Task title"
          autoFocus
          required
          placeholder="Add a title"
          value={t.title}
          onChange={(e) => update("title", e.target.value)}
        />
        <div className="nx-fields">
          <label>
            Task form
            <select
              value={t.kind}
              onChange={(e) => update("kind", e.target.value)}
            >
              <option value="flexible">Flexible · any time that day</option>
              <option value="timed">Timed · reserves hours</option>
              <option value="goal">Goal span · date range</option>
            </select>
          </label>
          <label>
            Label
            <select
              value={t.label_id || ""}
              onChange={(e) => update("label_id", e.target.value || null)}
            >
              <option value="">No label</option>
              {labels.map((r) => (
                <option key={r.value.id} value={r.value.id}>
                  {r.value.name}
                  {!r.value.calendar_id ? " · shared" : ""}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="nx-fields">
          <label>
            Start date
            <input
              type="date"
              required
              value={t.start_date}
              onChange={(e) =>
                setT({
                  ...t,
                  start_date: e.target.value,
                  end_date:
                    t.end_date < e.target.value ? e.target.value : t.end_date,
                })
              }
            />
          </label>
          {t.kind !== "flexible" && (
            <label>
              End date · inclusive
              <input
                type="date"
                required
                min={t.start_date}
                value={t.end_date}
                onChange={(e) => update("end_date", e.target.value)}
              />
            </label>
          )}
          {t.kind === "timed" && (
            <>
              <label>
                Start time
                <input
                  type="time"
                  required
                  value={t.start_time}
                  onChange={(e) => update("start_time", e.target.value)}
                />
              </label>
              <label>
                End time
                <input
                  type="time"
                  required
                  value={t.end_time}
                  onChange={(e) => update("end_time", e.target.value)}
                />
              </label>
            </>
          )}
        </div>
        <label>
          Timezone
          <input
            value={t.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            placeholder="Asia/Qatar"
          />
        </label>
        {t.kind === "goal" && (
          <div className="nx-fields">
            <label>
              Target
              <input
                type="number"
                min="1"
                value={t.target || ""}
                onChange={(e) =>
                  update("target", Number(e.target.value) || null)
                }
              />
            </label>
            <label>
              Unit
              <input
                placeholder="words, pages, km…"
                value={t.unit}
                onChange={(e) => update("unit", e.target.value)}
              />
            </label>
            <label>
              Progress
              <input
                type="number"
                min="0"
                value={t.progress}
                onChange={(e) => update("progress", Number(e.target.value))}
              />
            </label>
          </div>
        )}
        <label>
          Repeat
          <select
            value={t.recurrence?.frequency || ""}
            onChange={(e) =>
              update(
                "recurrence",
                e.target.value
                  ? {
                      frequency: e.target.value,
                      interval: 1,
                      weekdays: [],
                      count: null,
                      until: null,
                    }
                  : null,
              )
            }
          >
            <option value="">Does not repeat</option>
            {["daily", "weekly", "weekdays", "monthly", "yearly"].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        {t.recurrence && (
          <div className="nx-repeat">
            <div className="nx-fields">
              <label>
                Every
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={t.recurrence.interval}
                  onChange={(e) =>
                    update("recurrence", {
                      ...t.recurrence,
                      interval: Number(e.target.value),
                    })
                  }
                />
              </label>
              <label>
                Ends
                <select
                  value={
                    t.recurrence.count
                      ? "count"
                      : t.recurrence.until
                        ? "until"
                        : "never"
                  }
                  onChange={(e) =>
                    update("recurrence", {
                      ...t.recurrence,
                      count: e.target.value === "count" ? 10 : null,
                      until: e.target.value === "until" ? t.start_date : null,
                    })
                  }
                >
                  <option value="never">Never</option>
                  <option value="count">After a count</option>
                  <option value="until">On a date</option>
                </select>
              </label>
              {t.recurrence.count && (
                <label>
                  Occurrences
                  <input
                    type="number"
                    min="1"
                    value={t.recurrence.count}
                    onChange={(e) =>
                      update("recurrence", {
                        ...t.recurrence,
                        count: Number(e.target.value),
                      })
                    }
                  />
                </label>
              )}
              {t.recurrence.until && (
                <label>
                  Last date
                  <input
                    type="date"
                    value={t.recurrence.until}
                    onChange={(e) =>
                      update("recurrence", {
                        ...t.recurrence,
                        until: e.target.value,
                      })
                    }
                  />
                </label>
              )}
            </div>
            {t.recurrence.frequency === "weekly" && (
              <div className="nx-weekdays">
                {["M", "T", "W", "T", "F", "S", "S"].map((day, index) => (
                  <button
                    type="button"
                    key={index}
                    aria-label={`Repeat weekday ${index + 1}`}
                    aria-pressed={t.recurrence.weekdays.includes(index)}
                    onClick={() =>
                      update("recurrence", {
                        ...t.recurrence,
                        weekdays: t.recurrence.weekdays.includes(index)
                          ? t.recurrence.weekdays.filter(
                              (i: number) => i !== index,
                            )
                          : [...t.recurrence.weekdays, index],
                      })
                    }
                  >
                    {day}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <label>
          Description
          <textarea
            rows={3}
            value={t.description}
            onChange={(e) => update("description", e.target.value)}
          />
        </label>
        <label>
          Checklist · one step per line
          <textarea
            rows={3}
            value={t.steps.map((s: Data) => s.title).join("\n")}
            onChange={(e) =>
              update(
                "steps",
                e.target.value.split("\n").map((title, i) => ({
                  ...t.steps[i],
                  id: t.steps[i]?.id || uid(),
                  title,
                  completed: t.steps[i]?.completed || false,
                })),
              )
            }
          />
        </label>
        <label>
          Color
          <input
            type="color"
            aria-label="Task color"
            value={colors[t.color] || t.color}
            onChange={(e) => update("color", e.target.value)}
          />
        </label>
        {occurrence && (
          <label>
            Apply changes to
            <select value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="occurrence">This occurrence</option>
              <option value="following">This and following</option>
              <option value="series">Entire series</option>
            </select>
          </label>
        )}
        {error && (
          <p role="alert" className="nx-error">
            {error}
          </p>
        )}
        <footer>
          {revision > 0 && (
            <button
              type="button"
              onClick={() => setT({ ...t, archived: !t.archived })}
            >
              {t.archived ? "Unarchive" : "Archive"}
            </button>
          )}
          {revision > 0 && (
            <button
              type="button"
              onClick={() => setT({ ...t, deleted: !t.deleted })}
            >
              {t.deleted ? "Undo deletion" : "Delete task"}
            </button>
          )}
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="nx-primary" disabled={saving}>
            {saving ? "Saving…" : "Save task"}
          </button>
        </footer>
      </form>
    </div>
  );
}
export function CalendarView({ id }: { id: string }) {
  const w = useWorkspace(),
    [date, setDate] = useState(localDate()),
    [view, setView] = useState(readAppearance().defaultView),
    [items, setItems] = useState<Data[]>([]),
    [hidden, setHidden] = useState<string[]>([]),
    [completed, setCompleted] = useState(readAppearance().showCompleted),
    [archived, setArchived] = useState(false),
    [labelsOpen, setLabelsOpen] = useState(false),
    [label, setLabel] = useState<Data>({
      id: uid(),
      name: "",
      color: "green",
      calendar_id: id,
    }),
    [labelRevision, setLabelRevision] = useState(0);
  const [drawing, setDrawing] = useState(false);
  const calendar = row(w.data, "calendar", id)?.value;
  const d = new Date(date + "T12:00:00");
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const weekOffset = readAppearance().weekStart === "monday" ? 1 : 0;
  first.setDate(first.getDate() - ((first.getDay() - weekOffset + 7) % 7));
  if (view === "Week") {
    first.setTime(d.getTime());
    first.setDate(first.getDate() - ((first.getDay() - weekOffset + 7) % 7));
  }
  if (view === "Day") first.setTime(d.getTime());
  const count = view === "Month" ? 42 : view === "Week" ? 7 : 1;
  const days = Array.from({ length: count }, (_, i) => {
    const x = new Date(first);
    x.setDate(x.getDate() + i);
    return localDate(x);
  });
  useEffect(() => {
    if (calendar)
      void call<Data[]>("next_occurrences", {
        calendar_id: id,
        from: days[0],
        to: days.at(-1),
        include_archived: archived,
      })
        .then(setItems)
        .catch(w.error);
  }, [id, date, view, archived, w.data.task, w.data.occurrence]);
  if (!calendar) return <p>Calendar not found.</p>;
  const labels = w.data.label.filter(
      (r) => !r.value.calendar_id || r.value.calendar_id === id,
    ),
    visible = items.filter(
      (r) =>
        (completed || !r.occurrence.task.completed) &&
        !hidden.includes(r.occurrence.task.label_id),
    );
  function move(delta: number) {
    const x = new Date(d);
    if (view === "Month") x.setMonth(x.getMonth() + delta, 1);
    else x.setDate(x.getDate() + delta * (view === "Week" ? 7 : 1));
    setDate(localDate(x));
  }
  async function toggle(item: Data) {
    try {
      const o = item.occurrence,
        t = { ...o.task, completed: !o.task.completed };
      if (row(w.data, "task", o.series_id)?.value.recurrence)
        await call("next_edit_occurrence", {
          id: o.series_id,
          original_date: o.original_date,
          mode: "occurrence",
          revision: item.revision,
          task: t,
        });
      else await w.save("task", t, item.revision);
      await w.refresh();
    } catch (e) {
      w.error(e);
    }
  }
  const block = (item: Data) => {
    const o = item.occurrence,
      t = o.task;
    const l = row(w.data, "label", t.label_id)?.value;
    return (
      <div
        className={`nx-event ${t.completed ? "done" : ""}`}
        style={
          {
            "--event": colors[l?.color || t.color] || l?.color || t.color,
            "--event-ink": colorInk(
              colors[l?.color || t.color] || l?.color || t.color,
            ),
          } as React.CSSProperties
        }
        key={o.id}
      >
        <button
          className="nx-event-title"
          onClick={() => w.open("task", o.id, t.title)}
        >
          {t.kind === "timed" && <small>{t.start_time}</small>}
          {t.kind === "goal" && "↔ "}
          {t.title}
        </button>
        <div className="nx-task-preview">
          {o.time_issue && <p role="alert">{o.time_issue}</p>}
          <strong>{t.title}</strong>
          <p>
            {t.start_date}
            {t.end_date !== t.start_date && ` → ${t.end_date}`}{" "}
            {t.kind === "timed" && `${t.start_time}–${t.end_time}`}
          </p>
          <p>{t.description.slice(0, 180)}</p>
          {l && <small>{l.name}</small>}
          <button onClick={() => void toggle(item)}>
            {t.completed ? "Mark incomplete" : "Complete task"}
          </button>
        </div>
      </div>
    );
  };
  return (
    <div className="nx-calendar">
      <header className="nx-toolbar">
        <h1>{calendar.name}</h1>
        <details className="nx-network-menu">
          <summary aria-label="Calendar actions">
            <MoreHorizontal size={19} />
          </summary>
          <div>
            <ProjectFiles kind="calendar" id={id} />
          </div>
        </details>
        <button onClick={() => setDate(localDate())}>Today</button>
        <button
          className="nx-navigation-button"
          title="Previous period"
          aria-label="Previous period"
          onClick={() => move(-1)}
        >
          <ChevronLeft size={18} />
        </button>
        <button
          className="nx-navigation-button"
          title="Next period"
          aria-label="Next period"
          onClick={() => move(1)}
        >
          <ChevronRight size={18} />
        </button>
        <strong>
          {d.toLocaleDateString(undefined, {
            month: "long",
            year: "numeric",
            ...(view === "Day" ? { day: "numeric" } : {}),
          })}
        </strong>
        <span className="nx-spacer" />
        <button
          aria-label="Draw on calendar"
          title="Draw on calendar"
          aria-pressed={drawing}
          onClick={() => setDrawing(!drawing)}
        >
          <PenLine size={17} /> Draw
        </button>
        <select
          aria-label="Calendar view"
          value={view}
          onChange={(e) => setView(e.target.value)}
        >
          {["Month", "Week", "Day"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
        <button className="nx-primary" onClick={() => w.create(id, date)}>
          <Plus size={17} />
          Create in {calendar.name}
        </button>
      </header>
      <div className="nx-filters">
        <label className="nx-check">
          <input
            type="checkbox"
            checked={archived}
            onChange={(e) => setArchived(e.target.checked)}
          />{" "}
          Show archived
        </label>
        {labels.map((r) => (
          <button
            key={r.value.id}
            aria-pressed={!hidden.includes(r.value.id)}
            onClick={() =>
              setHidden(
                hidden.includes(r.value.id)
                  ? hidden.filter((x) => x !== r.value.id)
                  : [...hidden, r.value.id],
              )
            }
          >
            <span
              className="nx-dot"
              style={{ background: colors[r.value.color] || r.value.color }}
            />
            {r.value.name}
            {!r.value.calendar_id ? " ↗" : ""}
          </button>
        ))}
        <button onClick={() => setLabelsOpen(true)}>Manage labels</button>
        <button
          aria-pressed={completed}
          onClick={() => setCompleted(!completed)}
        >
          Completed {completed ? "on" : "off"}
        </button>
      </div>
      <div className="nx-calendar-annotation-tools" />
      {view === "Month" ? (
        <div className="nx-month">
          <div className="nx-weekhead">
            {(weekOffset
              ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
              : ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
            ).map((day) => (
              <span key={day}>{day}</span>
            ))}
          </div>
          <div className="nx-month-grid nx-annotated">
            <AnnotationBoard
              key={`month:${days[0]}`}
              ownerKind="calendar"
              ownerId={id}
              viewKey={`Month:${days[0]}`}
              active={drawing}
              onActive={setDrawing}
            />
            {days.map((day) => (
              <div
                className={`nx-day ${day.slice(0, 7) !== date.slice(0, 7) ? "outside" : ""}`}
                key={day}
              >
                <button
                  className={`nx-day-number ${day === localDate() ? "today" : ""}`}
                  onClick={() => w.create(id, day)}
                >
                  {Number(day.slice(-2))}
                </button>
                {visible
                  .filter(
                    (r) =>
                      r.occurrence.task.start_date <= day &&
                      r.occurrence.task.end_date >= day,
                  )
                  .map(block)}
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div
          className="nx-hours"
          style={{ "--days": count } as React.CSSProperties}
        >
          <div className="nx-hour-head">
            <span />
            {days.map((day) => (
              <div key={day}>
                <button onClick={() => w.create(id, day)}>
                  {new Date(day + "T12:00").toLocaleDateString(undefined, {
                    weekday: "short",
                    day: "numeric",
                  })}
                </button>
                {visible
                  .filter(
                    (r) =>
                      r.occurrence.task.kind !== "timed" &&
                      r.occurrence.task.start_date <= day &&
                      r.occurrence.task.end_date >= day,
                  )
                  .map(block)}
              </div>
            ))}
          </div>
          <div className="nx-hour-body nx-annotated">
            <AnnotationBoard
              key={`${view}:${days[0]}`}
              ownerKind="calendar"
              ownerId={id}
              viewKey={`${view}:${days[0]}`}
              active={drawing}
              onActive={setDrawing}
              hourly
            />
            <div>
              {Array.from({ length: 24 }, (_, i) => (
                <div className="nx-hour-label" key={i}>
                  {String(i).padStart(2, "0")}:00
                </div>
              ))}
            </div>
            {days.map((day) => (
              <div className="nx-hour-column" key={day}>
                {Array.from({ length: 24 }, (_, i) => (
                  <button
                    aria-label={`Create ${day} ${i}:00`}
                    className="nx-hour-cell"
                    key={i}
                    onClick={() => w.create(id, day)}
                  />
                ))}
                {visible
                  .filter(
                    (r) =>
                      r.occurrence.task.kind === "timed" &&
                      r.occurrence.task.start_date <= day &&
                      r.occurrence.task.end_date >= day,
                  )
                  .map((r) => {
                    const t = r.occurrence.task;
                    const mins = (s: string) =>
                      Number(s.slice(0, 2)) * 60 + Number(s.slice(3));
                    const start = t.start_date === day ? mins(t.start_time) : 0,
                      end = t.end_date === day ? mins(t.end_time) : 1440;
                    return (
                      <div
                        key={r.occurrence.id}
                        className="nx-hour-event"
                        style={{
                          top: `calc(var(--nx-hour) * ${start / 60})`,
                          height: `calc(var(--nx-hour) * ${(end - start) / 60})`,
                        }}
                      >
                        {block(r)}
                      </div>
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      )}
      {labelsOpen && (
        <div className="nx-overlay">
          <div
            className="nx-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Manage labels"
          >
            <header>
              <h2>Labels · {calendar.name}</h2>
              <button
                aria-label="Close labels"
                onClick={() => setLabelsOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="nx-label-list">
              {labels.map((r) => (
                <button
                  key={r.value.id}
                  onClick={() => {
                    setLabel(r.value);
                    setLabelRevision(r.revision);
                  }}
                >
                  <span
                    className="nx-dot"
                    style={{
                      background: colors[r.value.color] || r.value.color,
                    }}
                  />
                  {r.value.name}
                  <small>
                    {r.value.calendar_id
                      ? "This calendar"
                      : "Across all calendars"}
                  </small>
                </button>
              ))}
            </div>
            <button
              onClick={() => {
                setLabel({
                  id: uid(),
                  name: "",
                  color: "green",
                  calendar_id: id,
                });
                setLabelRevision(0);
              }}
            >
              New label
            </button>
            <label>
              Name
              <input
                value={label.name}
                onChange={(e) => setLabel({ ...label, name: e.target.value })}
              />
            </label>
            <label>
              Color
              <input
                type="color"
                aria-label="Label color"
                value={colors[label.color] || label.color}
                onChange={(e) => setLabel({ ...label, color: e.target.value })}
              />
            </label>
            <label className="nx-check">
              <input
                type="checkbox"
                checked={!label.calendar_id}
                onChange={(e) =>
                  setLabel({
                    ...label,
                    calendar_id: e.target.checked ? null : id,
                  })
                }
              />
              Across all calendars
            </label>
            <footer>
              <button
                className="nx-primary"
                disabled={!label.name.trim()}
                onClick={() =>
                  void (async () => {
                    try {
                      const old = row(w.data, "label", label.id);
                      if (old && old.value.calendar_id !== label.calendar_id) {
                        await call("next_share_label", {
                          id: label.id,
                          revision: old.revision,
                          shared: !label.calendar_id,
                          calendar_id: id,
                        });
                        await w.refresh();
                        const current = await call("next_get", {
                          kind: "label",
                          id: label.id,
                        });
                        await w.save(
                          "label",
                          {
                            ...current.value,
                            name: label.name,
                            color: label.color,
                          },
                          current.revision,
                        );
                      } else await w.save("label", label, labelRevision);
                      setLabel({
                        id: uid(),
                        name: "",
                        color: "green",
                        calendar_id: id,
                      });
                      setLabelRevision(0);
                    } catch (e) {
                      w.error(e);
                    }
                  })()
                }
              >
                Save label
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
export function TaskView({ id }: { id: string }) {
  const w = useWorkspace(),
    [edit, setEdit] = useState(false),
    [occurrence, setOccurrence] = useState<Data | null>(null);
  const [series, original] = id.split("@");
  const r = row(w.data, "task", series);
  useEffect(() => {
    if (original && r)
      void call<Data>("next_task_occurrence", {
        id,
      })
        .then((record) => setOccurrence({ occurrence: { task: record.value } }))
        .catch(w.error);
  }, [id, w.data.task, w.data.occurrence]);
  if (!r) return <p>Task not found.</p>;
  const t = occurrence?.occurrence.task || r.value;
  const scope = `task:${id}`,
    label = row(w.data, "label", t.label_id)?.value;
  async function documentFor(s: string, title: string) {
    try {
      const existing = w.data.document.find((d) => d.value.scope === s);
      const d = existing?.value || {
        id: uid(),
        title,
        scope: s,
        document: "",
        text: "",
        blocks: [],
        deleted: false,
      };
      if (!existing) await w.save("document", d, 0);
      w.open("document", d.id, d.title);
    } catch (e) {
      w.error(e);
    }
  }
  async function update(value: Data) {
    try {
      if (original)
        await call("next_edit_occurrence", {
          id: series,
          original_date: original,
          mode: "occurrence",
          revision: r!.revision,
          task: value,
        });
      else await w.save("task", value, r!.revision);
      await w.refresh();
    } catch (e) {
      w.error(e);
    }
  }
  return (
    <div className="nx-page nx-task-page">
      <div className="nx-eyebrow">
        {row(w.data, "calendar", t.calendar_id)?.value.name}
        {label && ` / ${label.name}`}
      </div>
      <header className="nx-toolbar">
        <h1>{t.title}</h1>
        <span className="nx-spacer" />
        <button onClick={() => setEdit(true)}>Edit task</button>
        <button
          className="nx-primary"
          onClick={() => void update({ ...t, completed: !t.completed })}
        >
          {t.completed ? "Mark incomplete" : "Complete task"}
        </button>
      </header>
      <p className="nx-muted">
        {t.start_date}
        {t.end_date !== t.start_date && ` → ${t.end_date}`}{" "}
        {t.kind === "timed"
          ? `${t.start_time}–${t.end_time}`
          : t.kind === "goal"
            ? "Goal span · does not reserve hours"
            : "Flexible"}{" "}
        · {t.timezone}
      </p>
      <p>{t.description}</p>
      {t.target && (
        <div className="nx-progress">
          <progress max={t.target} value={t.progress} />
          <span>
            {t.progress} / {t.target} {t.unit}
          </span>
        </div>
      )}
      <div className="nx-actions">
        <button onClick={() => void documentFor(scope, t.title)}>
          <FileText size={17} />
          Open full-page document
        </button>
        <button
          onClick={() =>
            w.open("assistant", `task:${series}`, "Task assistant")
          }
        >
          <MessageSquare size={17} />
          Task conversation
        </button>
        {label && (
          <>
            <button
              onClick={() => void documentFor(`label:${label.id}`, label.name)}
            >
              <FileText size={17} />
              Label document
            </button>
            <button
              onClick={() =>
                w.open("assistant", `label:${label.id}`, "Label assistant")
              }
            >
              Label conversation
            </button>
          </>
        )}
      </div>
      <h2>Steps</h2>
      {t.steps.map((s: Data) => (
        <div className="nx-step" key={s.id}>
          <button
            aria-label={s.completed ? `Undo ${s.title}` : `Complete ${s.title}`}
            aria-pressed={s.completed}
            onClick={() =>
              void update({
                ...t,
                steps: t.steps.map((step: Data) =>
                  step.id === s.id
                    ? { ...step, completed: !step.completed }
                    : step,
                ),
              })
            }
          >
            {s.completed ? <Check size={16} /> : "○"}
          </button>
          <span className={s.completed ? "nx-completed" : ""}>{s.title}</span>
        </div>
      ))}
      {!t.steps.length && <p className="nx-muted">Add steps in Edit task.</p>}
      <header className="nx-toolbar">
        <h2>Child tasks</h2>
        <button onClick={() => w.create(t.calendar_id, t.start_date, series)}>
          <Plus size={16} />
          Add child task
        </button>
      </header>
      {w.data.task
        .filter((r) => r.value.parent_id === series && !r.value.deleted)
        .map((c) => (
          <button
            className="nx-list-row"
            key={c.value.id}
            onClick={() => w.open("task", c.value.id, c.value.title)}
          >
            {c.value.title}
            <small>{c.value.start_date}</small>
          </button>
        ))}
      <section className="nx-task-folder">
        <h2>
          <Folder size={17} /> Task folder
        </h2>
        <p className="nx-muted">
          Link a folder on this device for this task. The link does not read or
          upload files; add a file to a conversation when you want the AI to
          inspect its contents.
        </p>
        <div className="nx-actions">
          <select
            aria-label="Task folder"
            value={
              w.data.layout.find((r) => r.value.id === `folder-${scope}`)?.value
                .binding_id || ""
            }
            onChange={(e) =>
              void w
                .save("layout", {
                  id: `folder-${scope}`,
                  binding_id: e.target.value,
                })
                .catch(w.error)
            }
          >
            <option value="">No task folder</option>
            {w.data.binding
              .filter((r) => r.value.kind === "folder")
              .map((r) => (
                <option key={r.value.id} value={r.value.id}>
                  {r.value.name} · {r.value.path}
                </option>
              ))}
          </select>
          <button
            onClick={() => {
              const binding = {
                id: uid(),
                name: t.title,
                kind: "folder",
                path: "",
                writable: false,
              };
              void call("next_pick_path", binding)
                .then(async (picked) => {
                  if (!picked.path) return;
                  const name =
                    picked.path.split(/[\\/]/).filter(Boolean).at(-1) ||
                    t.title;
                  await w.save(
                    "binding",
                    { ...binding, name, path: picked.path },
                    0,
                  );
                  await w.save("layout", {
                    id: `folder-${scope}`,
                    binding_id: binding.id,
                  });
                })
                .catch(w.error);
            }}
          >
            Choose folder…
          </button>
        </div>
      </section>
      {edit && (
        <TaskForm
          initial={original ? { ...t, recurrence: r.value.recurrence } : t}
          revision={r.revision}
          occurrence={
            original
              ? { series_id: series, original_date: original }
              : undefined
          }
          onClose={() => setEdit(false)}
        />
      )}
    </div>
  );
}
