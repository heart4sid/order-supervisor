import datetime
import asyncio
from datetime import timedelta
from temporalio import workflow

with workflow.unsafe.imports_passed_through():
    import activities

@workflow.defn
class OrderSupervisorWorkflow:
    def __init__(self) -> None:
        self.run_id = ""
        self.is_paused = False
        self.is_terminated = False
        self.is_completed = False
        self.new_signal_received = False
        self.should_wake_agent = True
        self.latest_event_name = ""
        self.sleep_hours = 4

    @workflow.run
    async def run(self, run_id: str) -> dict:
        self.run_id = run_id
        
        # Initialize run status to ACTIVE in database
        await workflow.execute_activity(
            activities.update_run_status_activity,
            args=[self.run_id, "ACTIVE"],
            start_to_close_timeout=timedelta(seconds=10)
        )
        
        # Main Event Loop
        while not self.is_terminated and not self.is_completed:
            # 1. Handle Paused State
            if self.is_paused:
                # Sleep indefinitely until resumed, terminated, or finished
                await workflow.wait_condition(lambda: not self.is_paused or self.is_terminated)
                if self.is_terminated:
                    break

            # 2. Run Agent Reasoning if triggered
            if self.should_wake_agent:
                self.should_wake_agent = False
                
                # Execute Agent Reasoning Activity
                outcome = await workflow.execute_activity(
                    activities.run_agent_reasoning_activity,
                    args=[self.run_id],
                    start_to_close_timeout=timedelta(minutes=2)
                )
                
                # Update next wake-up sleep duration
                self.sleep_hours = outcome.get("next_scheduled_wakeup", {}).get("sleep_duration_hours", 4)
                
                # If the latest event is 'delivered', we proceed to terminal completion
                if self.latest_event_name == "delivered":
                    self.is_completed = True
                    break

            # 3. Sleep & Wait for Signals
            # Time dilation for demo: 1 hour sleep = 10 seconds real-world time
            sleep_duration_seconds = max(5, self.sleep_hours * 10)
            
            # Clear flag before waiting
            self.new_signal_received = False
            
            try:
                # Wait for signal or timeout
                await workflow.wait_condition(
                    lambda: self.new_signal_received or self.is_terminated or self.is_paused,
                    timeout=timedelta(seconds=sleep_duration_seconds)
                )
                woken_by_signal = True
            except asyncio.TimeoutError:
                woken_by_signal = False
            
            # If woken by timeout (not signal/paused/terminated), we should trigger agent reasoning
            if not woken_by_signal and not self.is_paused and not self.is_terminated:
                self.should_wake_agent = True

        # 4. Handle End-of-Run Terminal Completion
        if self.is_terminated:
            await workflow.execute_activity(
                activities.update_run_status_activity,
                args=[self.run_id, "TERMINATED"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            return {"status": "TERMINATED"}
            
        elif self.is_completed:
            # Generate final summary report
            final_report = await workflow.execute_activity(
                activities.generate_final_summary_activity,
                args=[self.run_id],
                start_to_close_timeout=timedelta(minutes=2)
            )
            return {"status": "COMPLETED", "report": final_report}
            
        return {"status": "UNKNOWN"}

    @workflow.signal
    async def inject_event(self, event_name: str, payload: dict) -> None:
        """
        Receives external lifecycle signals.
        """
        self.latest_event_name = event_name
        
        # Record event on timeline in database
        await workflow.execute_activity(
            activities.record_event_activity,
            args=[self.run_id, event_name, payload],
            start_to_close_timeout=timedelta(seconds=10)
        )
        
        # Event classifier logic (lightweight policy):
        # Determine if this event is critical enough to trigger an early agent wake-up.
        critical_events = {
            "payment_failed",
            "shipment_delayed",
            "refund_requested",
            "customer_message_received",
            "no_update_for_n_hours",
            "delivered"
        }
        
        if event_name in critical_events:
            # Wakes up agent immediately
            self.should_wake_agent = True
        
        # Pulse signal flag to exit wait_condition early
        self.new_signal_received = True

    @workflow.signal
    async def add_run_instruction(self, instruction: str) -> None:
        """
        Appends a run-specific instruction mid-flight.
        """
        await workflow.execute_activity(
            activities.record_manual_instruction_activity,
            args=[self.run_id, instruction],
            start_to_close_timeout=timedelta(seconds=10)
        )
        self.should_wake_agent = True
        self.new_signal_received = True

    @workflow.signal
    async def pause_run(self) -> None:
        """
        Pauses the workflow supervisor loop.
        """
        if not self.is_paused:
            self.is_paused = True
            await workflow.execute_activity(
                activities.update_run_status_activity,
                args=[self.run_id, "PAUSED"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            self.new_signal_received = True

    @workflow.signal
    async def resume_run(self) -> None:
        """
        Resumes the workflow supervisor loop.
        """
        if self.is_paused:
            self.is_paused = False
            await workflow.execute_activity(
                activities.update_run_status_activity,
                args=[self.run_id, "ACTIVE"],
                start_to_close_timeout=timedelta(seconds=10)
            )
            self.should_wake_agent = True
            self.new_signal_received = True

    @workflow.signal
    async def terminate_run(self) -> None:
        """
        Manually cancels and terminates the supervisor run.
        """
        self.is_terminated = True
        self.new_signal_received = True
