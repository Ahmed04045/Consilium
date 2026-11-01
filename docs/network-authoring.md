# Network authoring and sample tests (alpha.5)

## Give the assistant the actual inputs

In a network conversation, choose **Add files…** and select the stress-test kit's JSON, schema, or source files. No copy/paste is required. UTF-8 text files are supported (up to six files per message, 1 MB each).

Each file has two independent options:

- **Use as workflow input** makes a read-only local snapshot available as a file binding. This does not send its contents to the model.
- **Share contents with [provider/model]** includes the displayed text when you press Send. File names and sharing status accompany the request even when contents are not shared. Preview shows exactly the saved excerpt; files over 16,000 characters are explicitly marked partial.

Snapshots remain in the local vault's `attachments` folder. Removing an attachment from the composer removes it from that message, not from storage or existing workflows. Original files are not changed. History records the file identity and sharing choice; it does not automatically resend older attachment text. Reattach evidence when a later request needs it. Changing the selected model clears content-sharing selections.

## Build in stages

Use **Design/edit graph** to request the topology and contracts. Once it exists, select **Implement one node** or **Repair one node** and choose the node. Provide input, expected output and failure evidence. Rust merges only that node into the current revision; another node ID or stale revision is rejected. The assistant may ask for missing files or runtimes instead of inventing references.

All edits remain proposals. The revised system prompt requires real implementations and meaningful schemas, but it is not a correctness guarantee. Placeholder detection is a heuristic and can produce false positives or miss mistakes.

## Check readiness

The network's Readiness panel distinguishes:

1. **Structure:** node configuration and connections compile.
2. **Resources:** files, runtimes and referenced records are configured. Use the typed selector or native file picker to fix missing resources. Confirm the selected file is actually the intended data; a correct file type is insufficient.
3. **Behavior:** the specific sample tests that passed or failed. A successful-looking string is not a passing test.

## Run a sample test

Expand **Sample tests** and select **Test with sample data…**. Choose a JSON input and an independently prepared expected JSON result, an output node, and optionally a JSON pointer (such as `/result`). Leave the pointer empty to compare the whole output. Input nodes receive the sample; File-read nodes continue reading their configured files.

Review the scripts, model destinations, bindings and writes, then run. These are real workflow runs using your Windows permissions, not an isolated simulation. Use synthetic files and separate output destinations. Approval nodes pause with their pending outputs visible; use **Approve waiting test steps and continue** after reviewing them.

Passing requires a completed run and exact JSON equality with the expected result. Results persist locally. Graph/resource changes mark old evidence as old. External input-file contents are not fingerprinted by this readiness check: retest after changing those files. A passing sample does not prove behavior on other inputs.

Network proposals, including adaptive revisions, expose the same sample-test panel before acceptance. Testing a draft does not apply its graph. It can still perform explicitly reviewed side effects. Acceptance remains a separate user decision; there is no automatic self-acceptance or automatic correctness certification.

## Context limits

Attachment excerpts, scope, recent turns and reference contracts count against an estimated token budget. Full outbound checks include instructions, response schema, output capacity and a safety margin; token estimates can differ from the provider's tokenizer. Older turns and lower-priority records are removed before rejecting oversized requests, and some capacity is reserved for repair.

Invalid structured output receives at most one focused repair. Repeated history, attachment text and contract examples are omitted; the complete failed candidate, request, scope and revision remain. If that candidate still cannot fit, the original validation error and budget shortfall are shown rather than silently truncating it. Failed repair leaves existing work unchanged. Context inspection is optional and estimates selected context rather than the entire outbound request.

## Verification boundary

Regression tests use synthetic inputs and a deterministic local model fixture. They verify application routing, sharing controls, mutation boundaries and execution behavior; they do not establish Gemini/OpenRouter model quality. Retest the original stress prompt with your selected model and independently prepared expected results.
