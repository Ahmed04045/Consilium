import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
export type EditorCommand = { send: (kind: string, payload?: string) => void };
export type DocumentSnapshot = { document: string; text: string };
export const WordcraftEditor = forwardRef<
  EditorCommand,
  {
    initial: string;
    onSnapshot: (v: DocumentSnapshot) => void;
    onDirty: () => void;
    onClean: (document: string) => void;
    onError: (s: string) => void;
    onExport: (v: { name: string; bytes: number[] }) => void;
  }
>((props, ref) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef(props);
  latest.current = props;
  function send(kind: string, payload = "") {
    frame.current?.contentWindow?.postMessage(
      { source: "consilium-host", kind, payload },
      location.origin,
    );
  }
  useImperativeHandle(ref, () => ({ send }));
  useEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== location.origin ||
        event.data?.source !== "consilium-wordcraft"
      )
        return;
      const { kind, payload } = event.data;
      if (kind === "ready") send("load", latest.current.initial);
      else if (kind === "dirty") latest.current.onDirty();
      else if (kind === "clean") latest.current.onClean(String(payload));
      else if (kind === "error") latest.current.onError(String(payload));
      else if (kind === "snapshot" || kind === "export") {
        try {
          const value = JSON.parse(payload);
          if (kind === "snapshot") latest.current.onSnapshot(value);
          else latest.current.onExport(value);
        } catch {
          latest.current.onError(
            "Invalid editor response. Export your work before closing.",
          );
        }
      }
    }
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, []);
  return (
    <iframe
      ref={frame}
      title="Main document editor"
      src="/wordcraft/index.html"
      className="wordcraft-frame"
      sandbox="allow-scripts allow-same-origin allow-downloads allow-modals"
    />
  );
});
