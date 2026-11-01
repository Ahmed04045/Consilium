import { TaskButton } from "./TaskButton";
import { useEffect, useRef } from "react";
import { dateKey, newTask, type Task } from "./calendar";
function lanes(tasks: Task[]) {
  const result = new Map<string, { lane: number; columns: number }>();
  let group: { task: Task; lane: number }[] = [],
    ends: number[] = [];
  let groupEnd = -1;
  const flush = () => {
    for (const item of group)
      result.set(item.task.id, { lane: item.lane, columns: ends.length });
    group = [];
    ends = [];
  };
  for (const task of tasks) {
    const [h, m] = task.time.split(":").map(Number);
    const start = h * 60 + m;
    if (start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    let lane = ends.findIndex((end) => end <= start);
    if (lane < 0) lane = ends.length;
    ends[lane] = start + task.minutes;
    groupEnd = Math.max(groupEnd, ends[lane]);
    group.push({ task, lane });
  }
  flush();
  return result;
}
export function Timeline({
  hourHeight = 60,
  days,
  tasks,
  onEdit,
  onComplete,
  busy,
  onCreate,
  color,
}: {
  hourHeight?: number;
  days: Date[];
  tasks: Task[];
  onEdit: (t: Task) => void;
  onComplete: (t: Task) => void;
  busy: boolean;
  onCreate: (t: Task) => void;
  color: (t: Task) => string;
}) {
  const scroll = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scroll.current) scroll.current.scrollTop = 8 * hourHeight;
  }, [hourHeight]);
  return (
    <div className="timeline" ref={scroll}>
      <div
        className="timeline-head"
        style={{
          gridTemplateColumns: `48px repeat(${days.length},minmax(0,1fr))`,
        }}
      >
        <span />
        {days.map((d) => (
          <div key={dateKey(d)}>
            <strong>
              {d.toLocaleDateString("en", { weekday: "short", day: "numeric" })}
            </strong>
            <div className="timeline-all-day">
              {tasks
                .filter((t) => t.date === dateKey(d) && !t.time)
                .map((t) => (
                  <TaskButton
                    key={t.id}
                    className={`calendar-task color-${color(t)} ${t.completed ? "completed" : ""}`}
                    task={t}
                    disabled={busy}
                    onOpen={() => onEdit({ ...t })}
                    onComplete={() => onComplete(t)}
                  >
                    {t.title} · All day
                  </TaskButton>
                ))}
            </div>
          </div>
        ))}
      </div>
      <div
        className="timeline-body"
        style={{
          gridTemplateColumns: `48px repeat(${days.length},minmax(0,1fr))`,
        }}
      >
        <div className="hour-labels">
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} style={{ top: h * hourHeight }}>
              {String(h).padStart(2, "0")}:00
            </span>
          ))}
        </div>
        {days.map((d) => {
          const key = dateKey(d);
          const timed = tasks
            .filter((t) => t.date === key && t.time)
            .sort((a, b) => a.time.localeCompare(b.time));
          return (
            <div className="timeline-day" key={key}>
              {Array.from({ length: 24 }, (_, h) => (
                <button
                  className="hour-slot"
                  key={h}
                  style={{ top: h * hourHeight }}
                  aria-label={`Create task ${key} ${String(h).padStart(2, "0")}:00`}
                  onClick={() =>
                    onCreate({
                      ...newTask(key),
                      time: `${String(h).padStart(2, "0")}:00`,
                    })
                  }
                />
              ))}
              {timed.map((t) => {
                const [h, m] = t.time.split(":").map(Number);
                const start = h * 60 + m;
                const { lane, columns } = lanes(timed).get(t.id)!;
                return (
                  <TaskButton
                    key={t.id}
                    className={`timeline-task calendar-task color-${color(t)} ${t.completed ? "completed" : ""}`}
                    style={{
                      top: (start * hourHeight) / 60,
                      height: Math.max(24, (t.minutes * hourHeight) / 60),
                      left: `${(lane * 100) / columns}%`,
                      width: `${100 / columns}%`,
                    }}
                    task={t}
                    disabled={busy}
                    onOpen={() => onEdit({ ...t })}
                    onComplete={() => onComplete(t)}
                  >
                    <strong>{t.title}</strong>
                    <small>
                      {t.time} · {t.minutes}m{t.label ? ` · ${t.label}` : ""}
                    </small>
                  </TaskButton>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
