import type { IndexStatus, RecordValue, Settings } from "./types";
export type Task = {
  id: string;
  title: string;
  date: string;
  time: string;
  minutes: number;
  color: string;
  description: string;
  completed: boolean;
  label?: string;
};
export type Calendar = { id: string; name: string; tasks: Task[] };
export type Workspace = {
  labels?: { name: string; color: string }[];
  onboarded: boolean;
  timezone: string;
  calendars: Calendar[];
};
export type CalendarSnapshot = {
  workspace: RecordValue<Workspace>;
  settings: RecordValue<Settings>;
  indexes: IndexStatus[];
  vault: string;
};
export const dateKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const parseDate = (s: string) => new Date(`${s}T12:00:00`);
export const colors = ["gray", "blue", "green", "yellow", "purple", "red"];
export const newTask = (date: string): Task => ({
  id: crypto.randomUUID(),
  title: "",
  date,
  time: "",
  minutes: 30,
  color: "green",
  description: "",
  completed: false,
});
