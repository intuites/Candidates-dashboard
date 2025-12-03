@echo off
echo ========================================
echo    Starting Local Web Server
echo ========================================
echo.
echo Your dashboard will open at: http://localhost:8000
echo.
echo Press Ctrl+C to stop the server
echo.

REM Try Python 3 first
python -m http.server 8000 2>nul
if %errorlevel% neq 0 (
    REM Try Python 2
    python -m SimpleHTTPServer 8000 2>nul
    if %errorlevel% neq 0 (
        echo.
        echo ERROR: Python not found!
        echo.
        echo Please install Python from https://python.org
        echo Or open index.html in VS Code Live Server extension
        echo.
        pause
    )
)

