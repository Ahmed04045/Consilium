//! Bundled Wordcraft host. No network, filesystem, or Tauri capability is exposed here.
use std::{cell::RefCell, rc::Rc, time::Duration};
use wasm_bindgen::prelude::*;
use wordcraft_engine::Session;
use wordcraft_ui_egui::{Services, WordApp};

thread_local! {
    static COMMANDS: RefCell<Vec<(String, String)>> = const { RefCell::new(Vec::new()) };
    static RUNNER: RefCell<Option<eframe::WebRunner>> = const { RefCell::new(None) };
    static INBOX: RefCell<Option<wordcraft_ui_egui::Inbox>> = const { RefCell::new(None) };
}

#[wasm_bindgen]
pub fn receive_file(name: String, bytes: Vec<u8>) -> Result<(), JsValue> {
    if bytes.len() > 8_000_000 {
        return Err(JsValue::from_str("Files must be smaller than 8 MB"));
    }
    INBOX.with(|slot| {
        let inbox = slot.borrow();
        let inbox = inbox
            .as_ref()
            .ok_or_else(|| JsValue::from_str("Editor is not ready"))?;
        let mut queue = inbox
            .lock()
            .map_err(|_| JsValue::from_str("Editor is busy"))?;
        if !queue.is_empty() {
            return Err(JsValue::from_str("Wait for the previous file to open"));
        }
        queue.push((name, bytes));
        Ok(())
    })
}

#[wasm_bindgen]
pub fn command(name: String, payload: String) {
    COMMANDS.with(|q| {
        if q.borrow().len() < 20 && payload.len() < 8_000_000 {
            q.borrow_mut().push((name, payload));
        }
    });
}
fn notify(callback: &js_sys::Function, kind: &str, payload: &str) {
    let _ = callback.call2(
        &JsValue::NULL,
        &JsValue::from_str(kind),
        &JsValue::from_str(payload),
    );
}

