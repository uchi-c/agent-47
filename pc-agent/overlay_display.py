"""Standalone script launched (via lockscreen.run_in_active_session, the
same session-0-crossing technique as lock_pc()) INSIDE the logged-in user's
desktop session to actually paint the recovery-message window.

This has to be its own separate process rather than a window opened directly
by the service: the service runs in Session 0, so any window it created
would be painted onto a desktop nobody can see (the exact problem
lockscreen.py's docstring describes for LockWorkStation()). Running as a
plain script under pythonw.exe (no console window) inside the user's own
session is what makes it actually visible on their screen.

Reads the message from a file rather than argv so long/multi-line recovery
text (with quotes, newlines, whatever staff typed) never has to survive
Windows command-line escaping.
"""
import sys
import time
from pathlib import Path

MESSAGE_FILE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
WINDOW_TITLE = "__uruu_recovery_overlay__"


def _read_message():
    try:
        return MESSAGE_FILE.read_text(encoding="utf-8").strip()
    except Exception:
        return "This device has been reported lost or stolen.\nPlease contact the owner to arrange its return."


def main():
    import tkinter as tk

    root = tk.Tk()
    root.title(WINDOW_TITLE)
    root.attributes("-fullscreen", True)
    root.attributes("-topmost", True)
    root.configure(background="#7a0d0d")
    # Re-assert topmost on a timer -- the goal is a highly visible, hard-to-
    # ignore notice, not an unbypassable kiosk lock (Windows gives a service
    # no supported way to block Ctrl+Alt+Del / task manager, and this isn't
    # trying to).
    root.overrideredirect(True)

    label = tk.Label(
        root,
        text="⚠ DEVICE LOCKED — REPORTED LOST OR STOLEN",
        font=("Segoe UI", 28, "bold"),
        fg="white",
        bg="#7a0d0d",
        wraplength=root.winfo_screenwidth() - 160,
        justify="center",
    )
    label.pack(pady=(120, 30))

    message_var = tk.StringVar(value=_read_message())
    message_label = tk.Label(
        root,
        textvariable=message_var,
        font=("Segoe UI", 16),
        fg="white",
        bg="#7a0d0d",
        wraplength=root.winfo_screenwidth() - 240,
        justify="center",
    )
    message_label.pack(pady=10)

    def refresh():
        # The recovery message can change after this window is already up
        # (staff edit the contact number, add a reward note, etc). Re-read
        # from disk periodically instead of requiring a relaunch.
        message_var.set(_read_message())
        root.attributes("-topmost", True)
        root.lift()
        root.after(5000, refresh)

    root.after(5000, refresh)
    root.mainloop()


if __name__ == "__main__":
    main()
