@echo off
REM =============================================================================
REM Scheduler Launcher for Windows Task Scheduler
REM =============================================================================
REM Запуск: schtasks /create /tn "StreamSensationAnalyzer" /tr "cmd /c C:\analyzer\scripts\scheduler\launch-scheduler.bat" /sc hourly /st 09:00
REM =============================================================================

setlocal enabledelayedexpansion

REM Determine script directory
set "SCRIPT_DIR=%~dp0"
set "PROJECT_DIR=%SCRIPT_DIR%..\.."

REM Change to project directory
cd /d "%PROJECT_DIR%"

REM Timestamp for log file
set "TIMESTAMP=%date:~-4%%date:~-7,2%%date:~-10,2%-%time:~0,2%%time:~3,2%%time:~6,2%"
set "TIMESTAMP=!TIMESTAMP: =0!"

REM Log file path
set "LOG_FILE=scripts\scheduler\reports\schedule-log-%TIMESTAMP%.txt"

REM Run scheduler
echo [START] Scheduler run at %time% > "%LOG_FILE%"
echo [INFO] Project directory: %PROJECT_DIR% >> "%LOG_FILE%"
echo [INFO] Log file: %LOG_FILE% >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

echo [STEP 1/3] Running scheduler orchestrator...
node scripts\scheduler\run-all.js >> "%LOG_FILE%" 2>&1
set "RUN_STATUS=!errorlevel!"
echo [RESULT] run-all.js exit code: !RUN_STATUS! >> "%LOG_FILE%"
echo. >> "%LOG_FILE%"

if "!RUN_STATUS!" == "0" (
    echo [STEP 2/3] Running agent analysis...
    node scripts\scheduler\analyze-results.js >> "%LOG_FILE%" 2>&1
    set "ANALYZE_STATUS=!errorlevel!"
    echo [RESULT] analyze-results.js exit code: !ANALYZE_STATUS! >> "%LOG_FILE%"
    echo. >> "%LOG_FILE%"
    
    echo [STEP 3/3] Generating tasks...
    node scripts\scheduler\generate-tasks.js --dry-run >> "%LOG_FILE%" 2>&1
    set "TASKS_STATUS=!errorlevel!"
    echo [RESULT] generate-tasks.js exit code: !TASKS_STATUS! >> "%LOG_FILE%"
) else (
    echo [WARN] Scheduler failed, skipping analysis (exit code: !RUN_STATUS!) >> "%LOG_FILE%"
)

echo. >> "%LOG_FILE%"
echo [END] Scheduler run completed at %time% >> "%LOG_FILE%"
echo [END] Overall exit code: !RUN_STATUS! >> "%LOG_FILE%"

REM Cleanup old logs (keep last 30 days)
forfiles /p "scripts\scheduler\reports" /m "schedule-log-*.txt" /d -30 /c "cmd /c del @path" 2>nul

exit /b !RUN_STATUS!