#[wasm_bindgen]
pub async fn start(
    canvas: web_sys::HtmlCanvasElement,
    initial: String,
    callback: js_sys::Function,
) -> Result<(), JsValue> {
    let doc = if initial.is_empty() {
        wordcraft_doc::Document::from_text("")
    } else {
        serde_json::from_str(&initial).map_err(|_| {
            JsValue::from_str("Document could not be read. The saved version has been preserved.")
        })?
    };
    let callback = Rc::new(callback);
    let export_callback = callback.clone();
    let dirty_callback = callback.clone();
    let open_callback = callback.clone();
    let inbox = wordcraft_ui_egui::Inbox::default();
    INBOX.with(|slot| *slot.borrow_mut() = Some(inbox.clone()));
    let services = Services {
        pick_save: Some(Box::new(|suggested| Some(suggested.into()))),
        open_async: Some(Box::new(move |purpose| {
            notify(&open_callback, "pick_file", purpose)
        })),
        inbox: Some(inbox),
        download: Some(Box::new(move |name, bytes| {
            if bytes.len() > 8_000_000 {
                return Err("Export exceeds 8 MB".into());
            }
            let data = serde_json::json!({"name":name,"bytes":bytes});
            notify(&export_callback, "export", &data.to_string());
            Ok(())
        })),
        on_dirty: Some(Box::new(move |dirty| {
            if dirty {
                notify(&dirty_callback, "dirty", "");
            }
        })),
        ..Default::default()
    };
    let runner = eframe::WebRunner::new();
    runner
        .start(
            canvas,
            eframe::WebOptions::default(),
            Box::new(move |cc| {
                cc.egui_ctx.set_theme(egui::Theme::Dark);
                let mut app = WordApp::new(Session::new(doc), services);
                if !initial.is_empty() {
                    app.session.path = Some("Local workspace.docx".into());
                }
                app.autosave = false;
                let _ = app.run("ui.theme", serde_json::json!({"value":"dark"}));
                Ok(Box::new(Host {
                    app,
                    callback,
                    last_json: initial,
                    last_emit: 0.0,
                    fonts_installed: false,
                }))
            }),
        )
        .await
        .map_err(|e| JsValue::from_str(&format!("Editor could not start: {e:?}")))?;
    RUNNER.with(|r| *r.borrow_mut() = Some(runner));
    Ok(())
}
struct Host {
    app: WordApp,
    callback: Rc<js_sys::Function>,
    last_json: String,
    last_emit: f64,
    fonts_installed: bool,
}
impl Host {
    fn snapshot(&mut self) {
        match serde_json::to_string(&self.app.session.doc) {
            Ok(json) if json != self.last_json => {
                if json.len() > 8_000_000 {
                    notify(
                        &self.callback,
                        "error",
                        "Document exceeds the 8 MB workspace limit. Export it to keep a copy.",
                    );
                    return;
                }
                self.last_json = json.clone();
                let text = self
                    .app
                    .session
                    .doc
                    .plain_text(wordcraft_doc::StoryRef::Body);
                notify(&self.callback,"snapshot",&serde_json::json!({"document":json,"text":text.chars().take(32000).collect::<String>()}).to_string());
            }
            Err(_) => notify(
                &self.callback,
                "error",
                "The document could not be serialized. Export or retry before closing.",
            ),
            _ => {}
        }
    }
}
impl eframe::App for Host {
    fn logic(&mut self, ctx: &egui::Context, _: &mut eframe::Frame) {
        let commands = COMMANDS.with(|q| std::mem::take(&mut *q.borrow_mut()));
        for (name, payload) in commands {
            match name.as_str() {
                "snapshot" => self.snapshot(),
                "saved" => {
                    if self.last_json == payload
                        && serde_json::to_string(&self.app.session.doc).ok().as_deref()
                            == Some(payload.as_str())
                    {
                        self.app.session.dirty = false;
                        // A virtual document name: persistence is owned by the host, not a disk path.
                        self.app.session.path = Some("Local workspace.docx".into());
                        notify(&self.callback, "clean", &payload);
                    }
                }
                "export" => {
                    match wordcraft_engine::io::save_bytes("document.docx", &self.app.session.doc) {
                        Ok(bytes) => notify(
                            &self.callback,
                            "export",
                            &serde_json::json!({"name":"document.docx","bytes":bytes}).to_string(),
                        ),
                        Err(e) => notify(&self.callback, "error", &e),
                    }
                }
                "insert_text" => {
                    if payload.len() <= 32000 {
                        let _ = self
                            .app
                            .run("text.insert", serde_json::json!({"text":payload}));
                    }
                }
                _ => {}
            }
        }
        self.app.logic(ctx);
        if !self.fonts_installed {
            // Keep document typography editable, but use the app's font for editor controls.
            if let Ok(bytes) = wuff::decompress_woff2(include_bytes!(
                "../../../node_modules/@fontsource-variable/google-sans/files/google-sans-latin-wght-normal.woff2"
            )) {
                let mut fonts = egui::FontDefinitions::default();
                fonts.font_data.insert(
                    "Google Sans".into(),
                    std::sync::Arc::new(egui::FontData::from_owned(bytes)),
                );
                for family in [
                    egui::FontFamily::Proportional,
                    egui::FontFamily::Monospace,
                    egui::FontFamily::Name("medium".into()),
                    egui::FontFamily::Name("semibold".into()),
                ] {
                    fonts
                        .families
                        .entry(family)
                        .or_default()
                        .insert(0, "Google Sans".into());
                }
                ctx.set_fonts(fonts);
            }
            self.fonts_installed = true;
        }
        let now = ctx.input(|i| i.time);
        if now - self.last_emit >= 0.35 {
            self.snapshot();
            self.last_emit = now;
        }
        ctx.request_repaint_after(Duration::from_millis(350));
    }
    fn raw_input_hook(&mut self, _: &egui::Context, input: &mut egui::RawInput) {
        self.app.raw_input_hook(input);
    }
    fn ui(&mut self, ui: &mut egui::Ui, _: &mut eframe::Frame) {
        self.app.ui(ui);
    }
}
