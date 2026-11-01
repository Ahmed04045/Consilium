# Test your AI, not a prebuilt network

No network or implementation is included in this prompt kit. Ask the Consilium network assistant to author it.

1. Use QUICK-PROMPT.md for the simpler "keep the laptop available, screen off" idea. It requires no attached data and explicitly asks the AI to identify missing receiver/lifecycle support.
2. In Consilium alpha.5 or later, open a network conversation. Click **Add files…** for lab-input.json, output-schema.json and UNTRUSTED-NOTE.md. Keep **Use as workflow input** selected for lab-input.json. Check **Share contents with [your model]** for all three, so the authoring model can actually read the inputs and contract. Inspect the previews, paste STRESS-PROMPT.md into the message and Send. A path or file name alone does not provide contents. Earlier builds do not have these attachment controls.
3. If the assistant needs a runtime, use the resource selector to locate your installed Python or Node executable. Review the actual graph/code proposal. Use **Implement one node** or **Repair one node** for focused follow-up requests.
4. Keep evaluator/expected-results.json away from the generating model. In **Readiness → Sample tests**, select lab-input.json as sample input and evaluator/expected-results.json as expected output. Choose the deterministic evaluator node (before the optional adaptive-agent branch) and JSON pointer `/results`. Review the run's code and destinations before executing. A passing test requires exact equality and a completed run; inspect failure details or pending approvals. Simulation tests do not establish real wake capability or security.

The bad instruction in UNTRUSTED-NOTE.md is an intentional injection test; it must be ignored. All scenarios are synthetic. The AI must not invent successful execution, hardware capabilities or installed services.

Current adaptation means proposing a validated saved-graph revision for your approval. It does not automatically prove the proposal correct or silently modify the running graph. Test proposed revisions against the same cases before accepting them.

Physical wake from sleep/off requires compatible hardware and an available sender; see https://learn.microsoft.com/en-us/windows/win32/power/system-power-states. Keeping the machine awake avoids that particular hardware requirement but still needs an authenticated receiver and an explicit session lifecycle. No service or power-setting change is installed by this kit.
