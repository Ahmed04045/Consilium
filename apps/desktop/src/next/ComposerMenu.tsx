import { useEffect, useRef, useState, ReactNode } from "react";
import { createPortal } from "react-dom";
export function ComposerMenu({
  label,
  trigger,
  children,
  disabled = false,
  up = false,
}: {
  label: string;
  trigger: ReactNode;
  children: (close: () => void) => ReactNode;
  disabled?: boolean;
  up?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [position, setPosition] = useState({
      top: 0,
      left: 0,
      bottom: undefined as number | undefined,
    });
  const button = useRef<HTMLButtonElement>(null),
    panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (
        !panel.current?.contains(e.target as Node) &&
        !button.current?.contains(e.target as Node)
      )
        setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setOpen(false);
        button.current?.focus();
      }
    };
    const hide = () => setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", hide);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", hide);
    };
  }, [open]);
  return (
    <>
      <button
        ref={button}
        type="button"
        disabled={disabled}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => {
          const rect = button.current!.getBoundingClientRect();
          setPosition({
            left: Math.max(8, Math.min(rect.left, innerWidth - 300)),
            top: up ? 0 : rect.bottom + 8,
            bottom: up ? innerHeight - rect.top + 8 : undefined,
          });
          setOpen(!open);
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={panel}
            role="menu"
            aria-label={label}
            className="nx-composer-menu"
            style={{
              left: position.left,
              top: up ? undefined : position.top,
              bottom: position.bottom,
            }}
            onKeyDown={(e) => {
              if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key))
                return;
              e.preventDefault();
              const items = [
                ...panel.current!.querySelectorAll<HTMLButtonElement>(
                  "button:not(:disabled)",
                ),
              ];
              const index = items.indexOf(
                document.activeElement as HTMLButtonElement,
              );
              items[
                e.key === "Home"
                  ? 0
                  : e.key === "End"
                    ? items.length - 1
                    : (index +
                        (e.key === "ArrowDown" ? 1 : -1) +
                        items.length) %
                      items.length
              ]?.focus();
            }}
          >
            {children(() => setOpen(false))}
          </div>,
          document.querySelector(".next-app") || document.body,
        )}
    </>
  );
}
