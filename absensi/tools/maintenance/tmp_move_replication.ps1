$dataDir = 'C:\xampp\mysql\data'
$backupDir = Join-Path $dataDir 'replication-backup-20260812-3'
if (-not (Test-Path -Path $backupDir)) {
    New-Item -ItemType Directory -Path $backupDir | Out-Null
}
$files = Get-ChildItem -Path $dataDir -File | Where-Object {
    $_.Name -like 'master-*' -or $_.Name -like 'relay-log-*' -or $_.Name -like 'mysql-relay-bin-*' -or $_.Name -eq 'multi-master.info'
}
foreach ($file in $files) {
    Move-Item -Path $file.FullName -Destination $backupDir -Force
}
$files | Select-Object -ExpandProperty Name | Out-File -FilePath 'C:\xampp\tmp_replication_files_moved.txt' -Encoding utf8
Write-Output ('Moved ' + $files.Count + ' replication files to ' + $backupDir)
