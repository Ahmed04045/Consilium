import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Bot,
  Code2,
  FileInput,
  FileOutput,
  FolderOpen,
  CalendarDays,
  CalendarPlus,
  FileText,
  FilePenLine,
  Download,
  GitBranch,
  Split,
  Merge,
  Repeat2,
  ShieldCheck,
  Hand,
  Puzzle,
  type LucideIcon,
} from "lucide-react";
import { Data } from "./state";

export const catalog: Record<
  string,
  { title: string; group: string; icon: LucideIcon; description: string }
> = {
  addon: {
    title: "Program add-on",
    group: "Extensions",
    icon: Puzzle,
    description:
      "Run an installed, reviewed Node/Python/Godot adapter. Input and output are checked against its contract.",
  },
  goal_context: {
    title: "Goal & progress context",
    group: "Calendars",
    icon: CalendarDays,
    description:
      "Read a bounded calendar window including recurring exceptions, recorded progress and optional preferences/document excerpts.",
  },
  network_read: {
    title: "Read network",
    group: "Networks",
    icon: GitBranch,
    description:
      "Read a saved network revision for a planner or reviewing agent.",
  },
  network_change: {
    title: "Propose network revision",
    group: "Networks",
    icon: GitBranch,
    description:
      "Validate a complete graph and propose a new revision for human review. The active run is unchanged.",
  },
  planner: {
    title: "Planner / decomposition",
    group: "AI & processing",
    icon: Bot,
    description:
      "Draft a complete bounded network from a goal or existing graph. Connect to Propose network revision for validation and review.",
  },
  input: {
    title: "Input",
    group: "Start & finish",
    icon: ArrowDownToLine,
    description: "Start with the data entered when you run this network.",
  },
  output: {
    title: "Output",
    group: "Start & finish",
    icon: ArrowUpFromLine,
    description: "Keep the previous node's result in the run console.",
  },
  agent: {
    title: "AI agent",
    group: "AI & processing",
    icon: Bot,
    description:
      "Send incoming data and your instructions to a chosen model. Pass its answer to the next node.",
  },
  process: {
    title: "Process",
    group: "AI & processing",
    icon: Code2,
    description:
      "Transform data with a simple operation or a Python/JavaScript program. Connect its result to a file, document or calendar node to save changes.",
  },
  file_read: {
    title: "Read file",
    group: "Files & documents",
    icon: FileInput,
    description: "Read an explicitly linked local file as text or JSON.",
  },
  folder_read: {
    title: "List folder",
    group: "Files & documents",
    icon: FolderOpen,
    description:
      "List file names in a linked folder. This does not read their contents.",
  },
  file_write: {
    title: "Write file",
    group: "Files & documents",
    icon: FileOutput,
    description:
      "Save incoming text or JSON to a writable local file chosen by you.",
  },
  document_read: {
    title: "Read document",
    group: "Files & documents",
    icon: FileText,
    description: "Read a saved Wordcraft document for the next step.",
  },
  document_write: {
    title: "Write document",
    group: "Files & documents",
    icon: FilePenLine,
    description:
      "Create or update a Wordcraft document from incoming text or structured blocks.",
  },
  document_export: {
    title: "Export document",
    group: "Files & documents",
    icon: Download,
    description: "Export a saved Wordcraft document as a DOCX run artifact.",
  },
  calendar_read: {
    title: "Read calendar",
    group: "Calendars",
    icon: CalendarDays,
    description: "Read tasks from the selected calendar.",
  },
  calendar_change: {
    title: "Propose calendar changes",
    group: "Calendars",
    icon: CalendarPlus,
    description:
      "Turn incoming task changes into a proposal. Review and accept it before the calendar changes.",
  },
  condition: {
    title: "Condition",
    group: "Logic & control",
    icon: GitBranch,
    description:
      "Compare a value in the incoming data. Continue through the Yes or No pin.",
  },
  parallel: {
    title: "Branch",
    group: "Logic & control",
    icon: Split,
    description: "Send the same data to several connected steps.",
  },
  join: {
    title: "Join",
    group: "Logic & control",
    icon: Merge,
    description:
      "Wait for connected active branches and collect their results.",
  },
  loop: {
    title: "Repeat",
    group: "Logic & control",
    icon: Repeat2,
    description:
      "Run a nested workflow until its stop condition matches or its iteration limit is reached. Edit the nested graph under Advanced.",
  },
  validate: {
    title: "Check data",
    group: "Logic & control",
    icon: ShieldCheck,
    description:
      "Check incoming JSON against a schema. Stop the run if it does not match.",
  },
  approval: {
    title: "Ask for approval",
    group: "Logic & control",
    icon: Hand,
    description:
      "Pause this run until you approve continuing. Pass the incoming data onward.",
  },
};
export const groups = [...new Set(Object.values(catalog).map((n) => n.group))];
export function nodeSummary(node: Data) {
  const c = node.config;
  if (node.kind === "process")
    return c.operation === "select_fields"
      ? "Keep selected fields"
      : c.operation === "format_text"
        ? "Format text"
        : c.script_binding
          ? "Linked program"
          : `${c.extension === "js" ? "JavaScript" : "Python"} program`;
  if (node.kind === "condition")
    return `${c.pointer || "/value"} = ${JSON.stringify(c.equals)}`;
  if (node.kind === "loop") return `Up to ${c.max_iterations || 5} repetitions`;
  return catalog[node.kind]?.title || node.kind;
}
