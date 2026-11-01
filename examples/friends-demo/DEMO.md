# Consilium: a 4-minute demo for friends

## Before recording
Install the latest preview. Your saved keys and model profiles remain; the test workspace is cleared. Choose a model that is available and rehearse once. Do not show API key fields. The demo contains synthetic content only.

Keep this folder nearby. `reading.json` is the one input. The workflow will CREATE `study-summary.json` at the destination you choose. `expected-output.json` is an example for comparison, not an input or the actual generated result. Wording can vary; require three supported key points and two supported quiz answers.

## 0:00–0:25 — What this is
“This is my local workspace for plans, documents and AI workflows. I can plan something, then build a repeatable workflow to do the work.”
Show Home and Create. Create a calendar called Learning demo.

## 0:25–1:20 — Calendar
Open Assistant, select Learning demo and your saved model. Paste:

> Plan three short learning sessions for tomorrow in my calendar's timezone: 18:00–18:20 learn 10 Spanish words; 18:25–18:45 practise recalling the words; 18:50–19:00 review mistakes. Use a green Language label. Give each task two practical checklist steps. Propose these changes for review, without repeating tasks or modifying anything else.

Review and accept the proposal. Open tomorrow's calendar, hover a task, mark it complete, then undo completion. Click a task to show its full page and document. Show the three-dot calendar menu briefly.

## 1:20–1:40 — Transition
“The calendar tells me what I want to do. A network makes a repeatable process that helps me do it.”
Create a network named Study guide. Open its assistant. Attach `reading.json` as a local workflow input. Sharing its small synthetic contents with the model is fine for this demo.

## 1:40–3:15 — Network prompt
Paste:

> Build a small working study-guide workflow with five nodes: Input → Read file → AI agent → Write file → Output. Read the attached reading.json as JSON. Use my selected model profile for the agent. The agent must use only the supplied facts and return a JSON object with exactly: title (string), key_points (array of exactly three strings), quiz (array of exactly two objects, each with question and answer strings). Include a complete output schema, with all fields required and no extra fields. Write that object to study-summary.json using an explicit writable output binding. Use existing bindings if available; otherwise stage the required resource setup so I can choose reading.json and the output destination with the file picker. Do not invent paths or credentials. No scripts, network searches, calendar mutations, loops, or additional agents. Propose the graph for my review, and do not claim it has run.

Review and accept. In Read file properties, choose reading.json if not bound already. In Write file properties, choose a NEW study-summary.json location. Verify the agent profile. Explain that input/output files appear in the right Files panel. Select Preview input.

Choose Review & run; inspect the requested model and output write, then approve. Expand the run if it pauses for approval. Let the run finish. Choose Preview output in the right panel: the generated JSON is shown inside the app. Check three key points and two questions, all supported by the input.

If a model is unavailable, retry once or choose another saved profile. Do not claim a successful run before the output appears. An error is a useful chance to show which node failed.

## 3:15–4:00 — Reuse and finish
Show the network three-dot menu → Save as → single .consi file. Explain that the workflow can be reopened and rebound on another machine; keys are not exported. Show an alternate background briefly and return to Home.

Ask friends: “Was the difference between calendars and workflows clear? Where did you expect to click next? What would you use this for?”

## Quick acceptance checklist
- Three correctly timed tasks tomorrow, no duplicates.
- Completion and un-completion both work.
- Selecting a chat keeps its history sidebar visible.
- Input preview matches reading.json; output is created only after the run.
- Output matches the required shape and contains no invented claims.
- Clicking outside File or a three-dot menu closes it.
- A saved .consi project reopens through Open project; .consilium remains supported.
