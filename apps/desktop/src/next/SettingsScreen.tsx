import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Palette,
  Bot,
  User,
  Folder,
  Puzzle,
  BookOpen,
  Search,
} from "lucide-react";
import { PhoneAccount } from "./PhoneAccount";
import { SettingsView } from "./WorkspaceViews";
import { row, useWorkspace } from "./state";
import { version } from "../../package.json";
import releaseNotes from "../../../../docs/next-release-notes.md?raw";
const sections = [
  ["appearance", "Appearance", Palette, "theme color font calendar density"],
  ["models", "AI models", Bot, "provider key profile credential"],
  [
    "personal",
    "Profile & context",
    User,
    "account phone sync preferences history",
  ],
  [
    "data",
    "Files & backups",
    Folder,
    "storage folder binding import export recovery",
  ],
  ["addons", "Add-ons", Puzzle, "extensions plugins"],
  [
    "help",
    "Help & about",
    BookOpen,
    "shortcuts keyboard version troubleshooting updates license",
  ],
] as const;
const sectionFor = (page: string) =>
  ["account", "context"].includes(page)
    ? "personal"
    : ["files", "storage"].includes(page)
      ? "data"
      : ["shortcuts", "about", "whats-new", "troubleshooting"].includes(page)
        ? "help"
        : page;
