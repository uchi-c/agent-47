"""Starts named daemon threads and restarts any that die.

Reused as-is from uchi-c/dube-man-system's pc-agent/watchdog.py — a thread
supervisor has nothing leasing-specific about it.
"""
import threading
import time

import logger


class Watchdog:

    def __init__(self, specs, check_interval=10):
        """`specs` is a list of (name, target) tuples; target is a zero-arg callable."""
        self.specs = specs
        self.check_interval = check_interval
        self.threads = {}

    def _spawn(self, name, target):
        t = threading.Thread(target=target, daemon=True, name=name)
        t.start()
        self.threads[name] = t
        logger.info(f"[WATCHDOG] Started {name}")

    def start(self):
        for name, target in self.specs:
            self._spawn(name, target)

        monitor = threading.Thread(target=self._monitor, daemon=True, name="Watchdog")
        monitor.start()

    def _monitor(self):
        target_by_name = dict(self.specs)
        while True:
            time.sleep(self.check_interval)
            for name, thread in list(self.threads.items()):
                if not thread.is_alive():
                    logger.error(f"[WATCHDOG] {name} died — restarting")
                    self._spawn(name, target_by_name[name])
