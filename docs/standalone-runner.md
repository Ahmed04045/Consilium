# Consilium standalone runner — 3.0.0

## Install the `consi` command

Extract the entire runner ZIP, open PowerShell in its `consilium-runner` folder, and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\Install-Consi.ps1
```


This copies `consi.exe` and the compatible `consilium.exe` command to `%LOCALAPPDATA%\ConsiliumRunner\bin`, adds that folder to your **user PATH** without replacing its existing entries, and needs no administrator access. Reopen existing terminal applications afterward. The execution-policy override applies only to that installer invocation; it does not change your saved policy. You can inspect the script before running it, use `-WhatIf` to preview, or `-NoPath` to copy the binaries without changing PATH. Existing running copies must be closed before updating.

Then, from any folder:

```powershell
consi --version
consi --help
consi extract .\your-project.consi .\unpacked
consi pack .\unpacked .\copy.consi
consi --vault .\runner-vault import .\copy.consi
consi --vault .\runner-vault review NETWORK_ID
consi --vault .\runner-vault run .\approved.json
```

`consi` and `consilium` are the same runtime with identical validation and approval rules. The longer command remains supported in the examples below. `run` takes a reviewed run configuration, not arbitrary source code or an unapproved project. This is a graph interpreter with a validation/compilation stage, not a C++ compiler or a Python replacement. Python/Node processes still need their runtimes installed; compiling C++ requires a separately configured toolchain. No new language syntax, dependency downloader, background service or file association is installed.

To remove command discovery, remove just `%LOCALAPPDATA%\ConsiliumRunner\bin` from your user PATH in Windows Environment Variables. The installation does not move or delete your vault.

The portable `consilium.exe` runs without installing or launching the desktop app and does not use WebView. It still needs to be downloaded/copied to the computer. Windows x64 is the current binary target. Scripts require their chosen installed runtime; agents require configured providers. It is not an Android executable or an always-on phone receiver.

## Pack and extract

```powershell
.\consilium.exe extract .\your-project.consilium .\unpacked
.\consilium.exe pack .\unpacked .\copy.consi
.\consilium.exe pack .\unpacked .\algorithm.consilium --without-inputs
```

`.consi` is accepted as a filename extension for the same open JSON-based `.consilium` format; it is not a separate encrypted format. Folder projects contain `project.consilium` and `assets/`. Sources must be valid Consilium projects, not arbitrary ZIP files. Destinations must be new; existing files/folders are not overwritten. All commands reuse project validation, traversal and size limits. Conversion uses temporary storage rather than the working vault, remaps record identities into a portable copy, and never executes scripts. Imported add-ons remain disabled pending review. Algorithm-only exports remove data inputs but retain authored program source; inspect source/prompts before sharing.

## Run your network without the desktop

Unzip the runner bundle and open PowerShell in that directory. Copy in a network project exported from Consilium. Install any runtime its processes require; the binding example below assumes a single Node.js process. Use a separate vault so your daily app data is untouched:

```powershell
$vault = Join-Path $PWD 'runner-vault'
$imported = .\consilium.exe --vault $vault import .\your-project.consilium | ConvertFrom-Json
$network = .\consilium.exe --vault $vault inspect $imported.id --kind network | ConvertFrom-Json
$runtimeId = ($network.value.nodes | Where-Object kind -eq 'process').config.executable_binding
$node = (Get-Command node.exe).Source
.\consilium.exe --vault $vault bind $runtimeId $node --kind executable
$review = .\consilium.exe --vault $vault review $imported.id | ConvertFrom-Json
$review | ConvertTo-Json -Depth 100
```

Inspect the source, files, writes and limits in the review. Only after approving those details, create a run configuration (UTF-8 without BOM):

```powershell
$config = @{ network_id=$imported.id; revision=$review.plan.revision; approval_digest=$review.approval_digest; input=@{} }
[IO.File]::WriteAllText((Join-Path $PWD 'approved.json'), ($config | ConvertTo-Json -Depth 100))
.\consilium.exe --vault $vault run .\approved.json
```

If the graph includes an approval node, execution pauses at that node. Exit code **2** means it is not completed, including awaiting approval; **1** means a command error; **0** means the command completed. Inspect the run, including the approval node's pending output. Replace `<run-id>` with the returned ID and `approve` with the actual waiting node ID from your graph:

```powershell
$run = .\consilium.exe --vault $vault inspect '<run-id>' | ConvertFrom-Json
$run.nodes.approve.output | ConvertTo-Json -Depth 100
```

If you approve that payload, resume the existing run:

```powershell
$resume = @{ run_id=$run.id; approval_digest=$run.review.approval_digest; approved_nodes=@('approve'); retry_nodes=@() }
[IO.File]::WriteAllText((Join-Path $PWD 'resume.json'), ($resume | ConvertTo-Json -Depth 100))
.\consilium.exe --vault $vault run .\resume.json
```

If the workflow writes a document, inspect the returned report document ID using `inspect ID --kind document`. The result contains text and a Wordcraft document record; the CLI does not provide a graphical editor. All run data remains in the chosen vault. Do not delete it as if it were a cache.

Other commands: `validate`, `compile`, `runs`, `cancel`, `accept CHANGESET_ID --approve`, graph-only `export`, and `tick` for one due previously approved schedule. Use `help` for the complete command list. Validate/compile accept raw network JSON or legacy `.network.json`; import `.consilium` first and review its network to validate a project.

`configure RECORD.json` accepts a revision-checked `{ "kind": "profile" | "binding", "revision": 0, "value": ... }` record. A model profile uses provider, exact model ID, endpoint, context_tokens and credential_id. API keys must already exist in the Consilium Next Windows Credential Manager namespace; do not put keys in graph/config files. This runner does not yet provide an interactive key manager. Local adapters and process-only workflows need no desktop credential setup.

## Scope and trust

Programs execute with your Windows user permissions, with Job Object process control; this is not a sandbox. Import/pack/extract do not execute. Running requires review of the current graph/resources. A changed script or binding invalidates earlier approval. Noninteractive runs stop at human approval gates until explicitly resumed. No remote endpoint, scheduled Windows service, BIOS changes or physical wake operation is installed by this bundle.

The desktop and CLI use the same application/workflow services. Version 3.0.0 is distributed with the stable desktop release.