export function SettingsScreen({
  page,
  onPage,
  onBack,
}: {
  page: string;
  onPage: (page: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState("");
  const selected = sectionFor(page);
  const content = useRef<HTMLElement>(null);
  useEffect(() => {
    content.current?.scrollTo({ top: 0 });
  }, [page]);
  const matches = sections.filter(([, title, , keywords]) =>
    query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .every((word) => (title + " " + keywords).toLowerCase().includes(word)),
  );
  const w = useWorkspace();
  const [name, setName] = useState(
    row(w.data, "layout", "local-account")?.value.name || "",
  );
  const [saved, setSaved] = useState(false);
  return (
    <div className="nx-settings-screen">
      <aside className="nx-settings-nav" aria-label="Settings navigation">
        <div className="nx-settings-back">
          <button className="nx-back-app" onClick={onBack}>
            <ArrowLeft size={17} />
            Back to app
          </button>
        </div>
        <div className="nx-settings-search">
          <Search size={15} />
          <input
            aria-label="Find a setting"
            placeholder="Find a setting"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <small>Settings</small>
        <nav>
          {matches.map(([id, title, Icon]) => (
            <button
              key={id}
              aria-current={selected === id ? "page" : undefined}
              onClick={() => onPage(id)}
            >
              <Icon size={17} />
              {title}
            </button>
          ))}
        </nav>
        {query && matches.length === 0 && <p>No matching settings.</p>}
      </aside>
      <main ref={content} className="nx-settings-content">
        <div className="nx-settings-heading">
          <h1>
            {page === "shortcuts"
              ? "Keyboard shortcuts"
              : page === "about"
                ? "About Consilium"
                : page === "whats-new"
                  ? "What’s new"
                  : page === "troubleshooting"
                    ? "Troubleshooting"
                    : sections.find(([id]) => id === selected)?.[1] ||
                      "Settings"}
          </h1>
          <p>
            {selected === "personal"
              ? "Your profile, assistant preferences and phone connection."
              : selected === "data"
                ? "Manage connected files, portable projects and recovery copies."
                : selected === "models"
                  ? "Choose how conversations and workflows connect to AI."
                  : selected === "appearance"
                    ? "Adjust the workspace to suit how you work."
                    : selected === "addons"
                      ? "Manage the tools available to your workflows."
                      : "Find answers, shortcuts and information about this build."}
          </p>
        </div>
        <div className="nx-settings-extra" hidden={selected !== "personal"}>
          <section>
            <h2>Profile</h2>
            <p>Save a display name for your profile.</p>
            <label>
              Display name
              <input
                maxLength={100}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  setSaved(false);
                }}
              />
            </label>
            <button
              className="nx-primary"
              onClick={() =>
                void w
                  .save("layout", { id: "local-account", name: name.trim() })
                  .then(() => setSaved(true))
                  .catch(w.error)
              }
            >
              Save profile
            </button>
            {saved && <p role="status">Profile saved</p>}
          </section>
        </div>
        <SettingsView page={selected} />
        {selected === "personal" && (
          <div className="nx-settings-extra">
            <PhoneAccount />
          </div>
        )}
        <div className="nx-settings-extra" hidden={selected !== "help"}>
          <details
            className="nx-settings-disclosure"
            open={page === "shortcuts"}
          >
            <summary>Keyboard shortcuts</summary>
            <section className="nx-shortcuts">
              {[
                ["Create", "Ctrl+N"],
                ["Search workspace", "Ctrl+K / Ctrl+F"],
                ["Assistant", "Ctrl+P"],
                ["Settings", "Ctrl+,"],
                ["Toggle sidebar", "Ctrl+Shift+S"],
                ["Previous / next tab", "Ctrl+PageUp / Ctrl+PageDown"],
                ["Close tab", "Ctrl+W"],
                ["Back / forward", "Alt+Left / Alt+Right"],
                ["Zoom in / out", "Ctrl++ / Ctrl+-"],
                ["Actual size", "Ctrl+0"],
                ["Full screen", "F11"],
                ["Undo / redo text or graph edit", "Ctrl+Z / Ctrl+Y"],
                ["Send message", "Ctrl+Enter"],
                ["Close menu or dialog", "Escape"],
              ].map(([action, shortcut]) => (
                <div key={action}>
                  <span>{action}</span>
                  <kbd>{shortcut}</kbd>
                </div>
              ))}
            </section>
          </details>
        </div>
        <div className="nx-settings-extra" hidden={selected !== "help"}>
          {page === "whats-new" ? (
            <section>
              <div className="nx-release-notes">
                {releaseNotes.split(/\r?\n/).map((line, i) =>
                  line.startsWith("# ") ? (
                    <h2 key={i}>{line.slice(2)}</h2>
                  ) : line.startsWith("## ") ? (
                    <h3 key={i}>{line.slice(3)}</h3>
                  ) : line.startsWith("- ") ? (
                    <p className="nx-release-item" key={i}>
                      {line.slice(2)}
                    </p>
                  ) : line.trim() ? (
                    <p key={i}>{line}</p>
                  ) : null,
                )}
              </div>
            </section>
          ) : (
            <>
              <section>
                <h2>Workspaces</h2>
                <p>
                  Create calendars or networks from Create. Tasks and documents
                  open in tabs; conversations stay in the Assistant. Save as
                  creates a portable project file; drafts are kept locally as
                  you work.
                </p>
              </section>
              <section>
                <h2>Assistant</h2>
                <p>
                  Choose a destination and a saved AI model. Ask a question or
                  request changes in ordinary language. Review proposed changes
                  before applying them. Attach files and choose Share contents
                  when the model needs to read them.
                </p>
              </section>
              <section>
                <h2>Networks and documents</h2>
                <p>
                  Drag nodes from the library, then connect an output pin to an
                  input pin. Use Review & run to inspect permissions and start
                  execution. Paused approvals appear inside the expanded run in
                  the run console. The document editor provides its own editing
                  toolbar and shortcuts.
                </p>
              </section>
              <section>
                <h2>Recovering from problems</h2>
                <p>
                  If a model request fails, check the exact model ID and
                  selected credential under AI models. Retry a temporary
                  provider failure. For context limits, use fewer attachments or
                  implement one node at a time. A failed proposal does not apply
                  changes.
                </p>
                <p>
                  Use Files & backups to create a backup or export your records.
                  Resolve document conflict prompts before closing a document.
                </p>
              </section>
            </>
          )}
        </div>
        <div className="nx-settings-extra" hidden={selected !== "help"}>
          <section>
            <img className="nx-about-icon" src="/app-icon.png" alt="" />
            <h2>Consilium Next</h2>
            <p>Version {version} · Windows</p>
            <p>
              A local workspace for calendars, documents, conversations and
              executable workflows.
            </p>
            <p>
              Core application: MIT license. Wordcraft and bundled dependencies
              retain their own licenses.
            </p>
            <p className="nx-muted">
              This build is unsigned. Updates are installed manually; there is
              no automatic updater.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
