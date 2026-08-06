# Windows service wrapper using pywin32
import win32serviceutil
import win32service
import win32event
import servicemanager

from agent import main


class DeviceLeasingAgentService(
    win32serviceutil.ServiceFramework
):

    _svc_name_ = (
        "DeviceLeasingAgent"
    )

    _svc_display_name_ = (
        "Device Leasing Agent"
    )

    def __init__(
        self,
        args
    ):
        win32serviceutil.ServiceFramework.__init__(
            self,
            args
        )

        self.stop_event = (
            win32event.CreateEvent(
                None,
                0,
                0,
                None
            )
        )

    def SvcStop(
        self
    ):
        self.ReportServiceStatus(
            win32service.SERVICE_STOP_PENDING
        )

        win32event.SetEvent(
            self.stop_event
        )

    def SvcDoRun(
        self
    ):
        servicemanager.LogInfoMsg(
            "DeviceLeasingAgent started."
        )

        main()


if __name__ == "__main__":
    win32serviceutil.HandleCommandLine(
        DeviceLeasingAgentService
    )
