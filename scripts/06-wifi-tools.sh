#!/usr/bin/env bash
# 06 - Wi-Fi + network troubleshooting. Legit diagnostics, no attack tooling.
set -uo pipefail
[[ $EUID -eq 0 ]] || { echo "run with sudo"; exit 1; }
export DEBIAN_FRONTEND=noninteractive
warn(){ echo -e "\033[1;33m[!] $*\033[0m"; }
pkg(){ for p in "$@"; do apt-get install -y "$p" || warn "FAILED: $p"; done; }

apt-get update

# --- Wireless layer ----------------------------------------------------------
# iw       : the modern nl80211 tool. signal, bitrate, retries, roam events.
# wavemon  : live ncurses signal/noise meter. THE walk-around tool.
# linssid  : GUI channel-vs-signal graph. See your APs stomping each other.
pkg iw wireless-tools rfkill wavemon linssid \
    wpasupplicant network-manager-gnome

# --- Bandwidth + interface load ---------------------------------------------
# iftop   : who is talking, live, by host
# nethogs : which PROCESS is eating the link
# bmon/nload : per-interface throughput graph
# vnstat  : long-term history (installs a light logging daemon - worth it)
pkg iftop nethogs bmon nload vnstat

# --- L2/L3 reachability + path -----------------------------------------------
# arping  : is that IP alive at layer 2 (bypasses firewalls that drop ICMP)
# ndisc6  : IPv6 router advertisement / neighbour discovery debugging
# dhcpdump: watch DHCP conversations - catches rogue/duplicate DHCP servers
pkg mtr tracepath iputils-arping ndisc6 dhcpdump avahi-utils \
    knot-dnsutils lsof

# --- Latency/jitter under load ------------------------------------------------
pkg iperf3 netperf

systemctl enable --now vnstat 2>/dev/null

install -m0755 /dev/null /usr/local/bin/wifi-doctor
cat >/usr/local/bin/wifi-doctor <<'EOF'
#!/usr/bin/env bash
# One-shot Wi-Fi health snapshot. No root needed.
IF=$(nmcli -t -f DEVICE,TYPE,STATE dev | awk -F: '$2=="wifi"&&$3=="connected"{print $1;exit}')
[[ -z "$IF" ]] && { echo "no connected wifi interface"; exit 1; }
echo "=== Interface: $IF ==="
iw dev "$IF" link
echo
echo "=== Station stats (retries/failures = interference) ==="
iw dev "$IF" station dump | grep -E "signal|tx bitrate|rx bitrate|tx retries|tx failed|beacon loss"
echo
echo "=== Regulatory domain (wrong country = missing DFS channels) ==="
iw reg get | head -4
echo
echo "=== Visible APs, strongest first ==="
nmcli -f SSID,BSSID,CHAN,FREQ,RATE,SIGNAL,SECURITY dev wifi list --rescan yes \
  | head -25
echo
echo "=== Same-SSID APs (your mesh/roaming candidates) ==="
SSID=$(iw dev "$IF" link | awk '/SSID/{$1="";print substr($0,2)}')
nmcli -t -f SSID,BSSID,CHAN,SIGNAL dev wifi list | awk -F: -v s="$SSID" '$1==s'
echo
echo "=== Gateway / DNS / path ==="
GW=$(ip route | awk '/default/{print $3;exit}')
echo "gw: $GW"; ping -c3 -W1 "$GW" | tail -2
resolvectl status "$IF" 2>/dev/null | grep -E "DNS Servers|Current DNS"
EOF

install -m0755 /dev/null /usr/local/bin/wifi-survey
cat >/usr/local/bin/wifi-survey <<'EOF'
#!/usr/bin/env bash
# Walk the property logging signal per AP. Ctrl-C to stop.
# Usage: wifi-survey [interval_sec] [outfile.csv]
INT="${1:-3}"; OUT="${2:-$HOME/wifi-survey-$(date +%F_%H%M).csv}"
IF=$(nmcli -t -f DEVICE,TYPE,STATE dev | awk -F: '$2=="wifi"&&$3=="connected"{print $1;exit}')
[[ -z "$IF" ]] && { echo "no connected wifi"; exit 1; }
echo "time,bssid,ssid,freq_mhz,signal_dbm,bitrate_mbps,tx_retries" > "$OUT"
echo "logging -> $OUT  (every ${INT}s). Walk slowly. Ctrl-C to stop."
trap 'echo; echo "saved: $OUT"; exit 0' INT
while :; do
  L=$(iw dev "$IF" link)
  B=$(awk '/Connected to/{print $3}' <<<"$L")
  S=$(awk '/SSID/{$1="";print substr($0,2)}' <<<"$L")
  F=$(awk '/freq:/{print $2}' <<<"$L")
  D=$(iw dev "$IF" station dump)
  SIG=$(awk '/signal:/{print $2;exit}' <<<"$D")
  BR=$(awk '/tx bitrate:/{print $3;exit}' <<<"$D")
  RT=$(awk '/tx retries:/{print $3;exit}' <<<"$D")
  printf '%s,%s,%s,%s,%s,%s,%s\n' "$(date +%T)" "$B" "$S" "$F" "$SIG" "$BR" "$RT" | tee -a "$OUT"
  sleep "$INT"
done
EOF

cat <<'MSG'

[+] Installed.
    wifi-doctor        -> full snapshot: signal, retries, all APs, same-SSID peers
    wifi-survey 3      -> walk the house, CSV log of signal/bitrate/retries per AP
    wavemon            -> live signal/noise meter, watch it while you move
    linssid            -> GUI: channel overlap graph (run as sudo for scanning)
    sudo iw event -t   -> watch roam/disconnect events in real time
    vnstat -d          -> daily bandwidth history

[!] Reading the numbers:
    signal  > -60 dBm good | -70 marginal | < -75 you should have roamed
    tx retries climbing with a strong signal = INTERFERENCE, not range
    two of your APs on overlapping 2.4GHz channels = pick 1, 6, or 11. Only those.
    5GHz: keep your APs on non-adjacent channels; DFS channels are usually empty
MSG
