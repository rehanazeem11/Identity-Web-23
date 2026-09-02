@echo off
title Pushing Identity Website to GitHub...
echo ========================================================
echo Pushing latest code to GitHub: https://github.com/rehanazeem11/Identity-Web-23
echo ========================================================
echo.

"C:\Users\DELL\AppData\Local\GitHubDesktop\app-3.6.2\resources\app\git\cmd\git.exe" push -u origin main --force

echo.
if %ERRORLEVEL% equ 0 (
    echo ========================================================
    echo [SUCCESS] Your updates have been successfully pushed to GitHub!
    echo ========================================================
) else (
    echo ========================================================
    echo [ERROR] Push failed. If prompted, please complete authentication.
    echo ========================================================
)

echo.
pause
