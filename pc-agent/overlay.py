import sys
from pathlib import Path

try:
    import psutil
except ImportError:
    psutil = None

import logger
from lockscreen import run_in_active_session

BASE_DIR = Path(__file__).resolve().parent
DISPLAY_SCRIPT = BASE_DIR / "overlay_display.py"
MESSAGE_FILE = BASE_DIR / "recovery_message.txt"

# Tracks the PID of the overlay process we last launched, so repeated
# theft_monitor.py ticks (every LOCKDOWN_CHECK_INTERVAL) update the on-screen
# message in place instead of stacking up a new full-screen window every
# poll -- overlay_display.py already re-reads the message file on its own
# timer, so a still-alive overlay never needs relaunching, only rewriting.
_current_pid = None


def _pythonw_path():
    """Prefer pythonw.exe (no console window) alongside whichever
    interpreter is running this service, falling back to the interpreter
    itself if pythonw isn't present (e.g. a venv missing the GUI variant)."""
    exe = Path(sys.executable)
    pythonw = exe.with_name("pythonw.exe")
    return pythonw if pythonw.exists() else exe


def _is_alive(pid):
    if pid is None:
        return False
    if psutil is not None:
        return psutil.pid_exists(pid)
    return False


def show_recovery_overlay(message):
    global _current_pid

    try:
        MESSAGE_FILE.write_text(message or "", encoding="utf-8")
    except Exception as e:
        logger.error(f"[OVERLAY ERROR] Couldn't write recovery message: {e}")
        return

    if _is_alive(_current_pid):
        # Already on screen in the active session -- overlay_display.py
        # will pick up the rewritten message file on its next refresh tick.
        return

    interpreter = _pythonw_path()
    command_line = f'"{interpreter}" "{DISPLAY_SCRIPT}" "{MESSAGE_FILE}"'
    pid = run_in_active_session(command_line)
    if pid is None:
        logger.error("[OVERLAY ERROR] Failed to launch recovery overlay in active session.")
        return

    _current_pid = pid
    logger.info(f"[OVERLAY] Recovery message overlay launched (pid {pid}).")


def dismiss_recovery_overlay():
    """Best-effort only: Windows gives a service no supported way to close a
    window running in another session (the same constraint that makes
    UNLOCK a manual, at-the-machine action -- see command_manager.py). Once
    security_status leaves FLAGGED_LOST/FLAGGED_STOLEN, theft_monitor.py
    simply stops relaunching/refreshing the overlay; the existing window
    (if still up) is cleared the next time the machine is unlocked and
    logged into, since overlay_display.py is not started again.
    """
    global _current_pid
    _current_pid = None
