import socket

import psutil
import requests

import logger

# Public-IP echo services queried in order; first one that answers wins.
# Plural + a short timeout so one dead service doesn't stall a heartbeat —
# the whole point of this list is that a stolen device's location signal
# must not silently stop updating just because one echo service is down.
_PUBLIC_IP_SERVICES = (
    "https://api.ipify.org",
    "https://checkip.amazonaws.com",
    "https://icanhazip.com",
)


def get_public_ip():
    """The device's WAN-facing IP, as seen from the internet.

    This is the actual location signal for a device that may have left the
    original network entirely -- the LAN IP below never changes in a way
    that means anything once a device is off-premises (every home router
    hands out the same private ranges).
    """
    for url in _PUBLIC_IP_SERVICES:
        try:
            resp = requests.get(url, timeout=5)
            resp.raise_for_status()
            ip = resp.text.strip()
            if ip:
                return ip
        except Exception as e:
            logger.error(f"[METRICS] Public IP lookup via {url} failed: {e}")
    return None


def get_metrics():
    try:
        disk = psutil.disk_usage(
            "C:\\"
        )
    except Exception:
        disk = psutil.disk_usage(
            "/"
        )

    return {
        "cpu": psutil.cpu_percent(),
        "ram": psutil.virtual_memory().percent,
        "disk": disk.percent,
        "hostname": socket.gethostname(),
        "ip_address": socket.gethostbyname(socket.gethostname()),
        "public_ip": get_public_ip(),
    }
