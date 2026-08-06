"""Persistent lockdown: the theft-prevention control loop.

This is deliberately independent of computer_commands / command_manager.py.
A LOCK command there is a one-shot action -- fire it, the agent locks the
screen once, done. That's the wrong shape for "this device was reported
stolen": if it only locked once, anyone who dismisses/works around that one
lock (reboot into safe mode, wait for a session change, etc.) is back in
unrestricted. Persistent lockdown instead re-reads the device's own
security_status on every poll and re-locks for as long as it stays flagged
-- the thief has to win every single poll interval forever, not just once.

security_status is the one field this reads (see database/migrations/
001_leasing_theft_prevention.sql for why that's kept separate from
lease_status). Recovery is a deliberate one-way door: once
security_status leaves FLAGGED_LOST/FLAGGED_STOLEN (set to RECOVERED by
staff after the device is actually back), this loop simply stops acting --
it never sets that field itself.
"""
import time

from config import COMPUTER_CODE, LOCKDOWN_CHECK_INTERVAL
from database import get_computer
from lockscreen import lock_pc
from overlay import show_recovery_overlay, dismiss_recovery_overlay

import logger

_FLAGGED_STATUSES = ("FLAGGED_LOST", "FLAGGED_STOLEN")

_DEFAULT_MESSAGE = (
    "This device has been reported lost or stolen and has been locked.\n"
    "Please contact the owner to arrange its return."
)


def start_theft_monitor():
    logger.info("[THEFT MONITOR] Started.")
    was_flagged = False

    while True:
        try:
            computer = get_computer(COMPUTER_CODE)

            if computer and computer.get("security_status") in _FLAGGED_STATUSES:
                lock_pc()
                show_recovery_overlay(computer.get("recovery_message") or _DEFAULT_MESSAGE)
                if not was_flagged:
                    logger.info(
                        f"[THEFT MONITOR] {COMPUTER_CODE} flagged "
                        f"{computer['security_status']} -- entering persistent lockdown."
                    )
                was_flagged = True
            else:
                if was_flagged:
                    logger.info(f"[THEFT MONITOR] {COMPUTER_CODE} no longer flagged -- exiting lockdown.")
                    dismiss_recovery_overlay()
                was_flagged = False

        except Exception as e:
            logger.error(f"[THEFT MONITOR ERROR] {e}")

        time.sleep(LOCKDOWN_CHECK_INTERVAL)
