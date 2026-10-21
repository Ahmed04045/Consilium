import init, {
  start,
  command,
  receive_file,
} from "./generated/consilium_wordcraft.js";
const origin = location.origin;
let started = false;
const report = (kind, payload = "") => {
  if (kind === "pick_file") {
    if (
      payload === "document" &&
      !confirm(
        "Open a file in this workspace? This replaces the current document. Export a copy first if needed.",
      )
    )
      return;
    const picker = document.createElement("input");
    picker.type = "file";
    picker.accept =
      payload === "picture" ? "image/*" : ".docx,.odt,.rtf,.txt,.md";
    picker.addEventListener(
      "change",
      async () => {
        const file = picker.files?.[0];
        if (!file) return;
        if (file.size > 8_000_000)
          return report("error", "Files must be smaller than 8 MB.");
        try {
          receive_file(file.name, new Uint8Array(await file.arrayBuffer()));
        } catch {
          report("error", "This file could not be opened.");
        }
      },
      { once: true },
    );
    picker.click();
    return;
  }
  parent.postMessage({ source: "consilium-wordcraft", kind, payload }, origin);
};
addEventListener("message", async (event) => {
  if (
    event.source !== parent ||
    event.origin !== origin ||
    event.data?.source !== "consilium-host"
  )
    return;
  const { kind, payload } = event.data;
  try {
    if (kind === "load" && !started) {
      started = true;
      await init();
      await start(document.querySelector("canvas"), payload || "", report);
      document.querySelector("#status").remove();
      report("loaded");
    } else if (
      started &&
      ["snapshot", "export", "saved", "insert_text"].includes(kind)
    )
      command(kind, payload || "");
  } catch {
    report(
      "error",
      "The document editor could not start or read this document. Your saved content is unchanged.",
    );
  }
});
report("ready");
