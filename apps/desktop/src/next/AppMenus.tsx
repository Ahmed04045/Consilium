import { useEffect, useRef } from "react";
export type MenuItem = {
  label: string;
  shortcut?: string;
  disabled?: boolean;
  action: () => void;
  divider?: boolean;
};
export function AppMenu({
  label,
  items,
}: {
  label: string;
  items: MenuItem[];
}) {
  const root = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node))
        root.current?.removeAttribute("open");
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return (
    <details
      ref={root}
      className="nx-menu nx-app-menu"
      onKeyDown={(e) => {
        const controls = [
          ...root.current!.querySelectorAll<HTMLButtonElement>(
            "button:not(:disabled)",
          ),
        ];
        const index = controls.indexOf(
          document.activeElement as HTMLButtonElement,
        );
        if (e.key === "Escape") {
          root.current!.open = false;
          root.current!.querySelector<HTMLElement>("summary")?.focus();
          e.stopPropagation();
        } else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          e.preventDefault();
          root.current!.open = true;
          const next =
            e.key === "Home"
              ? 0
              : e.key === "End"
                ? controls.length - 1
                : e.key === "ArrowDown"
                  ? (index + 1) % controls.length
                  : (index - 1 + controls.length) % controls.length;
          controls[next]?.focus();
        }
      }}
    >
      <summary aria-haspopup="menu">{label}</summary>
      <div role="menu" aria-label={`${label} menu`}>
        {items.map((item) => (
          <div key={item.label} className={item.divider ? "nx-menu-group" : ""}>
            <button
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                root.current!.open = false;
                item.action();
              }}
            >
              {item.label}
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          </div>
        ))}
      </div>
    </details>
  );
}
