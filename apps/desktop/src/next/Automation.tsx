import { useState } from "react";
import { call, Data, useWorkspace, uid } from "./state";
export function AutomationSetup({
  id,
  review,
  input,
  trusted,
}: {
  id: string;
  review: Data;
  input: string;
  trusted: boolean;
}) {
  const w = useWorkspace();
  const current = w.data.automation?.find((r) => r.value.network_id === id);
  const [minutes, setMinutes] = useState(10080),
    [calendar, setCalendar] = useState(""),
    [auto, setAuto] = useState(false),
    [create, setCreate] = useState(true),
    [update, setUpdate] = useState(false),
    [archive, setArchive] = useState(false),
    [horizon, setHorizon] = useState(14),
    [count, setCount] = useState(20),
    [budget, setBudget] = useState(120),
    [busy, setBusy] = useState(false);
  async function enable() {
    setBusy(true);
    try {
      await call("next_automation_save", {
        id: current?.value.id || uid(),
        revision: current?.revision || 0,
        network_id: id,
        approved: trusted,
        approval_digest: review.approval_digest,
        input: JSON.parse(input),
        interval_minutes: minutes,
        next_due: new Date(Date.now() + minutes * 60000).toISOString(),
        policy: {
          enabled: auto,
          calendar_id: calendar,
          create,
          update,
          archive_completed: archive,
          horizon_days: horizon,
          max_changes: count,
          max_daily_minutes: budget,
        },
      });
      await w.refresh();
      w.error(
        "Schedule enabled. First run follows the chosen interval; Consilium must remain open.",
      );
    } catch (e) {
      w.error(e);
    } finally {
      setBusy(false);
    }
  }
  return (
    <details>
      <summary>Schedule this reviewed workflow</summary>
      <p>
        Runs while Consilium is open. Missed intervals combine into one run.
        Graph, model, script or binding changes pause the schedule for a new
        review.
      </p>
      <label>
        Repeat every (minutes)
        <input
          type="number"
          min={1}
          max={525600}
          value={minutes}
          onChange={(e) => setMinutes(+e.target.value)}
        />
      </label>
      <small>
        Daily: 1440 · Weekly: 10080. Intervals use elapsed time; they do not
        track daylight-saving clock shifts.
      </small>
      <label className="nx-check">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => setAuto(e.target.checked)}
        />{" "}
        Automatically apply permitted calendar changes
      </label>
      {auto && (
        <>
          <label>
            Calendar
            <select
              aria-label="Automation calendar"
              value={calendar}
              onChange={(e) => setCalendar(e.target.value)}
            >
              <option value="">Choose…</option>
              {w.data.calendar.map((r) => (
                <option key={r.value.id} value={r.value.id}>
                  {r.value.name}
                </option>
              ))}
            </select>
          </label>
          <label className="nx-check">
            <input
              type="checkbox"
              checked={create}
              onChange={(e) => setCreate(e.target.checked)}
            />{" "}
            Create unfinished tasks
          </label>
          <label className="nx-check">
            <input
              type="checkbox"
              checked={update}
              onChange={(e) => setUpdate(e.target.checked)}
            />{" "}
            Update unfinished tasks (preserve recorded progress)
          </label>
          <label className="nx-check">
            <input
              type="checkbox"
              checked={archive}
              onChange={(e) => setArchive(e.target.checked)}
            />{" "}
            Archive completed tasks
          </label>
          <div className="nx-fields">
            <label>
              Upcoming days
              <input
                type="number"
                min={1}
                max={90}
                value={horizon}
                onChange={(e) => setHorizon(+e.target.value)}
              />
            </label>
            <label>
              Maximum changes per run
              <input
                type="number"
                min={1}
                max={50}
                value={count}
                onChange={(e) => setCount(+e.target.value)}
              />
            </label>
            <label>
              Maximum timed minutes per day
              <input
                type="number"
                min={1}
                max={1440}
                value={budget}
                onChange={(e) => setBudget(+e.target.value)}
              />
            </label>
          </div>
          <p>
            Deletion, completion/progress edits, other calendars and changes
            beyond these limits remain proposals for your review. Recurring
            changes must have an end date within the allowed horizon.
          </p>
        </>
      )}
      <button
        disabled={!trusted || busy || (auto && !calendar)}
        onClick={() => void enable()}
      >
        {busy ? "Enabling…" : "Enable scheduled runs"}
      </button>
    </details>
  );
}
export function AutomationStatus({ id }: { id: string }) {
  const w = useWorkspace();
  return (
    <>
      {(w.data.automation || [])
        .filter((r) => r.value.network_id === id)
        .map((r) => (
          <div className="nx-validation" key={r.value.id}>
            <strong>{r.value.enabled ? "Scheduled" : "Paused"}</strong> ·{" "}
            {r.value.last_status} · Next:{" "}
            {new Date(r.value.next_due).toLocaleString()}{" "}
            {r.value.last_error && <p>{r.value.last_error}</p>}
            {r.value.enabled && (
              <button
                onClick={() =>
                  void call("next_automation_pause", { id: r.value.id })
                    .then(w.refresh)
                    .catch(w.error)
                }
              >
                Pause future runs
              </button>
            )}
            <small>
              Use Review & run to change permissions or enable again. Active
              runs have their own Cancel control.
            </small>
          </div>
        ))}
    </>
  );
}
