import time

from config import (
    COMPUTER_CODE,
    HEARTBEAT_INTERVAL
)

from database import (
    register_computer,
    update_heartbeat,
    log_location_if_changed
)

from metrics import (
    get_metrics
)

import logger


def start_heartbeat():

    logger.info(f"[HEARTBEAT] Starting {COMPUTER_CODE}")

    computer = register_computer(
        COMPUTER_CODE
    )

    while True:
        try:
            metrics = (
                get_metrics()
            )

            update_heartbeat(
                COMPUTER_CODE,
                metrics
            )

            log_location_if_changed(
                computer,
                metrics["public_ip"],
                metrics["ip_address"],
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
