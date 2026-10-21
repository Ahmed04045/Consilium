import { useState } from "react";
export const appearanceDefaults = {
  density: "comfortable",
  fontSize: 14,
  defaultView: "Month",
  weekStart: "sunday",
  showCompleted: true,
  rowHeight: 90,
  rowGap: 0,
  columnGap: 0,
  hourHeight: 60,
  palette: "graphite",
  accent: "green",
};
export function readAppearance() {
  try {
    const saved = JSON.parse(
      localStorage.getItem("consilium-appearance") || "{}",
    );
    const p = {
      ...appearanceDefaults,
      ...saved,
    };
    for (const [key, min, max] of [
      ["fontSize", 12, 18],
      ["rowHeight", 90, 260],
      ["rowGap", 0, 16],
      ["columnGap", 0, 16],
      ["hourHeight", 40, 120],
    ] as const) {
      p[key] = Number.isFinite(p[key])
        ? Math.min(max, Math.max(min, p[key]))
        : appearanceDefaults[key];
    }
    if (!["graphite", "carbon", "stone"].includes(p.palette))
      p.palette = "graphite";
    if (!["green", "blue", "purple", "amber"].includes(p.accent))
      p.accent = "green";
    return p;
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
      <div className="appearance-grid">
        <label>
          App palette
          <select
            value={p.palette}
            onChange={(e) => update({ ...p, palette: e.target.value })}
          >
            <option value="graphite">Graphite</option>
            <option value="carbon">Carbon</option>
            <option value="stone">Stone</option>
          </select>
        </label>
        <label>
          Action accent
          <select
            value={p.accent}
            onChange={(e) => update({ ...p, accent: e.target.value })}
          >
            <option value="green">Green</option>
            <option value="blue">Blue</option>
            <option value="purple">Purple</option>
            <option value="amber">Amber</option>
          </select>
        </label>
        {(
          [
            ["rowHeight", "Minimum month row height", 90, 260],
            ["rowGap", "Space between calendar rows", 0, 16],
            ["columnGap", "Space between calendar columns", 0, 16],
            ["hourHeight", "Height of one hour", 40, 120],
          ] as const
        ).map(([key, label, min, max]) => (
          <label key={key}>
            {label}
            <input
              type="range"
              min={min}
              max={max}
              value={p[key]}
              onChange={(e) => update({ ...p, [key]: Number(e.target.value) })}
            />
            <span className="small muted">{p[key]}px</span>
          </label>
        ))}
      </div>
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
