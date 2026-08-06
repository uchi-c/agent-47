import logger

try:
    import win32ts
    import win32process
    import win32profile
    import win32con
    WIN32_AVAILABLE = True
except ImportError:
    WIN32_AVAILABLE = False
    logger.error("[LOCK] pywin32 not available -- lock command disabled.")


def get_active_session_id():
    """Reused by overlay.py too -- both lock_pc() and the recovery overlay
    need to cross into the interactive user's session the same way, so this
    is the one place that decides which session that is.
    """
    if not WIN32_AVAILABLE:
        return None

    session_id = win32ts.WTSGetActiveConsoleSessionId()
    if session_id in (0xFFFFFFFF, -1):
        return None
    return session_id


def run_in_active_session(command_line):
    """Launches `command_line` inside the currently logged-in user's desktop
    session, via WTSQueryUserToken + CreateProcessAsUser. Returns the new
    process's PID on success (so a caller like overlay.py can check later
    whether it's still running), or None on failure.

    Reused (unchanged logic) from uchi-c/dube-man-system's pc-agent/lockscreen.py:

    ctypes.windll.user32.LockWorkStation() only locks the CALLING session's
    desktop. This agent runs as a Windows Service, which executes in
    Session 0 -- an isolated background session with no interactive
    desktop of its own (Session 0 isolation, introduced in Vista for
    security). Calling a UI action directly from here "succeeds" against a
    desktop nobody is looking at, while the operator's actual screen (a
    different, numbered session) stays completely unaffected.

    The documented way around this is to duplicate the logged-in user's
    session token and launch the target command inside THEIR session
    instead of ours, via WTSQueryUserToken + CreateProcessAsUser. This is
    the standard Windows pattern for a service that needs to act on the
    interactive user's desktop, and it's what both lock_pc() and the
    recovery-message overlay ride on.
    """
    if not WIN32_AVAILABLE:
        logger.error("[SESSION ERROR] pywin32 not available.")
        return None

    try:
        session_id = get_active_session_id()
        if session_id is None:
            logger.error("[SESSION ERROR] No active console session -- nobody is logged in locally right now.")
            return None

        user_token = win32ts.WTSQueryUserToken(session_id)
        try:
            env = win32profile.CreateEnvironmentBlock(user_token, False)
            startup_info = win32process.STARTUPINFO()
            proc_info = win32process.CreateProcessAsUser(
                user_token,
                None,
                command_line,
                None,
                None,
                False,
                win32con.NORMAL_PRIORITY_CLASS | win32con.CREATE_NO_WINDOW,
                env,
                None,
                startup_info,
            )
            h_process, h_thread, pid, tid = proc_info
            h_thread.Close()
            h_process.Close()
            logger.info(f"[SESSION] Launched into session {session_id} (pid {pid}): {command_line}")
            return pid
        finally:
            user_token.Close()
    except Exception as e:
        logger.error(f"[SESSION ERROR] {e}")
        return None


def lock_pc():
    run_in_active_session("rundll32.exe user32.dll,LockWorkStation")
