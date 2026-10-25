[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string]$SourceDirectory = $PSScriptRoot,
    [string]$Destination = (Join-Path $env:LOCALAPPDATA 'ConsiliumRunner\bin'),
    [switch]$NoPath
)
$ErrorActionPreference = 'Stop'
$destinationPath = [IO.Path]::GetFullPath($Destination)
$source = Join-Path $SourceDirectory 'consi.exe'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw 'consi.exe is missing beside the installer. Extract the whole runner ZIP first.' }
if (-not $PSCmdlet.ShouldProcess($destinationPath, 'Install portable runner and optionally add its directory to your user PATH')) { return }
New-Item -ItemType Directory -Path $destinationPath -Force | Out-Null
foreach ($name in @('consi.exe','consilium.exe')) {
    $from = Join-Path $SourceDirectory $name
    $to = Join-Path $destinationPath $name
    if ((Test-Path -LiteralPath $from -PathType Leaf) -and ([IO.Path]::GetFullPath($from) -ne [IO.Path]::GetFullPath($to))) {
        Copy-Item -LiteralPath $from -Destination $to -Force
    }
}
if (-not $NoPath) {
    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $present = @($userPath -split ';') | Where-Object {
        [Environment]::ExpandEnvironmentVariables($_).Trim().TrimEnd('\') -ieq $destinationPath.TrimEnd('\')
    }
    if (-not $present) {
        $updated = if ([string]::IsNullOrEmpty($userPath)) { $destinationPath } else { $userPath.TrimEnd(';') + ';' + $destinationPath }
        [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    }
    if (-not (@($env:Path -split ';') | Where-Object { $_.TrimEnd('\') -ieq $destinationPath.TrimEnd('\') })) {
        $env:Path += ';' + $destinationPath
    }
}
& (Join-Path $destinationPath 'consi.exe') --version
if ($LASTEXITCODE -ne 0) { throw 'Installed runner did not start successfully.' }
Write-Output "Installed at $destinationPath"
if (-not $NoPath) { Write-Output 'User PATH updated. Reopen existing terminal apps to pick up the change. Run: consi --help' }
