#!/usr/bin/env bash
#
# Build the publishable setup-script bundle (SPEC-SHARING.md §4).
#
# The download page offers each script THREE ways, and all three come from here
# so they cannot drift apart:
#
#   1. the script itself, to run;
#   2. the same bytes as a .txt, to read — or to paste into an AI and ask
#      whether it is malicious, which is a thing the page invites and which is a
#      better instinct than trusting a download page;
#   3. a SHA-256, so what arrived can be checked against what was published.
#
# The checksums are generated here rather than written into a document, because
# a checksum in a document is wrong the first time a script changes and nobody
# finds out — the failure being that a person checks it, sees a mismatch, and
# reasonably concludes they have been given something tampered with.
#
# Usage:  bash scripts/setup-bundle.sh [outdir]     (default: dist-setup/)

set -euo pipefail

OUT="${1:-dist-setup}"
HERE="$(cd "$(dirname "$0")" && pwd)"

FILES=(
    "windows-share-setup.ps1"
    "launch.bat"
    "macos-share-setup.sh"
    "linux-share-setup.sh"
)

# `rm -rf` on a positional argument, in a script about trustworthy downloads.
#
# The guard used to be a denylist of three values — "", "/" and $HOME — which is the wrong shape:
# everything it does not name is deleted, and `bash setup-bundle.sh ~/Documents`, `../src` or
# `/etc` were all named by nothing. It is an allowlist now, and it is two rules.
#
# 1. The path must be relative, free of `..`, and not `.` — so it cannot leave the repo.
MARKER=".setup-bundle"
case "$OUT" in
    ""|.|./|/*|~*)        printf 'refusing to build into %s: give a relative directory\n' "${OUT:-<empty>}" >&2; exit 1 ;;
    ..|../*|*/..|*/../*)  printf 'refusing to build into %s: no .. in the output path\n' "$OUT" >&2; exit 1 ;;
esac
OUT="${OUT%/}"

# 2. It must be a directory this script built, or one that does not exist yet. The marker is the
#    same doctrine the share scripts' --undo already follows: never delete a directory you did not
#    create. Somebody who points this at a folder holding work loses the folder, not the argument.
if [ -e "$OUT" ]; then
    if [ ! -d "$OUT" ] || [ ! -f "$OUT/$MARKER" ]; then
        printf 'refusing to delete %s: it was not built by this script (no %s in it)\n' "$OUT" "$MARKER" >&2
        printf 'remove it yourself if that is what you meant.\n' >&2
        exit 1
    fi
fi

rm -rf "$OUT"
mkdir -p "$OUT"
printf 'Built by scripts/setup-bundle.sh. This file is what lets the next run delete this folder.\n' > "$OUT/$MARKER"

# Two encoding facts the bundle refuses to ship without, because each fails at
# the customer and not here (2026-09-02, TODO 2026-08-27 item 2):
#
#   - The .ps1 must be UTF-8 WITH a BOM. Windows PowerShell 5.1 reads a BOM-less
#     file with the ANSI code page, so its em dashes render as mojibake on a
#     page whose whole pitch is "read it before you run it".
#   - launch.bat must be ASCII with CRLF endings. cmd.exe has no BOM story at
#     all, so the only safe batch file is one with nothing above 0x7F in it.
#
# Assert, never repair: a silent fix here means the repo copy and the published
# copy differ, and the repo copy is what the check suite greps.
if [ "$(head -c 3 "$HERE/windows-share-setup.ps1" | od -An -tx1 | tr -d ' \n')" != "efbbbf" ]; then
    printf 'windows-share-setup.ps1 has lost its UTF-8 BOM; PowerShell 5.1 would read it as ANSI\n' >&2
    exit 1
fi
if LC_ALL=C grep -q $'[^ -~\r\t]' "$HERE/launch.bat"; then
    printf 'launch.bat contains non-ASCII bytes; cmd.exe reads them with the ANSI code page\n' >&2
    exit 1
fi
if ! grep -q $'\r$' "$HERE/launch.bat"; then
    printf 'launch.bat has lost its CRLF line endings\n' >&2
    exit 1
fi

for name in "${FILES[@]}"; do
    src="$HERE/$name"
    if [ ! -f "$src" ]; then
        printf 'missing: %s\n' "$src" >&2
        exit 1
    fi

    cp "$src" "$OUT/$name"

    # The readable copy is a byte-for-byte duplicate with a .txt extension. It
    # is NOT reformatted or commented differently: the whole value is that it is
    # the same file, so what a cautious person reads is what runs.
    #
    # It still DOWNLOADS rather than opening in the browser. `worker/downloads.ts`
    # sets `content-disposition: attachment` and `octet-stream` on every byte
    # route unconditionally, and that is deliberate — nothing stored can be made
    # to render in the site's origin. So the page must say "download it and open
    # it in Notepad or TextEdit", never "click to read it in your browser".
    cp "$src" "$OUT/${name}.txt"
done

(
    cd "$OUT"
    {
        printf '# SHA-256 checksums for the mcclevarty.ca setup scripts\n'
        printf '#\n'
        printf '# Check a download against this list before running it:\n'
        printf '#\n'
        printf '#   Windows (PowerShell):  Get-FileHash .\\FILENAME -Algorithm SHA256\n'
        printf '#   macOS:                 shasum -a 256 FILENAME\n'
        printf '#   Linux:                 sha256sum FILENAME\n'
        printf '#\n'
        printf '# The .txt copy of each script is the same bytes as the script, so it has\n'
        printf '# the same checksum. That is the point of it: what you read is what runs.\n'
        printf '#\n'
        for name in "${FILES[@]}"; do
            sha256sum "$name" 2>/dev/null || shasum -a 256 "$name"
        done
    } > CHECKSUMS.txt
)

printf '\nBundle written to %s\n\n' "$OUT"
cat "$OUT/CHECKSUMS.txt" | grep -v '^#'
printf '\nUpload these through the downloads editor. docs/DOWNLOADS.md is the runbook;\n'
printf 'ids are a wire format, so add ids and never rename one.\n'
