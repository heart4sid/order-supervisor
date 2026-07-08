import asyncio
from temporalio.worker import Worker
from temporal_client import get_client
from workflow import OrderSupervisorWorkflow
import activities
import database
from dotenv import load_dotenv
load_dotenv()

async def main():
    # Initialize the local SQLite DB if it doesn't exist
    print("Initializing Database...")
    database.init_db()
    
    print("Connecting to Temporal server...")
    client = await get_client()
    
    # Run the worker
    print("Starting Temporal worker for Order Supervisor Queue...")
    worker = Worker(
        client,
        task_queue="order-supervisor-queue",
        workflows=[OrderSupervisorWorkflow],
        activities=[
            activities.record_event_activity,
            activities.record_manual_instruction_activity,
            activities.update_run_status_activity,
            activities.run_agent_reasoning_activity,
            activities.generate_final_summary_activity
        ]
    )
    
    await worker.run()

if __name__ == "__main__":
    asyncio.run(main())
