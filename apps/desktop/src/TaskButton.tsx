import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import type { Task } from "./calendar";
export function TaskButton({
  task,
  children,
  onOpen,
  onComplete,
  className,
  style,
  disabled = false,
}: {
  task: Task;
  children: ReactNode;
  onOpen: () => void;
  onComplete: () => void;
  className: string;
  style?: CSSProperties;
  disabled?: boolean;
}) {
  const [card, setCard] = useState<{ left: number; top: number } | null>(null);
  const trigger = useRef<HTMLButtonElement>(null),
    hover = useRef<HTMLDivElement>(null),
    timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const clear = () => {
    if (timer.current) clearTimeout(timer.current);
  };
  useEffect(() => () => clear(), []);
  function show() {
    clear();
    timer.current = setTimeout(() => {
      const box = trigger.current?.getBoundingClientRect();
      if (box)
        setCard({
          left: Math.min(Math.max(12, box.left), innerWidth - 332),
          top: Math.min(box.bottom + 8, innerHeight - 250),
        });
    }, 650);
  }
  function hide() {
    clear();
    timer.current = setTimeout(() => setCard(null), 180);
  }
  return (
    <>
      <button
        ref={trigger}
        className={className}
        style={style}
        onClick={() => {
          clear();
          setCard(null);
          onOpen();
        }}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={(e) => {
          if (!hover.current?.contains(e.relatedTarget)) hide();
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            clear();
            setCard(null);
          }
          if (e.key === "ArrowDown" && card) {
            e.preventDefault();
            hover.current?.querySelector<HTMLButtonElement>("button")?.focus();
          }
        }}
        aria-haspopup="dialog"
        aria-expanded={!!card}
      >
        {children}
      </button>
      {card &&
        createPortal(
          <div
            ref={hover}
            className="task-hover-card"
            style={card}
            role="dialog"
            aria-label={`Task preview: ${task.title}`}
            onMouseEnter={clear}
            onMouseLeave={hide}
            onFocus={clear}
            onBlur={(e) => {
              if (!e.currentTarget.contains(e.relatedTarget)) hide();
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setCard(null);
                trigger.current?.focus();
                clear();
              }
            }}
          >
            <strong>{task.title}</strong>
            <p>
              {task.date} · {task.time || "All day"} · {task.minutes} min
            </p>
            {task.label && <span className="muted">{task.label}</span>}
            {task.description && (
              <p className="hover-description">{task.description}</p>
            )}
            <div className="hover-actions">
              <button
                disabled={disabled}
                className="primary"
                onClick={(e) => {
                  e.stopPropagation();
                  onComplete();
                }}
              >
                {task.completed ? "Mark incomplete" : "Complete"}
              </button>
              <button
                onClick={() => {
                  setCard(null);
                  onOpen();
                }}
              >
                Open task
              </button>
            </div>
          </div>,
          document.querySelector(".app-shell") || document.body,
        )}
    </>
  );
}
