import time

from heartbeat import (
    start_heartbeat
)

from command_manager import (
    CommandManager
)

from theft_monitor import (
    start_theft_monitor
)

from watchdog import (
    Watchdog
)

import logger


def main():

    logger.info("[AGENT] Starting Device Leasing Agent")

    command_manager = CommandManager()

    watched = [
        ("Heartbeat", start_heartbeat),
        ("Commands", command_manager.start),
        ("TheftMonitor", start_theft_monitor),
    ]

    watchdog = Watchdog(watched)
    watchdog.start()

    # Keep the main thread alive -- everything actually happens in the
    # watched daemon threads above. Blocking here (rather than returning)
    # means an unhandled error in this thread surfaces as the service
    # actually stopping, rather than silently going quiet.
    while True:
        time.sleep(60)


if __name__ == "__main__":
    main()
