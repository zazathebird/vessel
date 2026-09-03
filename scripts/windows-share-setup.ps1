<#
    Set this Windows machine up to share folders with mcclevarty.ca.

    WHAT THIS IS
    ------------
    The sharing itself happens in your browser, not in this script. A web page
    cannot be handed a folder by anything except you clicking "Select Folder" —
    that is a deliberate part of how browsers work, and it is the reason this
    feature needs no installer and no signed executable. So this script cannot
    share anything on its own, and does not try to.

    What it does instead is everything AROUND that click:

      * puts links to the folders you choose in one place, so the browser only
        has to be shown one folder instead of six;
      * prints a setup code carrying that list, so the website can show you a
        checklist with the names already filled in;
      * optionally, keeps the sharing tab open across restarts and stops the
        machine going to sleep while it is sharing.

    IT DOES NOT need administrator rights for any of that except the optional
    "keep running" parts, and it will tell you when it wants them rather than
    demanding them up front.

    READ IT BEFORE YOU RUN IT. That is not a formality. If somebody telephoned
    you and asked you to run this, hang up and ring back on a number you found
    yourself. This script is published with its own source as a text file and a
    checksum for exactly this reason.

    USAGE
    -----
      Double-click launch.bat, or:

      powershell -NoProfile -ExecutionPolicy Bypass -File .\windows-share-setup.ps1

      -Folders "D:\Photos","C:\Users\me\Documents\Invoices"
                          Skip the folder chooser and use these.
      -ShareRoot "C:\Shared"
                          Where the links go. Default: %USERPROFILE%\Shared
      -KeepRunning        Also set up the login task, the browser policy and the
                          sleep settings. Asks for administrator when it needs it.
      -NoJunctions        Do not create links; just collect the folder list.
      -Undo               Remove everything this script created.
      -WhatIf             Say what would happen and change nothing.

    SPEC-SHARING.md section 4 is the design this implements.
#>

