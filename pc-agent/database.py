import requests

from config import API_BASE_URL, AGENT_SECRET

import logger

_HEADERS = {
    "X-Agent-Key": AGENT_SECRET,
    "Content-Type": "application/json",
}

_TIMEOUT = 15


def _url(path):
    return f"{API_BASE_URL}{path}"


# ==========================
# COMPUTER FUNCTIONS
# ==========================

def get_computer(computer_code):
    resp = requests.get(_url(f"/agent/devices/{computer_code}"), headers=_HEADERS, timeout=_TIMEOUT)
    if resp.status_code == 404:
        return None
    resp.raise_for_status()
    return resp.json()


def register_computer(computer_code):
    resp = requests.post(
        _url("/agent/register"),
        headers=_HEADERS,
        json={"computer_code": computer_code},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    computer = resp.json()
    logger.info(f"[INFO] {computer_code} registered (id={computer['id']}).")
    return computer


def update_heartbeat(
    computer_code,
    metrics
):
    # Location-history dedup (only log a new row when the public IP
    # actually changed) happens server-side now -- see api/src/routes/
    # agent.ts's /heartbeat handler -- so the agent just reports raw
    # metrics and doesn't need to track its own last-known IP.
    resp = requests.post(
        _url("/agent/heartbeat"),
        headers=_HEADERS,
        json={
            "computer_code": computer_code,
            "cpu": metrics["cpu"],
            "ram": metrics["ram"],
            "disk": metrics["disk"],
            "hostname": metrics["hostname"],
            "ip_address": metrics["ip_address"],
            "public_ip": metrics.get("public_ip"),
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def mark_wiped(computer_code):
    resp = requests.patch(_url(f"/agent/devices/{computer_code}/wiped"), headers=_HEADERS, timeout=_TIMEOUT)
    resp.raise_for_status()
    return resp.json()


# ==========================
# COMMAND QUEUE
# ==========================

def get_pending_commands(
    computer_code
):
    resp = requests.get(
        _url("/agent/commands"),
        headers=_HEADERS,
        params={"computer_code": computer_code},
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()


def complete_command(
    command_id,
    result=None,
    failed=False,
):
    resp = requests.post(
        _url(f"/agent/commands/{command_id}/complete"),
        headers=_HEADERS,
        json={
            "status": "FAILED" if failed else "COMPLETED",
            "result": result,
        },
        timeout=_TIMEOUT,
    )
    resp.raise_for_status()
    return resp.json()
