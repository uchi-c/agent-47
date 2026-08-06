import logging
from pathlib import Path

# Absolute path — a Windows service can start with a working directory that
# isn't this folder, so a relative filename would silently write the log
# somewhere unexpected (or nowhere findable).
_LOG_FILE = Path(__file__).resolve().parent / "agent.log"

logging.basicConfig(
    filename=str(_LOG_FILE),
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)


def info(message):
    logging.info(message)


def error(message):
    logging.error(message)