[CmdletBinding(SupportsShouldProcess = $true)]
param(
    [string[]] $Folders,
    [string]   $ShareRoot,
    [string]   $BrowserProfile,
    [switch]   $KeepRunning,
    [switch]   $NoJunctions,
    [switch]   $Undo
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# The site this machine will share to. One constant, used everywhere, because a
# second copy of a URL is a second thing to get wrong when a domain changes.
$Script:SiteOrigin = 'https://mcclevarty.ca'
$Script:SharePage  = "$Script:SiteOrigin/share"
$Script:TaskName   = 'mcclevarty-sharing-tab'
$Script:MarkerName = '.mcclevarty-share-root'

# Collected as we go and printed at the end, in the manner of the Pi and
# ThinkCentre scripts: anything the script could not do itself becomes an
# instruction to a human rather than a silent omission.
$Script:Manual = New-Object System.Collections.ArrayList


# ---------------------------------------------------------------------------
# Output. Plain, and quiet about its own cleverness.
# ---------------------------------------------------------------------------

function Write-Step   { param([string] $Message) Write-Host ""; Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Note   { param([string] $Message) Write-Host "    $Message" }
function Write-Good   { param([string] $Message) Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn   { param([string] $Message) Write-Host "    $Message" -ForegroundColor Yellow }
function Write-Fail   { param([string] $Message) Write-Host "    $Message" -ForegroundColor Red }
function Add-Manual   { param([string] $Message) [void] $Script:Manual.Add($Message) }


# ---------------------------------------------------------------------------
# Refuse to run anywhere it does not belong.
#
# `scripts/pi-setup.sh` and `scripts/thinkcentre-setup.sh` each hard-refuse on
# the other's hardware for the same reason: half-working on the wrong machine is
# worse than not running at all, because the person then has to work out which
# half they got.
# ---------------------------------------------------------------------------

function Assert-Windows {
    if ($env:OS -ne 'Windows_NT') {
        throw "This is the Windows setup script and this is not Windows. There are macOS and Linux versions on the same page."
    }

    $version = [System.Environment]::OSVersion.Version
    if ($version.Major -lt 10) {
        throw "This needs Windows 10 or later. Chrome's folder-sharing API does not exist on older versions, so the website could not use the folders even if this script prepared them."
    }

    if ($PSVersionTable.PSVersion.Major -lt 5) {
        throw "This needs PowerShell 5 or later. Windows 10 and 11 ship with it; if you are on something older, the version here is $($PSVersionTable.PSVersion)."
    }
}

function Test-Administrator {
    $identity  = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = New-Object Security.Principal.WindowsPrincipal($identity)
    return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}


# ---------------------------------------------------------------------------
# JSON, written by hand.
#
# `ConvertTo-Json` is not used, and that is deliberate rather than fussy. In
# Windows PowerShell 5.1 it turns a one-element array into a bare object, so a
# person sharing exactly one folder would produce a setup code the website
# refuses — and it would work perfectly for everyone testing with two. The code
# is a wire format read by a decoder that refuses malformed input by design, so
# it is worth twenty lines to know exactly what is being emitted.
# ---------------------------------------------------------------------------

function ConvertTo-JsonString {
    param([string] $Value)

    # BRANCH ON THE CODE POINT, NEVER ON `switch`.
    #
    # This was a `switch` over character literals, and PowerShell's `switch`
    # compares with a LINGUISTIC comparison, not an ordinal one. Characters with
    # zero collation weight all compare equal to each other, and U+0008 was the
    # first zero-weight clause in the list — so a zero-width space, a soft
    # hyphen, an emoji variation selector and a zero-width joiner every one of
    # them matched the backspace clause and were written out as \b.
    #
    # Measured: a folder called "Photos <emoji>" produced the label "Photos \b",
    # which the site's decoder then refused outright, because its CONTROL check
    # rejects U+0008. The customer's links were already made and their code was
    # unusable with no explanation. `switch -CaseSensitive` does NOT fix it, and
    # `-eq` does not have the fault — it is specific to `switch`.
    #
    # An integer comparison has no collation and no locale.
    $builder = New-Object System.Text.StringBuilder
    [void] $builder.Append('"')
    foreach ($char in $Value.ToCharArray()) {
        $code = [int] $char
        if     ($code -eq 34) { [void] $builder.Append('\"') }
        elseif ($code -eq 92) { [void] $builder.Append('\\') }
        elseif ($code -eq 8)  { [void] $builder.Append('\b') }
        elseif ($code -eq 12) { [void] $builder.Append('\f') }
        elseif ($code -eq 10) { [void] $builder.Append('\n') }
        elseif ($code -eq 13) { [void] $builder.Append('\r') }
        elseif ($code -eq 9)  { [void] $builder.Append('\t') }
        elseif ($code -lt 32 -or $code -eq 127) {
            [void] $builder.AppendFormat('\u{0:x4}', $code)
        }
        else { [void] $builder.Append($char) }
    }
    [void] $builder.Append('"')
    return $builder.ToString()
}

function New-SetupCode {
    param(
        [string] $MachineName,
        [object[]] $Entries   # each: @{ Label = ...; Path = ... }
    )

    $parts = @()
    foreach ($entry in $Entries) {
        $parts += ('{{"l":{0},"p":{1}}}' -f
            (ConvertTo-JsonString $entry.Label),
            (ConvertTo-JsonString $entry.Path))
    }

    $json  = '{"n":' + (ConvertTo-JsonString $MachineName) + ',"f":[' + ($parts -join ',') + ']}'
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)

    # base64url: the website's decoder accepts this alphabet and no other.
    $code = [System.Convert]::ToBase64String($bytes)
    $code = $code.Replace('+', '-').Replace('/', '_').TrimEnd('=')

    return 'VS1.' + $code
}


# ---------------------------------------------------------------------------
# Choosing folders.
# ---------------------------------------------------------------------------

function Select-FoldersInteractively {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null

    $chosen = New-Object System.Collections.ArrayList
    Write-Note "A folder chooser will open. Pick a folder you want to share, then pick"
    Write-Note "another, and so on. Press Cancel when you have chosen them all."
    Write-Note ""

    while ($true) {
        $dialog = New-Object System.Windows.Forms.FolderBrowserDialog
        $dialog.Description  = "Choose a folder to share (Cancel when finished)"
        $dialog.ShowNewFolderButton = $false
        if ($chosen.Count -gt 0) {
            $dialog.Description = "Chosen so far: $($chosen.Count). Pick another, or Cancel to finish."
        }

        $result = $dialog.ShowDialog()
        if ($result -ne [System.Windows.Forms.DialogResult]::OK) { break }

        $path = $dialog.SelectedPath
        if ([string]::IsNullOrWhiteSpace($path)) { continue }

        if ($chosen -contains $path) {
            Write-Warn "Already on the list: $path"
            continue
        }

        [void] $chosen.Add($path)
        Write-Good "Added: $path"
    }

    return $chosen.ToArray()
}

<#
    Refuse the folders that will not work, and say why.

    THE BLOCKLIST. This is a security control, not a convenience check.

    It used to say the browser would refuse these anyway, and that framing was
    wrong in the one case it exists for. Chrome refuses them as a PICK. A
    junction to one of them INSIDE a picked folder is read normally — crbug
    40061477 — and this script recommends picking the share root as a single
    folder, so nothing downstream catches a miss.

    -Resolved receives the path this approved, with reparse points followed, and
    THE CALLER MUST JUNCTION THAT ONE. It used to resolve, check what it
    resolved to, and hand back nothing — so the caller re-derived an unresolved
    GetFullPath and linked the alias instead. `mydocs -> Documents` passed, the
    junction recorded `mydocs`, and repointing that afterwards put whatever it
    then aimed at under the share root. The identity checked and the identity
    shared were simply different, permanently; it was never a race.
#>
function Test-ShareableFolder {
    param([string] $Path, [ref] $Resolved)

    if (-not (Test-Path -LiteralPath $Path -PathType Container)) {
        return "That folder does not exist (or is not a folder): $Path"
    }

    if ($Path.Length -gt 400) {
        return "That folder's path is too long to share ($($Path.Length) characters, limit 400): $Path"
    }

    # Refuse UNC and device paths outright. `\\localhost\C$\Users\me` and
    # `\\?\C:\Users\me` are ordinary aliases for local directories that matched
    # nothing in the list and sailed past the drive-root length check, and
    # `GetFullPath` on a device path can throw with $ErrorActionPreference set
    # to Stop — aborting the run mid-way rather than refusing one folder.
    if ($Path.StartsWith('\\')) {
        return "A network or device path cannot be shared: $Path`n      Use the ordinary drive letter path instead."
    }

    $full = $null
    try {
        $full = [System.IO.Path]::GetFullPath($Path).TrimEnd('\')
    } catch {
        return "Could not work out where that folder really is, so it will not be shared: $Path"
    }

    # THE DRIVE ROOT IS REFUSED HERE, BEFORE THE REPARSE WALK, and the order is
    # the point. `C:\` trims to `C:`, and `Get-Item -LiteralPath 'C:'` is a
    # DRIVE-RELATIVE path — it returns the process's current directory on C:,
    # not the root. If that directory happened to be a junction, the walk below
    # would rewrite $full to its target, and the drive root would then be
    # accepted and linked to somewhere else entirely. Refusing the root first
    # costs nothing: browsers do not issue a handle to one anyway.
    #
    # `C:\` is also in $blockExact via GetPathRoot, which trims to the same
    # `C:`; this catches every OTHER drive letter, which that entry does not.
    if ($full.Length -le 3) {
        return "A whole drive cannot be shared: $full`n      Browsers do not issue a handle to a drive root. Share the folders on it."
    }

    # RESOLVE REPARSE POINTS BEFORE COMPARING. `GetFullPath` normalises `.`,
    # `..`, doubled separators and forward slashes, and `-ieq` covers case — but
    # it does NOT follow a junction or a symlink. A folder that is itself a
    # junction to %LOCALAPPDATA%\Google\Chrome\User Data passed every check and
    # was then re-linked into the share root.
    #
    # `ResolveLinkTarget` is .NET 6+ and absent from Windows PowerShell 5.1, so
    # walk `.Target` instead. Bounded, and it FAILS CLOSED: a link that cannot
    # be resolved is refused rather than compared as itself.
    try {
        $walk = Get-Item -LiteralPath $full -Force -ErrorAction Stop
        $hops = 0
        while ($walk.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
            $target = $walk.Target
            if (-not $target) {
                return "That folder is a link this script cannot follow, so it will not be shared: $full"
            }
            if ($target -is [array]) { $target = $target[0] }
            if (-not [System.IO.Path]::IsPathRooted($target)) {
                $target = Join-Path (Split-Path -Parent $walk.FullName) $target
            }
            $full = [System.IO.Path]::GetFullPath($target).TrimEnd('\')
            $hops++
            if ($hops -gt 8) {
                return "That folder is a chain of links this script will not follow: $Path"
            }
            $walk = Get-Item -LiteralPath $full -Force -ErrorAction Stop
        }
    } catch {
        return "Could not work out where that folder really is, so it will not be shared: $Path"
    }

    # And again, now the links have been followed: a junction whose TARGET is a
    # drive root arrives here as `D:`, which the check above never saw and which
    # $blockExact does not name for any drive but the system one.
    if ($full.Length -le 3) {
        return "A whole drive cannot be shared: $full`n      Browsers do not issue a handle to a drive root. Share the folders on it."
    }

    # 8.3 short names are not expanded by GetFullPath, so `C:\PROGRA~1` and
    # `C:\Users\PATRIC~1` walked straight past the list. PROGRA~1 is stable on
    # every Windows install, so this is a deterministic bypass, not a curiosity.
    if ($full -match '~\d') {
        return "That looks like a shortened (8.3) path, which this script will not resolve safely: $full`n      Open the folder in Explorer and copy its full name from the address bar."
    }

    # Blocked outright, but their children are fine — you may share Documents,
    # you may not share the profile that contains it.
    $blockExact = @(
        $env:SystemRoot,
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)},
        $env:ProgramData,
        $env:USERPROFILE,
        $env:LOCALAPPDATA,
        $env:APPDATA,
        # THE PARENT OF EVERY PROFILE. Absent until 2026-08-27, and its absence
        # was the cheapest exploit on the page: "type C:\Users in the box" hands
        # over every account on the machine, and the share root lives inside it,
        # so the junction was recursive too. Split-Path directly, with no
        # Join-Path '' trick — that left a trailing separator TrimEnd did not
        # always strip, and the entry then matched nothing.
        (Split-Path -Parent $env:USERPROFILE),
        [System.IO.Path]::GetPathRoot($env:SystemRoot)
    ) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') }

    # Blocked along with everything underneath. These are the directories Chrome
    # blocks with block-all-children semantics, which is exactly why the script
    # must not hand them over by a route Chrome never sees.
    #
    # BLOCK THE ANCESTOR, NOT THE LEAF. A blocked directory whose parent is
    # shareable is not blocked at all — nothing downstream catches the miss.
    # Two were exactly that: %LOCALAPPDATA%\Google\Chrome\User Data was refused
    # while %LOCALAPPDATA%\Google, which contains it along with the cookies and
    # Login Data, was allowed; and %APPDATA%\Microsoft\Crypto was refused while
    # %APPDATA%\Microsoft, which holds the DPAPI master keys that decrypt them,
    # was allowed. The vendor directories are named instead of their leaves.
    $blockPrefix = @(
        $env:SystemRoot,
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)},
        (Join-Path $env:USERPROFILE '.ssh'),
        (Join-Path $env:USERPROFILE '.aws'),
        (Join-Path $env:USERPROFILE '.gnupg'),
        (Join-Path $env:USERPROFILE '.docker'),
        (Join-Path $env:USERPROFILE '.kube'),
        (Join-Path $env:APPDATA 'Microsoft'),
        (Join-Path $env:APPDATA 'Mozilla'),
        (Join-Path $env:LOCALAPPDATA 'Google'),
        (Join-Path $env:LOCALAPPDATA 'Microsoft'),
        (Join-Path $env:LOCALAPPDATA 'Mozilla')
    ) | Where-Object { $_ } | ForEach-Object { $_.TrimEnd('\') }

    foreach ($bad in $blockExact) {
        if ($full -ieq $bad) {
            return "That folder holds far more than you mean to share, so it will not be linked: $full`n      Share the folders inside it instead — Documents, or Pictures, rather than the whole profile."
        }
    }

    foreach ($bad in $blockPrefix) {
        if ($full.StartsWith($bad + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
            return "That folder is inside somewhere private and will not be shared: $full`n      It holds credentials or system files, not documents."
        }
    }

    # A folder that CONTAINS the share root would make the links recursive, and
    # the default share root is inside the profile, so this is reachable.
    $rootFull = $null
    try { $rootFull = [System.IO.Path]::GetFullPath($ShareRoot).TrimEnd('\') } catch { }
    if ($rootFull -and $rootFull.StartsWith($full + '\', [System.StringComparison]::OrdinalIgnoreCase)) {
        return "That folder contains the share folder itself, which would nest without end: $full"
    }

    if ($Resolved) { $Resolved.Value = $full }
    return $null
}


# ---------------------------------------------------------------------------
# The share root and its links.
#
# A junction is used rather than a symbolic link because creating a symbolic
# link on Windows needs administrator rights (or Developer Mode) and creating a
# junction does not. The whole prepare step therefore runs as an ordinary user,
# which matters: a script that demands administrator to do its safe half trains
# people to give administrator to scripts.
# ---------------------------------------------------------------------------

function Initialize-ShareRoot {
    param([string] $Root)

    if (-not (Test-Path -LiteralPath $Root)) {
        if ($PSCmdlet.ShouldProcess($Root, "Create the share folder")) {
            [void] (New-Item -ItemType Directory -Path $Root -Force)
            Write-Good "Created $Root"
        }
    } else {
        Write-Note "Using the existing folder $Root"
    }

    # A marker, so -Undo can tell a folder this script made from one that
    # happened to be called Shared and belongs to somebody.
    $marker = Join-Path $Root $Script:MarkerName
    if (-not (Test-Path -LiteralPath $marker)) {
        if ($PSCmdlet.ShouldProcess($marker, "Write the marker file")) {
            Set-Content -LiteralPath $marker -Encoding UTF8 -Value @(
                "This folder was set up by the mcclevarty.ca sharing script.",
                "The entries in it are links to folders elsewhere on this machine;",
                "deleting a link here does not delete the folder it points at.",
                "Re-run the script with -Undo to remove them and this file."
            )
            (Get-Item -LiteralPath $marker -Force).Attributes = 'Hidden'
        }
    }
}

function New-FolderLink {
    param(
        [string] $Root,
        [string] $Target,
        [string] $Label
    )

    $linkPath = Join-Path $Root $Label

    if (Test-Path -LiteralPath $linkPath) {
        $existing = Get-Item -LiteralPath $linkPath -Force
        if ($existing.LinkType -eq 'Junction') {
            Write-Note "Link already there: $Label"
            return $linkPath
        }
        Write-Warn "Something that is not a link is already called '$Label' in the share folder; skipping it."
        Add-Manual "A file or folder called '$Label' was already in $Root, so no link was made for $Target. Rename one of them and re-run."
        return $null
    }

    if ($PSCmdlet.ShouldProcess($linkPath, "Link to $Target")) {
        try {
            [void] (New-Item -ItemType Junction -Path $linkPath -Target $Target -ErrorAction Stop)
            Write-Good "Linked $Label -> $Target"
            return $linkPath
        } catch {
            Write-Warn "Could not link $Label ($($_.Exception.Message))"
            Add-Manual "Could not create a link for $Target. It will still be on the checklist, so you can add it in the browser directly."
            return $null
        }
    }

    return $null
}

<#
    Junctions cannot cross to a different machine and behave oddly on network
    drives and on anything that is not NTFS. Rather than discovering that as a
    failure, say so before trying.
#>
function Test-Junctionable {
    param([string] $Target)

    if ($Target.StartsWith('\\')) {
        return "It is on the network, and a junction cannot point at a network location."
    }

    try {
        $root = [System.IO.Path]::GetPathRoot($Target)
        $drive = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DeviceID='$($root.TrimEnd('\'))'" -ErrorAction Stop
        if ($drive -and $drive.FileSystem -and $drive.FileSystem -ne 'NTFS') {
            return "The drive is formatted $($drive.FileSystem), which does not support links."
        }
    } catch {
        # Not knowing is not a reason to refuse; the link attempt will report.
    }

    return $null
}


# ---------------------------------------------------------------------------
# The optional "keep it running" half. Each piece is separately skippable and
# each one says what it changed.
# ---------------------------------------------------------------------------

<#
    Pre-approve the site for the folder-permission prompt.

    This does NOT grant access to any folder. Chrome's
    FileSystemReadAskForUrls policy means the site may *ask* without the extra
    "this site wants to view files" gate; the folder picker itself still opens
    and you still choose the folder. The Linux hosts do the same thing through
    a managed policy file, and the reasoning is recorded there: that prompt IS
    the folder picker the machine exists to answer.
#>
function Set-BrowserPolicy {
    if (-not (Test-Administrator)) {
        Add-Manual "The browser policy was not set, because that needs administrator. Re-run from an administrator PowerShell with -KeepRunning if you want it. Without it, sharing still works — the browser asks one extra time."
        Write-Warn "Skipping the browser policy (needs administrator)."
        return
    }

    foreach ($vendor in @('Google\Chrome', 'Microsoft\Edge')) {
        $key = "HKLM:\SOFTWARE\Policies\$vendor"
        if (-not (Test-Path $key)) {
            if (-not $PSCmdlet.ShouldProcess($key, "Create the policy key")) { continue }
            [void] (New-Item -Path $key -Force)
        }

        $listKey = Join-Path $key 'FileSystemReadAskForUrls'
        if (-not (Test-Path $listKey)) {
            if (-not $PSCmdlet.ShouldProcess($listKey, "Create the allowlist")) { continue }
            [void] (New-Item -Path $listKey -Force)
        }

        # The list is numbered from 1, and re-running must not add a duplicate.
        $existing = (Get-Item -Path $listKey).GetValueNames() |
            ForEach-Object { (Get-ItemProperty -Path $listKey -Name $_).$_ }

        if ($existing -contains $Script:SiteOrigin) {
            Write-Note "Already allowed for $vendor."
            continue
        }

        # `$existing` holds value DATA, not names, so using it as the guard
        # meant a key whose only entry was an empty string short-circuited the
        # loop, left $next at 1, and overwrote whatever entry 1 already held —
        # somebody else's policy. Ask for the names, and filter the unnamed
        # default value, which `Get-ItemProperty -Name ''` cannot read.
        $names = (Get-Item -Path $listKey).GetValueNames() | Where-Object { $_ }
        $next = 1
        while ($names -contains "$next") { $next++ }

        if ($PSCmdlet.ShouldProcess("$listKey\$next", "Allow $Script:SiteOrigin")) {
            Set-ItemProperty -Path $listKey -Name "$next" -Value $Script:SiteOrigin
            Write-Good "Allowed $Script:SiteOrigin in $vendor."
        }
    }
}

<#
    Open the sharing tab when this person logs in.

    A logon task rather than a Startup shortcut, because a task can be listed,
    disabled and removed by name — which is what -Undo needs, and what somebody
    auditing their own machine deserves to be able to do.
#>
function Register-LoginTask {
    $browser = Get-BrowserPath
    if (-not $browser) {
        Add-Manual "No Chrome or Edge was found, so no login task was created. Install one and re-run, or open $Script:SharePage yourself after each restart."
        Write-Warn "No Chrome or Edge found; skipping the login task."
        return
    }

    if (-not $PSCmdlet.ShouldProcess($Script:TaskName, "Register a logon task")) { return }

    # WHICH PROFILE. This is the most bug-prone line in the whole script.
    #
    # The folder handles live in one Chrome profile's storage, not in Chrome.
    # Opening the sharing page in a different profile gets a page that has never
    # heard of this machine — which the site handles as a routine "pair this
    # machine" rather than an error, but the person has to work out why they are
    # being asked again. With no -BrowserProfile given, the browser opens in
    # whichever profile was last used, which is right for the very common case
    # of one profile and wrong the moment there are two.
    $arguments = "--new-window $Script:SharePage"
    if ($BrowserProfile) {
        $arguments = "--profile-directory=`"$BrowserProfile`" $arguments"
        Write-Note "The login task will use the '$BrowserProfile' browser profile."
    } else {
        Add-Manual "The login task opens whichever browser profile was last used. If you keep more than one Chrome or Edge profile, re-run with -BrowserProfile ""Default"" (or ""Profile 1"", etc) so the sharing tab always opens in the one holding your folders."
    }

    try {
        $action    = New-ScheduledTaskAction -Execute $browser -Argument $arguments
        $trigger   = New-ScheduledTaskTrigger -AtLogOn -User $env:USERNAME
        $settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
        $principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

        Register-ScheduledTask -TaskName $Script:TaskName -Action $action -Trigger $trigger `
            -Settings $settings -Principal $principal -Force -ErrorAction Stop | Out-Null

        Write-Good "The sharing tab will open when you log in."
    } catch {
        Add-Manual "Could not create the login task ($($_.Exception.Message)). Open $Script:SharePage yourself after each restart."
        Write-Warn "Could not create the login task."
    }
}

function Get-BrowserPath {
    $candidates = @(
        "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
        "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
        "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe",
        "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
        "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
    )
    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path -LiteralPath $candidate)) { return $candidate }
    }
    return $null
}

<#
    Stop the machine sleeping while it is plugged in.

    The display is left alone deliberately — a dark screen costs nothing and
    somebody who finds their monitor never sleeping again will rightly be
    annoyed. Sleep on battery is also left alone, for the obvious reason.
#>
function Disable-Sleep {
    if (-not (Test-Administrator)) {
        Add-Manual "Sleep settings were not changed (needs administrator). If this machine sleeps, sharing stops until it wakes. Settings > System > Power > Screen and sleep."
        Write-Warn "Skipping the sleep settings (needs administrator)."
        return
    }

    if (-not $PSCmdlet.ShouldProcess("power settings", "Stop the machine sleeping on mains power")) { return }

    try {
        & powercfg /change standby-timeout-ac 0 | Out-Null
        & powercfg /change hibernate-timeout-ac 0 | Out-Null
        Write-Good "This machine will not sleep while plugged in. The screen still turns off."

        # Closing the lid is a different setting from going idle, and this
        # script deliberately does not change it.
        #
        # Somebody who shuts a laptop expects it to sleep. Silently teaching it
        # not to means a bag with a hot computer in it, and the person would
        # have no idea which of the things they ran did that. So: say it, and
        # let them decide.
        $battery = Get-CimInstance -ClassName Win32_Battery -ErrorAction SilentlyContinue
        if ($battery) {
            Write-Warn "This looks like a laptop. Closing the lid still sends it to sleep,"
            Write-Warn "and sharing stops while it sleeps — that setting is left alone on"
            Write-Warn "purpose, because a laptop that never sleeps in a bag gets very hot."
            Add-Manual "If you want to share with the lid shut, set 'When I close the lid' to 'Do nothing' (plugged in only) in Control Panel > Power Options > Choose what closing the lid does. Consider whether you actually want that before you do."
        }
    } catch {
        Add-Manual "Could not change the sleep settings. Set 'Sleep' to Never on mains power in Settings > System > Power."
        Write-Warn "Could not change the sleep settings."
    }
}


# ---------------------------------------------------------------------------
# Undo.
# ---------------------------------------------------------------------------

function Invoke-Undo {
    param([string] $Root)

    Write-Step "Removing what this script created"

    $marker = Join-Path $Root $Script:MarkerName
    if (Test-Path -LiteralPath $Root) {
        if (Test-Path -LiteralPath $marker) {
            foreach ($item in Get-ChildItem -LiteralPath $Root -Force) {
                if ($item.LinkType -eq 'Junction') {
                    if ($PSCmdlet.ShouldProcess($item.FullName, "Remove the link")) {
                        # Remove the reparse point, never the target. Directory
                        # deletion through a junction is the classic way to
                        # delete somebody's photographs by accident.
                        [System.IO.Directory]::Delete($item.FullName, $false)
                        Write-Good "Removed the link $($item.Name) (the folder it pointed at is untouched)"
                    }
                }
            }
            if ($PSCmdlet.ShouldProcess($marker, "Remove the marker")) {
                Remove-Item -LiteralPath $marker -Force
            }
            Write-Note "Left $Root itself in place, in case you put something in it."
        } else {
            Write-Warn "$Root has no marker file, so this script did not create it. Leaving it alone."
        }
    }

    # Get-ScheduledTask does not exist on every edition, and a missing cmdlet
    # throws rather than returning nothing — so this asks whether the command
    # is there before asking it anything.
    if (Get-Command -Name Get-ScheduledTask -ErrorAction SilentlyContinue) {
        if (Get-ScheduledTask -TaskName $Script:TaskName -ErrorAction SilentlyContinue) {
            if ($PSCmdlet.ShouldProcess($Script:TaskName, "Remove the login task")) {
                Unregister-ScheduledTask -TaskName $Script:TaskName -Confirm:$false
                Write-Good "Removed the login task."
            }
        }
    } else {
        Add-Manual "Could not check for the login task on this edition of Windows. If you set one up, remove '$Script:TaskName' in Task Scheduler."
    }

    if (Test-Administrator) {
        foreach ($vendor in @('Google\Chrome', 'Microsoft\Edge')) {
            $listKey = "HKLM:\SOFTWARE\Policies\$vendor\FileSystemReadAskForUrls"
            if (Test-Path $listKey) {
                foreach ($name in (Get-Item -Path $listKey).GetValueNames()) {
                    if ((Get-ItemProperty -Path $listKey -Name $name).$name -eq $Script:SiteOrigin) {
                        if ($PSCmdlet.ShouldProcess("$listKey\$name", "Remove the allowlist entry")) {
                            Remove-ItemProperty -Path $listKey -Name $name
                            Write-Good "Removed the browser policy entry for $vendor."
                        }
                    }
                }
            }
        }
    } else {
        Add-Manual "The browser policy entry was left in place, because removing it needs administrator."
    }

    Write-Note ""
    Write-Note "The folders on the website are NOT removed by this. Remove them there,"
    Write-Note "on $Script:SharePage, which is the only place that can."
}


# ---------------------------------------------------------------------------
# Main.
# ---------------------------------------------------------------------------

function Main {
    Assert-Windows

    if (-not $ShareRoot) { $ShareRoot = Join-Path $env:USERPROFILE 'Shared' }

    Write-Host ""
    Write-Host "  Sharing setup for mcclevarty.ca" -ForegroundColor White
    Write-Host "  ------------------------------" -ForegroundColor DarkGray

    if ($Undo) { Invoke-Undo -Root $ShareRoot; Show-Manual; return }

    Write-Note ""
    Write-Note "This prepares folders on this machine. It does not send any file"
    Write-Note "anywhere, and it cannot: only you can hand a folder to the browser,"
    Write-Note "by clicking Select Folder when the website asks."
    Write-Note ""
    Write-Note "Share folder:  $ShareRoot"
    Write-Note "Keep running:  $(if ($KeepRunning) { 'yes — login task, browser policy, no sleep' } else { 'no (add -KeepRunning for that)' })"

    # ---- 1. which folders -------------------------------------------------
    Write-Step "Choosing folders"

    # @() is load-bearing, not decoration. A one-element array UNROLLS on
    # return, so choosing exactly one folder made $selected a [string], and
    # `Set-StrictMode -Version 2.0` suppresses the scalar .Count shim — so
    # $selected.Count threw and the script died. Measured on real PowerShell:
    # fine at StrictMode 1.0 and off, fatal at 2.0 and above. It worked with two
    # folders, which is why it would have survived every test but the first real
    # one. Same shape as the ConvertTo-Json trap this file already documents.
    $selected = @(if ($Folders) { $Folders } else { Select-FoldersInteractively })

    if (-not $selected -or $selected.Count -eq 0) {
        Write-Warn "No folders chosen, so there is nothing to do."
        return
    }

    $entries = New-Object System.Collections.ArrayList
    $usedLabels = @{}

    foreach ($path in $selected) {
        # $full is the path the check APPROVED, reparse points followed. The
        # unresolved GetFullPath this used to recompute here checked one folder
        # and junctioned another.
        $full = $null
        $problem = Test-ShareableFolder -Path $path -Resolved ([ref] $full)
        if ($problem) { Write-Fail $problem; continue }
        if (-not $full) { Write-Fail "Could not work out where that folder really is, so it will not be shared: $path"; continue }

        # The label is what the website will call it, and what anybody you later
        # share with will see. The folder's own name is the obvious start; the
        # person can rename it on the site. It comes off the resolved path, so it
        # names the folder that is actually shared rather than the alias typed.
        $label = Split-Path -Leaf $full
        if ([string]::IsNullOrWhiteSpace($label)) { $label = 'Folder' }
        if ($label.Length -gt 40) { $label = $label.Substring(0, 40) }

        $base = $label; $n = 2
        while ($usedLabels.ContainsKey($label)) { $label = "$base $n"; $n++ }
        $usedLabels[$label] = $true

        [void] $entries.Add(@{ Label = $label; Path = $full })
    }

    if ($entries.Count -eq 0) {
        Write-Fail "None of the folders chosen can be shared. Nothing was changed."
        return
    }

    if ($entries.Count -gt 24) {
        Write-Warn "That is more than 24 folders, which is as many as one setup code carries."
        Write-Warn "Only the first 24 are included; run the script again for the rest."
        while ($entries.Count -gt 24) { $entries.RemoveAt($entries.Count - 1) }
    }

    # ---- 2. a name for this machine ---------------------------------------
    Write-Step "Naming this machine"
    Write-Note "This is asked rather than taken from the computer, because the name is"
    Write-Note "visible to anyone you later share a folder with, and computer names"
    Write-Note "tend to have people's names in them."

    $machineName = ''
    if (-not $Folders) {
        $machineName = (Read-Host "  A name for this machine (Enter to decide on the website)").Trim()
        if ($machineName.Length -gt 40) { $machineName = $machineName.Substring(0, 40) }
    }

    # ---- 3. the links ------------------------------------------------------
    if (-not $NoJunctions) {
        Write-Step "Putting links in one folder"
        Initialize-ShareRoot -Root $ShareRoot

        foreach ($entry in $entries) {
            $why = Test-Junctionable -Target $entry.Path
            if ($why) {
                Write-Warn "No link for '$($entry.Label)': $why"
                Write-Note "  It is still on the checklist, so add it in the browser directly."
                continue
            }
            [void] (New-FolderLink -Root $ShareRoot -Target $entry.Path -Label $entry.Label)
        }
    }

    # ---- 4. keep it running ------------------------------------------------
    if ($KeepRunning) {
        Write-Step "Keeping it running"
        Set-BrowserPolicy
        Register-LoginTask
        Disable-Sleep
    }

    # ---- 5. the setup code -------------------------------------------------
    Write-Step "Your setup code"

    $code = New-SetupCode -MachineName $machineName -Entries $entries.ToArray()

    $codeFile = Join-Path $ShareRoot 'setup-code.txt'
    try {
        if ($PSCmdlet.ShouldProcess($codeFile, "Write the setup code")) {
            Set-Content -LiteralPath $codeFile -Encoding UTF8 -Value @(
                "Paste this into the box on $Script:SharePage",
                "",
                $code,
                "",
                "It lists the folders you chose. It is not a password and it opens nothing:",
                "you still have to pick each folder in the browser yourself."
            )
        }
    } catch {
        Write-Warn "Could not write $codeFile — the code is printed below either way."
    }

    $copied = $false
    try {
        Set-Clipboard -Value $code -ErrorAction Stop
        $copied = $true
    } catch {
        # Clipboard access fails in a session with no window station. Not fatal.
    }

    Write-Host ""
    Write-Host $code -ForegroundColor White
    Write-Host ""
    if ($copied) { Write-Good "Copied to your clipboard." }
    Write-Note "Also saved to $codeFile"

    # ---- 6. what to do next ------------------------------------------------
    Write-Step "What to do now"
    Write-Note "1. Open $Script:SharePage and sign in."
    Write-Note "2. Paste the code into the setup box (Ctrl+V)."
    Write-Note "3. It will list your folders. Click each one and choose it in the picker."
    if (-not $NoJunctions) {
        Write-Note ""
        Write-Note "   Worth a try first: choose $ShareRoot itself as a single folder."
        Write-Note "   If your browser follows the links this script made, that shares"
        Write-Note "   everything in one go. If it does not, nothing is harmed — use the"
        Write-Note "   list above instead."
    }
    Write-Note "4. Leave that tab open. It is what serves the files."
    Write-Note ""
    Write-Note "Nothing is shared with anybody else until you say so on the website."

    Show-Manual
}

function Show-Manual {
    if ($Script:Manual.Count -eq 0) { return }
    Write-Step "Things this script could not do"
    foreach ($item in $Script:Manual) { Write-Warn "* $item" }
}

try {
    Main
} catch {
    Write-Host ""
    Write-Fail $_.Exception.Message
    Write-Host ""
    exit 1
}
