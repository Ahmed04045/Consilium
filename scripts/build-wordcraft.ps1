$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Push-Location $projectRoot
try {
    $cargo = Join-Path $env:USERPROFILE '.cargo/bin/cargo.exe'
    $rustup = Join-Path $env:USERPROFILE '.cargo/bin/rustup.exe'
    & $rustup target add wasm32-unknown-unknown
    if ($LASTEXITCODE -ne 0) { throw 'WebAssembly target setup failed' }
    $bindingTool = Join-Path $projectRoot '.tools/wasm-bindgen/bin/wasm-bindgen.exe'
    if (-not (Test-Path -LiteralPath $bindingTool)) {
        & $cargo install wasm-bindgen-cli --version 0.2.129 --locked --root .tools/wasm-bindgen
        if ($LASTEXITCODE -ne 0) { throw 'wasm-bindgen installation failed' }
    }
    & $cargo build --manifest-path integrations/wordcraft/Cargo.toml --target wasm32-unknown-unknown --release --locked -j 4
    if ($LASTEXITCODE -ne 0) { throw 'Wordcraft build failed' }
    & $bindingTool integrations/wordcraft/target/wasm32-unknown-unknown/release/consilium_wordcraft.wasm --target web --out-dir apps/desktop/public/wordcraft/generated --no-typescript
    if ($LASTEXITCODE -ne 0) { throw 'Wordcraft binding generation failed' }
    $env:PATH = "$(Split-Path -Parent $cargo);$env:PATH"
    & node scripts/editor-notices.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Wordcraft license collection failed' }
} finally { Pop-Location }
