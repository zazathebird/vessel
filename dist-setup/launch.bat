@echo off
REM  Sharing setup for mcclevarty.ca - the double-clickable way in.
REM
REM  All this does is start the PowerShell script sitting next to it. It exists
REM  because double-clicking a .ps1 file opens it in Notepad rather than running
REM  it, which is a sensible default that would otherwise stop this dead.
REM
REM  -ExecutionPolicy Bypass applies to THIS ONE RUN and nothing else. It does
REM  not change any setting on the machine and the next PowerShell window is
REM  exactly as restricted as it was before. It is needed because the script is
REM  not signed with a certificate, and a certificate for this would cost a few
REM  hundred dollars a year to tell you something the checksum on the download
REM  page already tells you for nothing.
REM
REM  -NoProfile skips your own PowerShell startup file, so nothing you or
REM  anything else has put in there can change what this script does.
REM
REM  If somebody rang you up and told you to run this, hang up. Then ring back
REM  on a number you looked up yourself.

setlocal

echo.
echo   Sharing setup for mcclevarty.ca
echo   ------------------------------
echo.
echo   This prepares folders on this computer so a browser can share them.
echo   It does not send any file anywhere, and it cannot.
echo.
echo   The script it is about to run is windows-share-setup.ps1, in this same
echo   folder. You can open it in Notepad and read it first. That is encouraged.
echo.
pause

if not exist "%~dp0windows-share-setup.ps1" (
    echo.
    echo   windows-share-setup.ps1 is not in this folder.
    echo   Both files need to be together - download them again, into the same place.
    echo.
    pause
    exit /b 1
)

rem The full path, never a bare "powershell.exe" (2026-09-07, audit item 45):
rem cmd.exe searches the CURRENT directory before PATH, and double-clicking this
rem file from Explorer makes Downloads the current directory - so any
rem "powershell.exe" a drive-by download had dropped there would run with your
rem rights the moment you ran the launcher you had just checksummed.
"%SystemRoot%\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0windows-share-setup.ps1" %*
set EXITCODE=%ERRORLEVEL%

echo.
if not "%EXITCODE%"=="0" (
    echo   That did not finish. The message above says why.
) else (
    echo   Finished. The next step is on the website.
)
echo.
pause
exit /b %EXITCODE%
