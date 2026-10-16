$dataDir = 'C:\xampp\mysql\data'
$destDir = Join-Path $dataDir 'backup_replication_files_20260812'
New-Item -ItemType Directory -Path $destDir -Force | Out-Null
$patterns = @(
    'master-*',
    'relay-log-*',
    'mysql-relay-bin-*',
    'mysql-relay-bin-version*',
    'relay-log-version*',
    'multi-master.info'
)
$allFiles = @()
foreach ($pattern in $patterns) {
    $files = Get-ChildItem -LiteralPath $dataDir -File -Filter $pattern -ErrorAction SilentlyContinue
    if ($files) {
        foreach ($file in $files) {
            try {
                Move-Item -LiteralPath $file.FullName -Destination $destDir -Force -ErrorAction Stop
                $allFiles += $file.Name
            } catch {
                Write-Error "Failed to move '$($file.FullName)': $_"
            }
        }
    }
}
Write-Output "Moved $($allFiles.Count) replication-related files to $destDir"
if ($allFiles.Count -gt 0) {
    $allFiles | Sort-Object | ForEach-Object { Write-Output "  $_" }
}
Write-Output 'Remaining matching files:'
foreach ($pattern in $patterns) {
    $remaining = Get-ChildItem -LiteralPath $dataDir -File -Filter $pattern -ErrorAction SilentlyContinue
    if ($remaining) {
        Write-Output "Pattern ${pattern}: $($remaining.Count)"
        $remaining | Sort-Object Name | Select-Object -ExpandProperty Name | ForEach-Object { Write-Output "  $_" }
    }
}
Write-Output 'Done.'
