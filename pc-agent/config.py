from dotenv import load_dotenv
import os
import re
from pathlib import Path

import logger

load_dotenv()

BASE_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=BASE_DIR / ".env")

# Every value below is supposed to be plain ASCII (a URL, a secret, a short
# code) -- none of them are ever meant to contain accented letters, smart
# quotes, or other non-ASCII characters. Copy-pasting a long value like the
# agent key through chat apps or some terminals can silently pick up an
# invisible character that looks identical on screen but breaks every
# outbound HTTP request with "'ascii' codec can't encode characters...".
# Stripping anything outside printable ASCII is always safe here; it can
# only ever remove accidental copy-paste corruption, never a legitimate
# character these fields are supposed to have.
_NON_ASCII_RE = re.compile(r'[^\x20-\x7E]')


def _clean(raw, name):
    if not raw:
        return raw
    cleaned = _NON_ASCII_RE.sub('', raw)
    if cleaned != raw:
        logger.error(
            f"[CONFIG] {name} contained non-ASCII character(s) -- stripped "
            f"them (likely picked up from a copy-paste). If the agent still "
            f"misbehaves, re-copy this value directly from the source."
        )
    return cleaned


# Base URL of api/ (e.g. https://api.yourdomain.com, no trailing slash).
API_BASE_URL = (_clean(os.getenv("API_BASE_URL"), "API_BASE_URL") or "").rstrip("/")

# Bearer secret identifying which organization this device belongs to --
# matches one row's organizations.agent_api_key in the database. Replaces
# the old SUPABASE_ANON_KEY + ORGANIZATION_ID pair: the key alone now tells
# the server everything it needs, so there's no separate org id to
# configure here anymore.
AGENT_SECRET = _clean(os.getenv("AGENT_SECRET"), "AGENT_SECRET")

COMPUTER_CODE = _clean(os.getenv("COMPUTER_CODE", "DEV-01"), "COMPUTER_CODE")
HEARTBEAT_INTERVAL = int(
    os.getenv("HEARTBEAT_INTERVAL", "30")
)

# How often the persistent-lockdown check re-reads this device's
# security_status and, if flagged, re-locks + refreshes the recovery
# overlay. Deliberately its own (shorter) interval, not reused from
# HEARTBEAT_INTERVAL: heartbeat just reports metrics, while this is the
# actual theft-prevention control loop and the whole point is that a thief
# can't outrun it by unlocking and using the machine for a whole heartbeat
# interval before it re-locks.
LOCKDOWN_CHECK_INTERVAL = int(
    os.getenv("LOCKDOWN_CHECK_INTERVAL", "20")
)

CACHE_FILE = BASE_DIR / "session.json"
LOG_FILE = BASE_DIR / "agent.log"

APP_VERSION = "2.0.0"

if not API_BASE_URL:
    raise ValueError(
        "API_BASE_URL is missing in .env"
    )

if not AGENT_SECRET:
    raise ValueError(
        "AGENT_SECRET is missing in .env -- get this organization's agent_api_key "
        "from an admin (or the organizations table) and set it here."
    )
