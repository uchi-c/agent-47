"""Targeted user-data wipe for a device confirmed lost or stolen.

Deliberately NOT a full-disk wipe or format. Scope is limited to the
well-known personal-content folders inside real user profiles under
C:\\Users -- Desktop, Documents, Downloads, Pictures, Videos, Music. It
never touches:
  - Anything outside C:\\Users
  - Windows / Program Files / any system directory
  - AppData (app configs and installed-program state live there; wiping it
    would break the OS and installed software for no theft-prevention
    benefit, and risks bricking a device that turns out to be recovered or
    was flagged in error)
  - The Public / Default / Default User / All Users pseudo-profiles

This narrow scope is the point, not a shortcut: a bug in a full-disk wipe
path can brick a device that was actually paid off and flagged by mistake.
A bug here, worst case, deletes the wrong personal files -- bad, but not
"the device no longer boots and the customer's lease dispute now includes
a bricked laptop" bad.
"""
import shutil
from datetime import datetime, timezone
from pathlib import Path

import logger
from database import get_computer, complete_command, supabase

# Only these top-level folder names, inside a real user profile, are ever
# touched. Anything not on this list is left alone even if a future payload
# tries to widen it -- see _resolve_targets().
_TARGET_FOLDER_NAMES = ("Desktop", "Documents", "Downloads", "Pictures", "Videos", "Music")

# Profile directory names that are never treated as a real user -- wiping
# these would hit shared/system state, not one customer's personal files.
_EXCLUDED_PROFILE_NAMES = {"Public", "Default", "Default User", "All Users", "defaultuser0"}

_USERS_ROOT = Path("C:/Users")


def _resolve_targets():
    """Returns the list of real, existing target folders under C:\\Users,
    re-deriving them from disk on every call rather than trusting anything
    in the command payload -- the payload only ever supplies confirmation,
    never a path, precisely so a crafted/buggy payload can't redirect a
    wipe outside the intended scope.
    """
    targets = []

    if not _USERS_ROOT.is_dir():
        return targets

    for profile_dir in _USERS_ROOT.iterdir():
        if not profile_dir.is_dir():
            continue
        if profile_dir.name in _EXCLUDED_PROFILE_NAMES:
            continue

        for folder_name in _TARGET_FOLDER_NAMES:
            candidate = profile_dir / folder_name

            try:
                resolved = candidate.resolve(strict=True)
            except (OSError, RuntimeError):
                continue  # doesn't exist, or a broken/looping link -- skip, don't guess

            # Defense in depth against a junction/symlink pointing this
            # "Documents" folder somewhere outside the user's own profile
            # (a handful of Windows configurations redirect these, e.g. to
            # a mapped drive or OneDrive folder elsewhere) -- only delete
            # contents that actually resolve to stay under C:\Users.
            try:
                resolved.relative_to(_USERS_ROOT.resolve())
            except ValueError:
                logger.error(f"[WIPE] Skipping {candidate} -- resolves outside {_USERS_ROOT}.")
                continue

            targets.append(resolved)

    return targets


def _delete_folder_contents(folder):
    """Deletes everything INSIDE `folder`, but keeps the folder itself (so
    the OS/shell still finds a valid, empty Documents/Desktop/etc. rather
    than a missing special folder)."""
    deleted = 0
    errors = []
    for child in folder.iterdir():
        try:
            if child.is_dir() and not child.is_symlink():
                shutil.rmtree(child)
            else:
                child.unlink()
            deleted += 1
        except Exception as e:
            errors.append(f"{child}: {e}")
    return deleted, errors


def wipe_device(computer_code, command_id):
    """Runs the targeted wipe and reports the outcome back onto the command
    row via complete_command(..., result=...) -- for a lost/stolen device
    nobody can otherwise reach, that result IS the confirmation the wipe
    actually happened (or the reason it didn't).
    """
    computer = get_computer(computer_code)

    if not computer:
        logger.error(f"[WIPE] Unknown device {computer_code} -- refusing to run.")
        complete_command(command_id, result={"ran": False, "reason": "device not found"}, failed=True)
        return

    # Re-check the device's own flagged status before touching anything,
    # independent of whoever/whatever inserted the WIPE command row. This
    # is the safeguard that matters most: even if a command got queued
    # against the wrong device_code by mistake, the agent itself still
    # refuses to run unless the device it actually is has been flagged.
    if computer.get("security_status") not in ("FLAGGED_LOST", "FLAGGED_STOLEN"):
        reason = (
            f"device security_status is {computer.get('security_status')!r}, "
            "not FLAGGED_LOST/FLAGGED_STOLEN -- refusing to wipe a device "
            "that hasn't been reported lost or stolen."
        )
        logger.error(f"[WIPE] {reason}")
        complete_command(command_id, result={"ran": False, "reason": reason}, failed=True)
        return

    targets = _resolve_targets()
    logger.info(f"[WIPE] Starting targeted wipe of {len(targets)} folder(s) on {computer_code}.")

    summary = []
    for folder in targets:
        deleted, errors = _delete_folder_contents(folder)
        summary.append({"folder": str(folder), "items_deleted": deleted, "errors": errors})
        logger.info(f"[WIPE] {folder}: deleted {deleted} item(s), {len(errors)} error(s).")

    complete_command(
        command_id,
        result={"ran": True, "folders": summary},
    )

    try:
        supabase.table("computers").update(
            {"wiped_at": datetime.now(timezone.utc).isoformat()}
        ).eq("computer_code", computer_code).execute()
    except Exception as e:
        logger.error(f"[WIPE] Wipe completed but failed to record wiped_at: {e}")

    logger.info(f"[WIPE] Completed on {computer_code}.")
