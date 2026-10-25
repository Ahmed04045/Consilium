import { chromium, expect } from "@playwright/test";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { createServer } from "node:http";
import assert from "node:assert/strict";
import { learning, codeData } from "../../../tests/fixtures/next-networks.mjs";
let sequence = 0,
  mode = "normal",
  requests = [];
const task = (id, overrides = {}) => ({
  id,
  calendar_id: "fixture-calendar",
  title: "Vocabulary practice",
  kind: "flexible",
  start_date: "2026-10-22",
  end_date: "2026-10-22",
  start_time: "",
  end_time: "",
  timezone: "Asia/Qatar",
  label_id: null,
  parent_id: null,
  color: "green",
  description: "Synthetic acceptance task",
  completed: false,
  steps: [],
  target: null,
  progress: 0,
  unit: "",
  recurrence: null,
  deleted: false,
  ...overrides,
});
const server = createServer(async (req, res) => {
  let text = "";
  for await (const c of req) text += c;
  const body = text ? JSON.parse(text) : {};
  res.setHeader("Content-Type", "application/json");
  if (req.url === "/api/tags")
    return res.end(
      JSON.stringify({
        models: [{ name: "fixture-model", digest: "synthetic-v1" }],
      }),
    );
  if (req.url === "/api/show") return res.end("{}");
  if (req.url !== "/api/chat") {
    res.statusCode = 404;
    return res.end("{}");
  }
  requests.push(body);
  let content;
  const system = body.messages?.[0]?.content || "",
    prompt = body.messages?.at(-1)?.content || "";
  if (mode === "invalid") content = "{";
  else if (mode === "network-proposal") {
    const destination = JSON.parse(prompt).context.destination;
    const graph = {
      ...destination.value,
      nodes: [
        {
          id: "input",
          kind: "input",
          title: "Input",
          config: {},
          position: { x: 0, y: 0 },
        },
        {
          id: "output",
          kind: "output",
          title: "Output",
          config: {},
          position: { x: 260, y: 0 },
        },
      ],
      edges: [
        {
          id: "edge",
          source: "input",
          target: "output",
          source_port: "out",
          target_port: "in",
        },
      ],
    };
    content = JSON.stringify({
      reply: "Review this proposed network.",
      changes: [
        {
          kind: "network",
          id: graph.id,
          expected_revision: destination.revision,
          value_json: JSON.stringify(graph),
        },
      ],
    });
  } else if (system.includes("PLAN_STUDY")) {
    const prefix = `study-${++sequence}`,
      goal = task(`${prefix}-goal`, {
        kind: "goal",
        end_date: "2026-10-28",
        target: 200,
        unit: "words",
        steps: [
          {
            id: `${prefix}-step`,
            title: "Revise without double counting",
            completed: false,
          },
        ],
      }),
      session = task(`${prefix}-session`, {
        kind: "timed",
        start_time: "09:00",
        end_time: "09:30",
        recurrence: {
          frequency: "weekly",
          interval: 1,
          weekdays: [3],
          count: 4,
          until: null,
        },
      }),
      child = task(`${prefix}-child`, {
        parent_id: goal.id,
        start_date: "2026-10-23",
        end_date: "2026-10-23",
      });
    content = JSON.stringify({
      approved: false,
      blocks: [
        { kind: "heading", level: 1, text: "Study guide" },
        {
          kind: "paragraph",
          text: "Read, recall and revise the supplied text.",
        },
        {
          kind: "list",
          ordered: true,
          items: ["Learn 100 words", "Recall the next day"],
        },
        {
          kind: "table",
          rows: [
            ["Day", "Focus"],
            ["Thursday", "Recall"],
          ],
        },
      ],
      changes: [goal, session, child].map((t) => ({
        kind: "task",
        id: t.id,
        expected_revision: 0,
        value: t,
      })),
    });
  } else if (system.includes("REVIEW_STUDY")) {
    const input = JSON.parse(prompt).input;
    content = JSON.stringify({ ...input, approved: true });
  } else if (system.includes("INTERPRET_DATA")) {
    const input = JSON.parse(prompt).input;
    content = JSON.stringify({
      blocks: [
        { kind: "heading", level: 1, text: "Data report" },
        {
          kind: "paragraph",
          text: `${input.count} rows total ${input.total}.`,
        },
      ],
    });
  } else
    content = JSON.stringify({
      reply: "The selected calendar is ready. No changes have been applied.",
      changes: [],
    });
  res.end(JSON.stringify({ message: { content }, done: true }));
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const root = mkdtempSync(join(tmpdir(), "consilium-next-acceptance-")),
  vault = join(root, "Consilium Next");
writeFileSync(
  join(root, "reading.txt"),
  "Synthetic reading: retrieval practice and spaced repetition support vocabulary recall.",
);
writeFileSync(
  join(root, "data.json"),
  JSON.stringify([{ value: 2 }, { value: 3 }, { value: 5 }]),
);
const child = spawn(
  process.env.CONSILIUM_NEXT_BINARY ||
    resolve("../../target/release/consilium-next.exe"),
  [],
  {
    windowsHide: true,
    env: {
      ...process.env,
      LOCALAPPDATA: root,
      WEBVIEW2_USER_DATA_FOLDER: join(root, "webview"),
      WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: "--remote-debugging-port=1543",
    },
  },
);
let browser;
try {
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch("http://127.0.0.1:1543/json/version")).ok) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  browser = await chromium.connectOverCDP("http://127.0.0.1:1543");
  let page;
  for (let i = 0; i < 50; i++) {
    page = browser
      .contexts()[0]
      .pages()
      .find((p) => !p.url().startsWith("about:"));
    if (page) break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert(page);
  page.on("pageerror", (e) => console.error("UI error:", e.message));
  console.log("Native page", page.url());
  try {
    await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  } catch (e) {
    console.log((await page.locator("body").innerText()).slice(0, 2500));
    await page.screenshot({
      path: "../../docs/screenshots/next-startup-failure.png",
    });
    throw e;
  }
  assert.equal(await page.locator("iframe").count(), 0);
  const rpc = (action, payload = {}) =>
    page.evaluate(
      ({ action, payload }) =>
        window.__TAURI_INTERNALS__.invoke("rpc", {
          action,
          payload,
          requestId: crypto.randomUUID(),
        }),
      { action, payload },
    );
  const save = (kind, value) => rpc("next_save", { kind, value, revision: 0 });
  await save("calendar", {
    id: "fixture-calendar",
    name: "Learning acceptance",
    timezone: "Asia/Qatar",
  });
  await save("profile", {
    id: "fixture-profile",
    name: "Synthetic local model",
    provider: "ollama",
    model: "fixture-model",
    endpoint: `http://127.0.0.1:${server.address().port}`,
    context_tokens: 32768,
    credential_id: null,
  });
  for (const b of [
    {
      id: "fixture-reading",
      name: "Reading",
      kind: "file",
      path: join(root, "reading.txt"),
      writable: false,
    },
    {
      id: "fixture-data",
      name: "Data",
      kind: "file",
      path: join(root, "data.json"),
      writable: false,
    },
    {
      id: "fixture-output",
      name: "Report artifact",
      kind: "file",
      path: join(root, "report.json"),
      writable: true,
    },
    {
      id: "fixture-node",
      name: "Node runtime",
      kind: "executable",
      path: process.execPath,
      writable: false,
    },
  ])
    await save("binding", b);
  const scriptNode = codeData.nodes.find((n) => n.kind === "process");
  writeFileSync(join(root, "program.js"), scriptNode.config.source);
  await save("binding", {
    id: "fixture-script",
    name: "Program file",
    kind: "file",
    path: join(root, "program.js"),
    writable: false,
  });
  scriptNode.config.script_binding = "fixture-script";
  delete scriptNode.config.source;
  for (const graph of [learning, codeData]) await save("network", graph);
  for (const graph of [learning, codeData]) {
    const review = await rpc("next_network_review", { id: graph.id });
    const result = await rpc("next_network_run", {
      network_id: graph.id,
      revision: review.plan.revision,
      approval_digest: review.approval_digest,
      input: {},
    });
    assert.equal(result.status, "completed", JSON.stringify(result.nodes));
    if (graph === learning) {
      const proposal = result.nodes.weekly_plan.output.proposal_id;
      assert.equal((await rpc("next_snapshot")).task.length, 0);
      await rpc("next_accept_changes", { id: proposal });
      assert.equal((await rpc("next_snapshot")).task.length, 3);
    } else {
      assert.equal(result.nodes.invalid.state, "skipped");
      assert(existsSync(join(root, "report.json")));
      assert(
        readFileSync(join(root, "report.json"), "utf8").includes(
          "3 rows total 10",
        ),
      );
    }
  }
  // Full retained conversation, repair failure and no-mutation checks.
  await save("thread", {
    id: "thread-fixture",
    title: "Synthetic chat",
    scope: "calendar:fixture-calendar",
    mode: "schedule_chat",
    profile_id: "fixture-profile",
    messages: [],
    summary: "",
    summary_sources: [],
  });
  await rpc("next_send", {
    thread_id: "thread-fixture",
    revision: 1,
    request: "Discuss this schedule.",
  });
  mode = "invalid";
  const before = (
    await rpc("next_get", { kind: "thread", id: "thread-fixture" })
  ).revision;
  const callCount = requests.length;
  await assert.rejects(() =>
    rpc("next_send", {
      thread_id: "thread-fixture",
      revision: before,
      request: "Try malformed output.",
    }),
  );
  assert.equal(requests.length - callCount, 2);
  assert.equal(
    (await rpc("next_get", { kind: "thread", id: "thread-fixture" })).revision,
    before,
  );
  mode = "normal";
  // CLI shares the same vault, profiles, compiler and runner while desktop stays open.
  const cli =
    process.env.CONSILIUM_NEXT_CLI ||
    resolve("../../target/release/consilium.exe");
  assert(existsSync(cli), "Build the CLI before this test");
  const cliCall = (args) =>
    new Promise((resolve, reject) => {
      const p = spawn(cli, ["--vault", vault, ...args], { windowsHide: true });
      let out = "",
        err = "";
      p.stdout.on("data", (c) => (out += c));
      p.stderr.on("data", (c) => (err += c));
      p.on("close", (code) =>
        code === 0 ? resolve(JSON.parse(out)) : reject(Error(err || out)),
      );
    });
  for (const graph of [learning, codeData]) {
    const review = await cliCall(["review", graph.id]);
    const config = join(root, `${graph.id}-approved.json`);
    writeFileSync(
      config,
      JSON.stringify({
        network_id: graph.id,
        revision: review.plan.revision,
        approval_digest: review.approval_digest,
        input: {},
      }),
    );
    const result = await cliCall(["run", config]);
    assert.equal(result.status, "completed");
    if (graph === learning) {
      const proposal = result.nodes.weekly_plan.output.proposal_id;
      const inspected = await cliCall([
        "inspect",
        proposal,
        "--kind",
        "changeset",
      ]);
      assert.equal(inspected.value.changes.length, 3);
      await cliCall(["accept", proposal, "--approve"]);
    }
  }
  assert.equal((await cliCall(["runs"])).length, 4);
  await save("network", {
    schema_version: 1,
    id: "simple-processes",
    name: "Simple operations",
    limits: learning.limits,
    nodes: [
      {
        id: "input",
        kind: "input",
        title: "Input",
        config: {},
        position: { x: 0, y: 0 },
      },
      {
        id: "keep",
        kind: "process",
        title: "Keep fields",
        config: { operation: "select_fields", fields: ["title"] },
        position: { x: 220, y: 0 },
      },
      {
        id: "format",
        kind: "process",
        title: "Format",
        config: { operation: "format_text", template: "Result: {{title}}" },
        position: { x: 440, y: 0 },
      },
      {
        id: "output",
        kind: "output",
        title: "Output",
        config: {},
        position: { x: 660, y: 0 },
      },
      {
        id: "document",
        kind: "document_write",
        title: "Save formatted text",
        config: { title: "Simple process report" },
        position: { x: 660, y: 180 },
      },
    ],
    edges: [
      ["input", "keep"],
      ["keep", "format"],
      ["format", "output"],
      ["format", "document"],
    ].map(([source, target], i) => ({
      id: `simple-${i}`,
      source,
      target,
      source_port: "out",
      target_port: "in",
    })),
  });
  const simpleReview = await rpc("next_network_review", {
    id: "simple-processes",
  });
  const simpleRun = await rpc("next_network_run", {
    network_id: "simple-processes",
    revision: simpleReview.plan.revision,
    approval_digest: simpleReview.approval_digest,
    input: { title: "Example", private: "omit" },
  });
  assert.equal(simpleRun.status, "completed");
  assert.deepEqual(simpleRun.nodes.keep.output, { title: "Example" });
  assert.equal(simpleRun.nodes.output.output, "Result: Example");
  assert.equal(
    (
      await rpc("next_get", {
        kind: "document",
        id: simpleRun.nodes.document.output.document_id,
      })
    ).value.text.trim(),
    "Result: Example",
  );

  await save("network", {
    schema_version: 1,
    id: "ai-network",
    name: "AI draft check",
    nodes: [],
    edges: [],
    limits: learning.limits,
  });
  await save("thread", {
    id: "network-thread",
    title: "Design a network",
    scope: "network:ai-network",
    mode: "schedule_chat", // Legacy network threads must route to graph authoring.
    profile_id: "fixture-profile",
    messages: [],
    summary: "",
    summary_sources: [],
  });
  mode = "network-proposal";
  await rpc("next_send", {
    thread_id: "network-thread",
    revision: 1,
    request: "Draft a simple input/output workflow.",
  });
  mode = "normal";
  const networkRequest = JSON.parse(requests.at(-1).messages.at(-1).content);
  assert.equal(networkRequest.context.mode, "network_creation");
  assert(
    requests
      .at(-1)
      .messages[0].content.includes("You CAN create and revise graphs"),
  );
  const proposed = (
    await rpc("next_get", { kind: "thread", id: "network-thread" })
  ).value.messages.at(-1).proposal_id;
  assert.equal(
    (await rpc("next_get", { kind: "network", id: "ai-network" })).value.nodes
      .length,
    0,
  );
  await rpc("next_accept_changes", { id: proposed });
  assert.equal(
    (await rpc("next_get", { kind: "network", id: "ai-network" })).value.nodes
      .length,
    2,
  );
  const packagePath = join(root, "portable.json");
  await cliCall(["export", learning.id, packagePath, "--include-scripts"]);
  const exported = readFileSync(packagePath, "utf8");
  assert(!exported.includes(root));
  assert(!exported.includes("credential_id"));
  const runCountBeforeImport = (await cliCall(["runs"])).length;
  const imported = await cliCall(["import", packagePath]);
  assert.notEqual(imported.value.id, learning.id);
  assert.equal((await cliCall(["runs"])).length, runCountBeforeImport);

  const study = (await rpc("next_snapshot")).document.find(
    (r) => r.value.title === "Synthetic study guide",
  );
  const chosenDocx = join(root, "chosen-study.docx");
  await save("binding", {
    id: "docx-destination",
    name: "Selected DOCX output",
    kind: "file",
    writable: true,
    path: chosenDocx,
  });
  await save("network", {
    schema_version: 1,
    id: "docx-export",
    name: "DOCX export check",
    nodes: [
      {
        id: "export",
        kind: "document_export",
        title: "Export study",
        config: { document_id: study.value.id, binding_id: "docx-destination" },
        position: { x: 0, y: 0 },
      },
    ],
    edges: [],
    limits: learning.limits,
  });
  const exportReview = await rpc("next_network_review", { id: "docx-export" });
  const exportedRun = await rpc("next_network_run", {
    network_id: "docx-export",
    revision: exportReview.plan.revision,
    approval_digest: exportReview.approval_digest,
    input: {},
  });
  assert.equal(exportedRun.status, "completed");
  assert.equal(exportedRun.nodes.export.output.path, chosenDocx);
  assert.equal(
    readFileSync(exportedRun.nodes.export.output.path)
      .subarray(0, 2)
      .toString(),
    "PK",
  );
  await page.reload();
  await page.getByRole("heading", { name: "Home", exact: true }).waitFor();
  await page.screenshot({ path: "../../docs/screenshots/next-home.png" });
  await page
    .locator(".nx-sidebar")
    .getByRole("button", { name: "Learning acceptance", exact: true })
    .click();
  const events = page.locator(".nx-event-title");
  await events.first().waitFor();
  await page.screenshot({ path: "../../docs/screenshots/next-calendar.png" });
  await events.first().click();
  await page
    .getByRole("button", { name: "Main document", exact: true })
    .click();
  await page.locator('iframe[title="Main document editor"]:visible').waitFor();
  const editor = page.frameLocator(
    'iframe[title="Main document editor"]:visible',
  );
  await editor.locator("canvas").waitFor();
  await editor
    .locator("#status")
    .waitFor({ state: "detached", timeout: 60000 });
  await page.evaluate(() =>
    document.querySelector("iframe").contentWindow.postMessage(
      {
        source: "consilium-host",
        kind: "insert_text",
        payload: "Synthetic native editor roundtrip.",
      },
      location.origin,
    ),
  );
  await expect
    .poll(
      async () =>
        (await rpc("next_snapshot")).document.some((r) =>
          r.value.text.includes("Synthetic native editor roundtrip."),
        ),
      { timeout: 15000 },
    )
    .toBeTruthy();
  await page.screenshot({ path: "../../docs/screenshots/next-document.png" });
  await page.evaluate(() =>
    document.querySelector("iframe").contentWindow.postMessage(
      {
        source: "consilium-host",
        kind: "insert_text",
        payload: " Saved while switching tabs.",
      },
      location.origin,
    ),
  );
  await page
    .locator(".nx-sidebar")
    .getByRole("button", { name: "Data to validated report", exact: true })
    .click();
  await expect(page.locator(".nx-graph-node").first()).toBeVisible();
  await page.getByLabel("Search this network").fill("interpret");
  await page
    .locator(".nx-actions")
    .getByRole("button", { name: "interpret", exact: true })
    .click();
  await expect(page.getByLabel("Title", { exact: true })).toHaveValue(
    "interpret",
  );
  await page.getByLabel("Search this network").fill("");
  await page.screenshot({ path: "../../docs/screenshots/next-network.png" });
  await page.getByRole("button", { name: "Export…", exact: true }).click();
  await expect(
    page.getByRole("dialog", { name: "Export project" }),
  ).toBeVisible();
  await page.screenshot({
    path: "../../target/next-project-export.png",
  });
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator("iframe")).toHaveCount(0);
  const savedDocument = (await rpc("next_snapshot")).document.find((r) =>
    r.value.text.includes("Synthetic native editor roundtrip."),
  );
  assert(savedDocument.value.text.includes("Saved while switching tabs."));
  // Portable snapshots are saved outside the vault and imported without executing.
  const beforeProjectRuns = (await rpc("next_snapshot")).run.length;
  for (const [kind, id] of [
    ["network", codeData.id],
    ["calendar", "fixture-calendar"],
  ]) {
    const projectPath = join(root, `${kind}.consilium`);
    const saved = await rpc("next_project_write", {
      kind,
      id,
      path: projectPath,
      remember: true,
      inputs: true,
    });
    assert.equal(saved.path, projectPath);
    assert.equal(
      (await rpc("next_project_status", { kind, id })).location.path,
      projectPath,
    );
    const opened = await rpc("next_project_read", { path: projectPath });
    assert.equal(opened.kind, kind);
    assert.notEqual(opened.id, id);
  }
  assert.equal((await rpc("next_snapshot")).run.length, beforeProjectRuns);
  const addons = await rpc("next_addon_samples");
  for (const sample of addons) {
    const godot = sample.manifest.runtime === "godot";
    const executable = godot
      ? process.env.CONSILIUM_TEST_GODOT
      : process.execPath;
    if (!executable) continue;
    await rpc("next_addon_install", { ...sample, approved: true });
    await save("binding", {
      id: `addon-runtime-${sample.manifest.id}`,
      name: "Test runtime",
      kind: "executable",
      path: executable,
      writable: false,
    });
    const example = await rpc("next_addon_example", { id: sample.manifest.id });
    example.value.nodes.find(
      (n) => n.kind === "addon",
    ).config.executable_binding = `addon-runtime-${sample.manifest.id}`;
    await rpc("next_save", {
      kind: "network",
      value: example.value,
      revision: example.revision,
    });
    const review = await rpc("next_network_review", { id: example.value.id });
    const run = await rpc("next_network_run", {
      network_id: example.value.id,
      revision: review.plan.revision,
      approval_digest: review.approval_digest,
      input: {},
    });
    assert.equal(run.status, "completed", JSON.stringify(run.nodes));
    if (godot) {
      assert.equal(run.nodes.adapter.output.platforms, 8);
      assert(run.nodes.adapter.output.scene_text.includes("GeneratedLevel"));
    } else {
      assert.equal(run.nodes.adapter.output.model.slope, 2);
      assert.equal(run.nodes.adapter.output.model.intercept, 1);
      assert.equal(run.nodes.adapter.output.metrics.mae, 0);
    }
    assert(run.nodes.report.output.document_id);
    const addonConfig = join(root, `${sample.manifest.id}-approved.json`);
    writeFileSync(
      addonConfig,
      JSON.stringify({
        network_id: example.value.id,
        revision: review.plan.revision,
        approval_digest: review.approval_digest,
        input: {},
      }),
    );
    const cliAddonRun = await cliCall(["run", addonConfig]);
    assert.equal(
      cliAddonRun.status,
      "completed",
      JSON.stringify(cliAddonRun.nodes),
    );
    if (godot) {
      assert.equal(cliAddonRun.nodes.adapter.output.platforms, 8);
      assert.equal(
        (
          cliAddonRun.nodes.adapter.output.scene_text.match(
            /type="MeshInstance3D"/g,
          ) || []
        ).length,
        8,
      );
      assert(
        cliAddonRun.nodes.adapter.output.scene_text.includes(
          'name="GeneratedLevel"',
        ),
      );
      assert.deepEqual(
        cliAddonRun.nodes.adapter.output.blocks,
        run.nodes.adapter.output.blocks,
      );
    } else {
      assert.deepEqual(
        cliAddonRun.nodes.adapter.output,
        run.nodes.adapter.output,
      );
    }
    assert(cliAddonRun.nodes.report.output.document_id);
    console.log(`${sample.manifest.name}: desktop and CLI passed`);
    if (!godot) {
      const before = await rpc("next_get", {
        kind: "network",
        id: example.value.id,
      });
      const revised = { ...before.value, name: "Reviewed ML revision" };
      await save("network", {
        schema_version: 1,
        id: "revision-author",
        name: "Network revision test",
        limits: learning.limits,
        nodes: [
          {
            id: "input",
            kind: "input",
            title: "Draft",
            config: { value: { network: revised } },
            position: { x: 0, y: 0 },
          },
          {
            id: "propose",
            kind: "network_change",
            title: "Propose revision",
            config: { network_id: example.value.id },
            position: { x: 200, y: 0 },
          },
        ],
        edges: [{ id: "edge", source: "input", target: "propose" }],
      });
      const authorReview = await rpc("next_network_review", {
        id: "revision-author",
      });
      const authorRun = await rpc("next_network_run", {
        network_id: "revision-author",
        revision: authorReview.plan.revision,
        approval_digest: authorReview.approval_digest,
        input: {},
      });
      assert.equal(authorRun.status, "completed");
      assert.equal(
        (await rpc("next_get", { kind: "network", id: example.value.id }))
          .revision,
        before.revision,
      );
      await rpc("next_accept_changes", {
        id: authorRun.nodes.propose.output.proposal_id,
      });
      assert.equal(
        (await rpc("next_get", { kind: "network", id: example.value.id })).value
          .name,
        "Reviewed ML revision",
      );
      assert.equal(authorRun.review.plan.network.name, "Network revision test");
    }
  }
  await page
    .getByRole("button", { name: "Settings", exact: true })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Review ML: linear regression", exact: true })
    .click();
  const addonDialog = page.getByRole("dialog", { name: "Review add-on" });
  await expect(addonDialog).toBeVisible();
  await addonDialog.screenshot({
    path: "../../docs/screenshots/next-addon-review.png",
  });
  await addonDialog
    .getByRole("button", { name: "Close dialog", exact: true })
    .click();
  await page
    .getByRole("tab", { name: "Vocabulary practice", exact: true })
    .last()
    .click();
  await page.locator('iframe[title="Main document editor"]:visible').waitFor();
  await editor.locator("canvas").waitFor();
  await editor
    .locator("#status")
    .waitFor({ state: "detached", timeout: 60000 });
  await page.evaluate(() =>
    document.querySelector("iframe").contentWindow.postMessage(
      {
        source: "consilium-host",
        kind: "insert_text",
        payload: " Saved while closing.",
      },
      location.origin,
    ),
  );
  const taskCount = (await rpc("next_snapshot")).task.length;
  const exited = new Promise((resolve) => child.once("exit", resolve));
  await page.getByRole("button", { name: "Close window", exact: true }).click();
  await Promise.race([
    exited,
    new Promise((_, reject) =>
      setTimeout(() => reject(Error("Close did not finish saving")), 15000),
    ),
  ]);
  const afterClose = await cliCall([
    "inspect",
    savedDocument.value.id,
    "--kind",
    "document",
  ]);
  assert(afterClose.value.text.includes("Saved while closing."));
  console.log(
    JSON.stringify({
      status: "passed",
      workflows: [
        "learning desktop",
        "code/data desktop",
        "learning CLI",
        "code/data CLI",
      ],
      tasks: taskCount,
      requests: requests.length,
      isolatedVault: vault,
    }),
  );
} finally {
  await browser?.close().catch(() => {});
  child.kill();
  server.close();
}
