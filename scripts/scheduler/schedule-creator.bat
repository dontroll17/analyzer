@echo off
REM =============================================================================
REM Schedule Creator — создаёт задачу в Windows Task Scheduler
REM =============================================================================
REM Запуск: от имени администратора (или через "Запуск от имени администратора")
REM =============================================================================

set "SCRIPT_PATH=%~dp0launch-scheduler.bat"
set "TASK_NAME=StreamSensationAnalyzer"

echo ========================================
echo Stream Sensation Analyzer Scheduler
echo ========================================
echo.

REM Check if running as admin
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] This script must be run as Administrator!
    echo.
    echo Right-click and select "Run as administrator"
    echo Or run manually: schtasks /create /tn "StreamSensationAnalyzer" /tr "%SCRIPT_PATH%" /sc hourly /st 09:00
    pause
    exit /b 1
)

echo [INFO] Script path: %SCRIPT_PATH%
echo [INFO] Task name: %TASK_NAME%
echo.
echo Available schedules:
echo   1. Hourly during work hours (9:00 - 18:00)
echo   2. Every 2 hours (8:00 - 20:00)
echo   3. Daily at 2:00 AM
echo   4. Custom
echo.

set /p SCHEDULE="Choose schedule (1-4) [1]: "
if "%SCHEDULE%"=="" set SCHEDULE=1

set TRIGGER=
set START_TIME=

if "%SCHEDULE%"=="1" (
    set TRIGGER=hourly
    set START_TIME=09:00
    echo.
    echo [INFO] Creating hourly task (9:00 - 18:00)...
) else if "%SCHEDULE%"=="2" (
    set TRIGGER=hourly
    set START_TIME=08:00
    echo.
    echo [INFO] Creating every-2-hours task...
) else if "%SCHEDULE%"=="3" (
    set TRIGGER=daily
    set START_TIME=02:00
    echo.
    echo [INFO] Creating daily task (2:00 AM)...
) else (
    echo.
    set /p TRIGGER="Schedule (daily/hourly/every X hours): "
    set /p START_TIME="Start time (HH:MM): "
)

echo.
echo [STEP 1/3] Creating task...

if "%TRIGGER%"=="every X hours" (
    set /p INTERVAL="Run every X hours: "
    schtasks /create /tn "%TASK_NAME%" /tr "cmd /c %SCRIPT_PATH%" /sc every %INTERVAL% hours /st %START_TIME% /ru SYSTEM /f
) else (
    schtasks /create /tn "%TASK_NAME%" /tr "cmd /c %SCRIPT_PATH%" /sc %TRIGGER% /st %START_TIME% /ru SYSTEM /f
)

if %errorLevel% equ 0 (
    echo [OK] Task created successfully!
) else (
    echo [ERROR] Failed to create task!
    pause
    exit /b 1
)

echo.
echo [STEP 2/3] Verifying task...
schtasks /query /tn "%TASK_NAME%" /fo LIST

echo.
echo [STEP 3/3] Running task once (dry run)...
schtasks /run /tn "%TASK_NAME%" /i
timeout /t 2 /nobreak >nul

echo.
echo ========================================
echo Setup complete!
echo ========================================
echo.
echo Task: %TASK_NAME%
echo Script: %SCRIPT_PATH%
echo Schedule: %TRIGGER% at %START_TIME%
echo.
echo To modify:
echo   schtasks /change /tn "%TASK_NAME%" /sc daily /st 02:00
echo.
echo To delete:
echo   schtasks /delete /tn "%TASK_NAME%" /f
echo.
echo To run manually:
echo   %SCRIPT_PATH%
echo.

pause
