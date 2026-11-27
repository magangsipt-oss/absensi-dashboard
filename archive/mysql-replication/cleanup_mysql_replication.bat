@echo off
cd /d C:\xampp\mysql\data || exit /b 1
if not exist backup_replication_files_20260812 mkdir backup_replication_files_20260812
move /Y master-* backup_replication_files_20260812 2>nul
move /Y relay-log-* backup_replication_files_20260812 2>nul
move /Y mysql-relay-bin-* backup_replication_files_20260812 2>nul
move /Y mysql-relay-bin-version* backup_replication_files_20260812 2>nul
move /Y relay-log-version* backup_replication_files_20260812 2>nul
if exist multi-master.info move /Y multi-master.info backup_replication_files_20260812 >nul 2>nul
for %%P in (master-* relay-log-* mysql-relay-bin-* mysql-relay-bin-version* relay-log-version*) do (
  for /f "delims=" %%C in ('dir /b "%%P" 2^>nul ^| find /c /v ""') do echo %%P count=%%C
)
if exist multi-master.info echo multi-master.info exists
echo DONE
