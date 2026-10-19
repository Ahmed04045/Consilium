import { invoke } from "@tauri-apps/api/core";
import type { CalendarSnapshot } from "./calendar";
export const native = "__TAURI_INTERNALS__" in window;
export async function rpc<T>(
  action: string,
  payload: unknown = {},
  requestId: string = crypto.randomUUID(),
): Promise<T> {
  if (native) return invoke<T>("rpc", { requestId, action, payload });
  if (action === "calendar_snapshot")
    return {
      workspace: {
        revision: 0,
        value: {
          onboarded: false,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          calendars: [{ id: "default", name: "Calendar", tasks: [] }],
        },
      },
      settings: {
        revision: 0,
        value: {
          provider: "ollama",
          endpoint: "http://127.0.0.1:11434",
          chat_model: "",
          embedding_model: "",
          context_tokens: 8192,
        },
      },
      indexes: [],
      vault: "Desktop app only",
    } satisfies CalendarSnapshot as T;
  throw new Error(
    "Open the desktop app to save calendars or connect a local model.",
  );
}
export const cancel = (requestId: string) =>
  native ? invoke("cancel", { requestId }) : Promise.resolve();
