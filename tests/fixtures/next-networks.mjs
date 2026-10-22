// Synthetic acceptance fixtures. All profiles and files are bound locally by the test/setup.
const limits = {
  concurrency: 2,
  iterations: 5,
  model_calls: 20,
  timeout_seconds: 1800,
};
const node = (id, kind, config = {}, x = 0, y = 0) => ({
  id,
  kind,
  title: id.replaceAll("_", " "),
  config,
  position: { x, y },
});
const edge = (source, target, port = "out") => ({
  id: `${source}-${target}`,
  source,
  target,
  source_port: port,
  target_port: "in",
});
const graph = (id, name, nodes, edges) => ({
  schema_version: 1,
  id,
  name,
  nodes,
  edges,
  limits,
});
const resultSchema = {
  type: "object",
  required: ["approved", "blocks", "changes"],
  properties: {
    approved: { type: "boolean" },
    blocks: { type: "array", items: { type: "object" } },
    changes: { type: "array", items: { type: "object" } },
  },
};
const reviewBody = graph(
  "review_body",
  "Review and revise",
  [
    node("review_input", "input"),
    node(
      "review_agent",
      "agent",
      {
        profile_id: "fixture-profile",
        system_prompt:
          "REVIEW_STUDY: Review the proposed study plan. Preserve blocks and changes, correct mistakes, then set approved true when it meets the target. Return JSON.",
        schema: resultSchema,
      },
      250,
    ),
    node("review_output", "output", {}, 500),
  ],
  [edge("review_input", "review_agent"), edge("review_agent", "review_output")],
);
export const learning = graph(
  "learning-workflow",
  "Reading to study plan",
  [
    node("reading", "file_read", {
      binding_id: "fixture-reading",
      format: "text",
    }),
    node(
      "planner",
      "agent",
      {
        profile_id: "fixture-profile",
        system_prompt:
          "PLAN_STUDY: Use the reading to create a Wordcraft study document (blocks: heading/paragraph/list/table) and proposed calendar changes for calendar fixture-calendar. Include a weekly goal span with target 200 words, a weekly recurring session and a dated child task. Task records use explicit dates/timezone and expected_revision 0. Return approved false, blocks and changes.",
        schema: resultSchema,
      },
      250,
    ),
    node(
      "review_loop",
      "loop",
      {
        body: reviewBody,
        max_iterations: 3,
        stop_pointer: "/approved",
        stop_equals: true,
      },
      500,
    ),
    node(
      "study_document",
      "document_write",
      { title: "Synthetic study guide", scope: "calendar:fixture-calendar" },
      750,
      0,
    ),
    node(
      "weekly_plan",
      "calendar_change",
      { calendar_id: "fixture-calendar" },
      750,
      180,
    ),
    node("finish", "join", {}, 1000),
  ],
  [
    edge("reading", "planner"),
    edge("planner", "review_loop"),
    edge("review_loop", "study_document"),
    edge("review_loop", "weekly_plan"),
    edge("study_document", "finish"),
    edge("weekly_plan", "finish"),
  ],
);
export const codeData = graph(
  "code-data-workflow",
  "Data to validated report",
  [
    node("dataset", "file_read", {
      binding_id: "fixture-data",
      format: "json",
    }),
    node(
      "calculate",
      "process",
      {
        executable_binding: "fixture-node",
        extension: "js",
        args: [],
        source:
          "let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>{const rows=JSON.parse(text);const total=rows.reduce((sum,row)=>sum+row.value,0);console.log(JSON.stringify({valid:Number.isFinite(total),count:rows.length,total}));});",
        timeout_seconds: 300,
      },
      250,
    ),
    node(
      "validate",
      "validate",
      {
        schema: {
          type: "object",
          required: ["valid", "count", "total"],
          properties: {
            valid: { type: "boolean" },
            count: { type: "integer" },
            total: { type: "number" },
          },
        },
      },
      500,
    ),
    node("branch", "condition", { pointer: "/valid", equals: true }, 750),
    node(
      "interpret",
      "agent",
      {
        profile_id: "fixture-profile",
        system_prompt:
          "INTERPRET_DATA: Explain the validated calculation using only the provided numbers. Return blocks for a short report.",
        schema: {
          type: "object",
          required: ["blocks"],
          properties: { blocks: { type: "array", items: { type: "object" } } },
        },
      },
      1000,
    ),
    node("report", "document_write", { title: "Synthetic data report" }, 1250),
    node("artifact", "file_write", { binding_id: "fixture-output" }, 1250, 180),
    node("invalid", "output", {}, 1000, 300),
    node("done", "join", {}, 1500),
  ],
  [
    edge("dataset", "calculate"),
    edge("calculate", "validate"),
    edge("validate", "branch"),
    edge("branch", "interpret", "true"),
    edge("branch", "invalid", "false"),
    edge("interpret", "report"),
    edge("interpret", "artifact"),
    edge("report", "done"),
    edge("artifact", "done"),
    edge("invalid", "done"),
  ],
);
