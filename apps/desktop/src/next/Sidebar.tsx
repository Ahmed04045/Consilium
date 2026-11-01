import { ItemActions } from "./ItemActions";
import { useState } from "react";
import {
  Home,
  MessageSquare,
  Search,
  Plus,
  CalendarDays,
  Network,
  FileText,
  Settings,
  ChevronDown,
} from "lucide-react";
import { useWorkspace, TabDescriptor } from "./state";

export function Sidebar({ active }: { active?: TabDescriptor }) {
  const w = useWorkspace();
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("next-navigation-groups") || "{}");
    } catch {
      return {};
    }
  });
  const groups = [
    { kind: "calendar", title: "Calendars", icon: CalendarDays },
    { kind: "network", title: "Networks", icon: Network },
    { kind: "document", title: "Documents", icon: FileText },
  ];
  return (
    <aside className="nx-sidebar" aria-label="Workspace navigation">
      <button className="nx-brand" onClick={() => w.open("home")}>
        <img src="/app-icon.png" alt="" />
        Consilium
      </button>
      <button className="nx-create" onClick={() => w.create()}>
        <Plus size={16} />
        Create
        <span className="nx-keyhint" aria-hidden="true">
          Ctrl N
        </span>
      </button>
      <nav className="nx-primary-nav" aria-label="Main navigation">
        {[
          { kind: "home", label: "Home", icon: Home },
          { kind: "assistant", label: "Assistant", icon: MessageSquare },
          { kind: "search", label: "Search", icon: Search },
        ].map(({ kind, label, icon: Icon }) => (
          <button
            key={kind}
            aria-current={active?.kind === kind ? "page" : undefined}
            onClick={() => w.open(kind)}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </nav>
      <div className="nx-sidebar-library">
        {groups.map(({ kind, title, icon: Icon }) => {
          const all = (w.data[kind] || [])
            .filter((r) => !r.value.deleted)
            .slice()
            .sort((a, b) =>
              (b.updated_at || "").localeCompare(a.updated_at || ""),
            );
          const items = kind === "thread" ? all.slice(0, 6) : all;
          return (
            <section className="nx-nav-group" key={kind}>
              <button
                className="nx-nav-group-heading"
                aria-expanded={!collapsed[kind]}
                aria-controls={`nav-${kind}`}
                onClick={() => {
                  const next = { ...collapsed, [kind]: !collapsed[kind] };
                  setCollapsed(next);
                  localStorage.setItem(
                    "next-navigation-groups",
                    JSON.stringify(next),
                  );
                }}
              >
                <ChevronDown size={13} />
                <span>{title}</span>
                <small>{all.length}</small>
              </button>
              <div id={`nav-${kind}`} hidden={collapsed[kind]}>
                {items.map((r) => (
                  <ItemActions key={r.value.id} kind={kind} id={r.value.id}>
                    <button
                      key={r.value.id}
                      title={r.value.name || r.value.title}
                      aria-current={
                        active?.kind === kind && active.objectId === r.value.id
                          ? "page"
                          : undefined
                      }
                      onClick={() =>
                        w.open(kind, r.value.id, r.value.name || r.value.title)
                      }
                    >
                      <Icon size={15} />
                      <span>{r.value.name || r.value.title}</span>
                    </button>
                  </ItemActions>
                ))}
                {!items.length && (
                  <p className="nx-nav-empty">
                    No{" "}
                    {kind === "thread" ? "conversations" : title.toLowerCase()}{" "}
                    yet
                  </p>
                )}
              </div>
            </section>
          );
        })}
      </div>
      <div className="nx-side-bottom">
        <button
          aria-current={active?.kind === "settings" ? "page" : undefined}
          onClick={() => w.open("settings")}
        >
          <Settings size={17} />
          Settings
        </button>
      </div>
    </aside>
  );
}
