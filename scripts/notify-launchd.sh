#!/bin/bash
# Install or remove the launchd jobs that show Smriti notifications.
# Usage: notify-launchd.sh install|uninstall <port> <morning HH:MM> <weekly day 0-6, 0=Sunday> <weekly HH:MM>
set -euo pipefail

ACTION=$1
PORT=${2:-8080}
MORNING=${3:-09:00}
WEEK_DAY=${4:-5}
WEEK_TIME=${5:-18:00}

AGENTS="$HOME/Library/LaunchAgents"
# launchd jobs cannot read ~/Documents without Full Disk Access, so run a copy from here.
HOME_DIR="$HOME/Library/Application Support/Smriti"
LOG="$HOME/Library/Logs/smriti-notify.log"
DOMAIN="gui/$(id -u)"
SRC="$(cd "$(dirname "$0")" && pwd)/notify.py"

plist() { # label kind calendar-dict
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$1</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/python3</string>
    <string>$HOME_DIR/notify.py</string>
    <string>$2</string>
    <string>$PORT</string>
  </array>
  <key>StartCalendarInterval</key>
  $3
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
}

time_dict() { # HH:MM [weekday]
  local h=$((10#${1%%:*})) m=$((10#${1##*:}))
  if [ $# -gt 1 ]; then
    echo "<dict><key>Weekday</key><integer>$2</integer><key>Hour</key><integer>$h</integer><key>Minute</key><integer>$m</integer></dict>"
  else
    echo "<dict><key>Hour</key><integer>$h</integer><key>Minute</key><integer>$m</integer></dict>"
  fi
}

for label in in.smriti.notify.morning in.smriti.notify.weekly; do
  launchctl bootout "$DOMAIN/$label" 2>/dev/null || true
  rm -f "$AGENTS/$label.plist"
done

if [ "$ACTION" = "uninstall" ]; then
  rm -rf "$HOME_DIR"
  echo "Smriti notifications removed."
  exit 0
fi

mkdir -p "$AGENTS" "$HOME_DIR"
cp "$SRC" "$HOME_DIR/notify.py"
plist in.smriti.notify.morning morning "$(time_dict "$MORNING")" > "$AGENTS/in.smriti.notify.morning.plist"
plist in.smriti.notify.weekly weekly "$(time_dict "$WEEK_TIME" "$WEEK_DAY")" > "$AGENTS/in.smriti.notify.weekly.plist"
for label in in.smriti.notify.morning in.smriti.notify.weekly; do
  launchctl bootstrap "$DOMAIN" "$AGENTS/$label.plist"
done
DAYS=(Sunday Monday Tuesday Wednesday Thursday Friday Saturday)
echo "Smriti notifications on: morning plan every day at $MORNING, weekly summary every ${DAYS[$WEEK_DAY]} at $WEEK_TIME."
echo "Log: $LOG"
