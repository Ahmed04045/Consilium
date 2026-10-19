import { useState } from "react";
export const appearanceDefaults = {
  density: "comfortable",
  fontSize: 14,
  defaultView: "Month",
  weekStart: "sunday",
  showCompleted: true,
};
export function readAppearance() {
  try {
    return {
      ...appearanceDefaults,
      ...JSON.parse(localStorage.getItem("consilium-appearance") || "{}"),
    };
  } catch {
    return appearanceDefaults;
  }
}
export function Customization() {
  const [p, setP] = useState(readAppearance);
  function update(next: typeof p) {
    setP(next);
    localStorage.setItem("consilium-appearance", JSON.stringify(next));
    window.dispatchEvent(new Event("consilium-appearance"));
  }
  return (
    <section>
      <h2>Appearance & calendar</h2>
      <label>
        Density
        <select
          value={p.density}
          onChange={(e) => update({ ...p, density: e.target.value })}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </select>
      </label>
      <label>
        Text size
        <input
          type="range"
          min={12}
          max={18}
          value={p.fontSize}
          onChange={(e) => update({ ...p, fontSize: Number(e.target.value) })}
        />
        {p.fontSize}px
      </label>
      <label>
        Default view
        <select
          value={p.defaultView}
          onChange={(e) => update({ ...p, defaultView: e.target.value })}
        >
          {["Month", "Week", "Day"].map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      </label>
      <label>
        Week starts
        <select
          value={p.weekStart}
          onChange={(e) => update({ ...p, weekStart: e.target.value })}
        >
          <option value="sunday">Sunday</option>
          <option value="monday">Monday</option>
        </select>
      </label>
      <label className="check-label">
        <input
          type="checkbox"
          checked={p.showCompleted}
          onChange={(e) => update({ ...p, showCompleted: e.target.checked })}
        />
        Show completed tasks
      </label>
      <button onClick={() => update(appearanceDefaults)}>
        Reset appearance
      </button>
    </section>
  );
}
