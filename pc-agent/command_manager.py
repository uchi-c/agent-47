import time

from config import (
    COMPUTER_CODE
)

from database import (
    get_pending_commands,
    complete_command
)

from lockscreen import (
    lock_pc
)

from wipe import (
    wipe_device
)

import logger


class CommandManager:

    def start(self):
        logger.info("[COMMAND] Manager started.")

        while True:
            try:
                commands = (
                    get_pending_commands(
                        COMPUTER_CODE
                    )
                )

                for command in commands:
                    self.execute(
                        command
                    )

            except Exception as e:
                logger.error(f"[COMMAND ERROR] {e}")

            time.sleep(2)

    def execute(
        self,
        command
    ):
        cmd = command[
            "command"
        ]

        logger.info(f"[COMMAND] {cmd}")

        if cmd == "LOCK":
            lock_pc()
            complete_command(command["id"])

        elif cmd == "UNLOCK":
            # Windows has no supported API to dismiss LockWorkStation()
            # remotely without stored credentials, so there is nothing safe
            # to automate here. Log it clearly instead of silently completing
            # the command with no effect — unlock happens at the physical
            # machine, or by marking the device RECOVERED so theft_monitor.py
            # stops re-locking it on the next poll.
            logger.info(
                "[COMMAND] UNLOCK requested — Windows requires unlocking at "
                "the physical machine; no remote action taken."
            )
            complete_command(command["id"])

        elif cmd == "REFRESH":
            complete_command(command["id"])

        elif cmd == "WIPE":
            # wipe_device() calls complete_command() itself (success or
            # failure) so it can attach the folder-by-folder result --
            # unlike the other branches, don't call it again here.
            wipe_device(COMPUTER_CODE, command["id"])

        else:
            logger.error(f"[COMMAND] Unknown command: {cmd}")
            complete_command(command["id"], result={"reason": f"unknown command {cmd}"}, failed=True)
