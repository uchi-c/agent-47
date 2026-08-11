import time

from config import (
    COMPUTER_CODE,
    HEARTBEAT_INTERVAL
)

from database import (
    register_computer,
    update_heartbeat
)

from metrics import (
    get_metrics
)

import logger


def start_heartbeat():

    logger.info(f"[HEARTBEAT] Starting {COMPUTER_CODE}")

    register_computer(
        COMPUTER_CODE
    )

    while True:
        try:
            metrics = (
                get_metrics()
            )

            # Location-history dedup (only record a new row when the public
            # IP actually changed) happens server-side now -- see
            # api/src/routes/agent.ts's /heartbeat handler.
            update_heartbeat(
                COMPUTER_CODE,
                metrics
            )

            logger.info(
                f"[HEARTBEAT] CPU:{metrics['cpu']}% "
                f"RAM:{metrics['ram']}% DISK:{metrics['disk']}% "
                f"IP:{metrics['public_ip']}"
            )

        except Exception as e:
            logger.error(f"[HEARTBEAT ERROR] {e}")

        time.sleep(
            HEARTBEAT_INTERVAL
        )
