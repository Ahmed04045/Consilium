param([string]$OutputDirectory = 'target/consi-preview')
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$output = Join-Path $root $OutputDirectory
if (Test-Path -LiteralPath $output) { throw 'Output already exists. Preserve it or choose a new build directory before packaging.' }
$runner = Join-Path $output 'consilium-runner'
$prompts = Join-Path $output 'ai-network-test'
New-Item -ItemType Directory -Path $runner, (Join-Path $prompts 'evaluator') | Out-Null
Copy-Item -LiteralPath (Join-Path $root 'target/release/consilium.exe') -Destination $runner
Copy-Item -LiteralPath (Join-Path $root 'target/release/consi.exe') -Destination $runner
Copy-Item -LiteralPath (Join-Path $root 'scripts/install-runner.ps1') -Destination (Join-Path $runner 'Install-Consi.ps1')
Copy-Item -LiteralPath (Join-Path $root 'LICENSE') -Destination $runner
Copy-Item -LiteralPath (Join-Path $root 'docs/standalone-runner.md') -Destination (Join-Path $runner 'README.md')
$fixture = Join-Path $root 'examples/wake-lab'
foreach ($name in @('QUICK-PROMPT.md','STRESS-PROMPT.md','lab-input.json','output-schema.json','UNTRUSTED-NOTE.md')) {
    Copy-Item -LiteralPath (Join-Path $fixture $name) -Destination $prompts
}
Copy-Item -LiteralPath (Join-Path $fixture 'AI-TEST-README.md') -Destination (Join-Path $prompts 'README.md')
Copy-Item -LiteralPath (Join-Path $fixture 'expected-results.json') -Destination (Join-Path $prompts 'evaluator')
foreach ($folder in @($runner,$prompts)) {
    $lines = Get-ChildItem -LiteralPath $folder -Recurse -File | Sort-Object FullName | ForEach-Object {
        $relative = [IO.Path]::GetRelativePath($folder,$_.FullName).Replace('\','/')
        (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $relative
    }
    [IO.File]::WriteAllLines((Join-Path $folder 'SHA256SUMS.txt'),$lines)
}
Compress-Archive -LiteralPath $runner -DestinationPath (Join-Path $output 'consilium-runner-preview.zip')
Compress-Archive -LiteralPath $prompts -DestinationPath (Join-Path $output 'ai-network-test.zip')
Get-ChildItem -LiteralPath $output -Filter '*.zip' | Select-Object FullName,Length
