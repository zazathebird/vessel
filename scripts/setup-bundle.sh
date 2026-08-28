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
# `bash setup-bundle.sh ~` would have deleted the home directory.
case "$OUT" in
    ""|"/"|"$HOME"|"$HOME/") printf 'refusing to build into %s\n' "${OUT:-<empty>}" >&2; exit 1 ;;
esac
rm -rf "$OUT"
mkdir -p "$OUT"

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
