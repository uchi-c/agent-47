from datetime import datetime, timezone

from supabase import create_client
from config import (
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    ORGANIZATION_ID
)

import logger

supabase = create_client(
    SUPABASE_URL,
    SUPABASE_ANON_KEY
)


# ==========================
# COMPUTER FUNCTIONS
# ==========================

def get_computer(computer_code):
    result = (
        supabase.table("computers")
        .select("*")
        .eq("computer_code", computer_code)
        .limit(1)
        .execute()
    )

    if result.data:
        return result.data[0]

    return None


def register_computer(computer_code):
    computer = get_computer(computer_code)

    if computer:
        print(
            f"[INFO] {computer_code} already registered."
        )
        return computer

    # organization_id must be set explicitly here: the column's DB-side
    # default silently falls back to whichever organization was created
    # first *in the entire system*, not the tenant this agent belongs to
    # (the anon role has no authenticated session for it to infer from).
    result = (
        supabase.table("computers")
        .insert(
            {
                "computer_code": computer_code,
                "computer_name": computer_code,
                "organization_id": ORGANIZATION_ID
            }
        )
        .execute()
    )

    return result.data[0]


def update_heartbeat(
    computer_code,
    metrics
):
    return (
        supabase.table("computers")
        .update(
            {
                "cpu_usage": metrics["cpu"],
                "ram_usage": metrics["ram"],
                "disk_usage": metrics["disk"],
                "hostname": metrics["hostname"],
                "ip_address": metrics["ip_address"],
                "last_seen": datetime.now(timezone.utc).isoformat()
            }
        )
        .eq("computer_code", computer_code)
        .execute()
    )


# ==========================
# LOCATION HISTORY
# ==========================

def log_location_if_changed(computer, public_ip, local_ip):
    """Appends a device_location_history row only when the public IP has
    moved since the last recorded one. Without this dedup, a heartbeat every
    30s would turn the history into an unbounded log of "still here" rows
    for a device that never leaves one network — the signal that actually
    matters (the device changed networks) would drown in noise.

    Silently no-ops if the public IP couldn't be resolved (offline / echo
    services all down) rather than logging a null/empty location.
    """
    if not public_ip:
        return

    try:
        last = (
            supabase.table("device_location_history")
            .select("ip_address")
            .eq("computer_id", computer["id"])
            .order("recorded_at", desc=True)
            .limit(1)
            .execute()
        )

        if last.data and last.data[0]["ip_address"] == public_ip:
            return

        supabase.table("device_location_history").insert(
            {
                "computer_id": computer["id"],
                "computer_code": computer["computer_code"],
                "ip_address": public_ip,
                "local_ip_address": local_ip,
            }
        ).execute()
        logger.info(f"[LOCATION] Recorded new public IP {public_ip} for {computer['computer_code']}")
    except Exception as e:
        logger.error(f"[LOCATION ERROR] {e}")


# ==========================
# COMMAND QUEUE
# ==========================

def get_pending_commands(
    computer_code
):
    result = (
        supabase.table(
            "computer_commands"
        )
        .select("*")
        .eq(
            "computer_code",
            computer_code
        )
        .eq(
            "status",
            "PENDING"
        )
        .execute()
    )

    return result.data


def complete_command(
    command_id,
    result=None,
    failed=False,
):
    update = {
        "status": "FAILED" if failed else "COMPLETED",
        "completed_at": datetime.now(timezone.utc).isoformat(),
    }
    if result is not None:
        update["result"] = result

    return (
        supabase.table(
            "computer_commands"
        )
        .update(
            update
        )
        .eq(
            "id",
            command_id
        )
        .execute()
    )
