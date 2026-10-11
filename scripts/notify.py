#!/usr/bin/env python3
"""Show a Smriti summary as a macOS notification.

Usage: notify.py morning|weekly [port]

launchd runs this at the times set by `make notify-install`. It asks the running
Smriti container for the text (GET /api/digest/<kind>) and shows it with
terminal-notifier, so a click opens Smriti. Without terminal-notifier it falls back
to a plain macOS notification. Standard library only (runs on the system Python).
"""

import json
import shutil
import subprocess
import sys
import urllib.request

KIND = sys.argv[1] if len(sys.argv) > 1 else "morning"
PORT = sys.argv[2] if len(sys.argv) > 2 else "8080"
BASE = f"http://localhost:{PORT}"
NOTIFIER = shutil.which("terminal-notifier", path="/opt/homebrew/bin:/usr/local/bin:/usr/bin")


def show(title: str, subtitle: str, message: str, url: str) -> None:
    if NOTIFIER:
        out = subprocess.run(
            [NOTIFIER, "-title", title, "-subtitle", subtitle, "-message", message,
             "-open", url, "-group", f"smriti-{KIND}", "-sound", "default"],
            capture_output=True, text=True, check=False,
        )
        if "not allowed" not in (out.stdout + out.stderr).lower():
            return
        print("terminal-notifier is not allowed to notify; using a plain macOS notification.", file=sys.stderr)
    q = lambda s: s.replace("\\", "\\\\").replace('"', '\\"')  # noqa: E731
    script = f'display notification "{q(message)}" with title "{q(title)}" subtitle "{q(subtitle)}"'
    subprocess.run(["/usr/bin/osascript", "-e", script], check=False)


try:
    with urllib.request.urlopen(f"{BASE}/api/digest/{KIND}", timeout=10) as resp:
        d = json.load(resp)
    show(d["title"], d["subtitle"], d["message"], BASE + d["path"])
except Exception as exc:  # Smriti not running, wrong port, ...
    show("Smriti", "Could not load your summary", f"Is Smriti running? Start it with: make up ({exc.__class__.__name__})", BASE)
