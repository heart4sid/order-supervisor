import uuid
from temporalio.client import Client
from workflow import OrderSupervisorWorkflow

TEMPORAL_SERVER_URL = "localhost:7233"

async def get_client() -> Client:
    """
    Connects and returns a Temporal Client instance.
    """
    return await Client.connect(TEMPORAL_SERVER_URL)

async def start_order_supervisor_workflow(run_id: str) -> str:
    """
    Starts the OrderSupervisorWorkflow on the Temporal Server.
    """
    client = await get_client()
    handle = await client.start_workflow(
        OrderSupervisorWorkflow.run,
        id=run_id,
        args=[run_id],
        task_queue="order-supervisor-queue"
    )
    return handle.id

async def signal_inject_event(run_id: str, event_name: str, payload: dict):
    """
    Sends an inject_event signal into the workflow.
    """
    client = await get_client()
    handle = client.get_workflow_handle(run_id)
    await handle.signal(OrderSupervisorWorkflow.inject_event, args=[event_name, payload])

async def signal_add_instruction(run_id: str, instruction: str):
    """
    Sends an add_run_instruction signal into the workflow.
    """
    client = await get_client()
    handle = client.get_workflow_handle(run_id)
    await handle.signal(OrderSupervisorWorkflow.add_run_instruction, instruction)

async def signal_pause_run(run_id: str):
    """
    Sends a pause_run signal into the workflow.
    """
    client = await get_client()
    handle = client.get_workflow_handle(run_id)
    await handle.signal(OrderSupervisorWorkflow.pause_run)

async def signal_resume_run(run_id: str):
    """
    Sends a resume_run signal into the workflow.
    """
    client = await get_client()
    handle = client.get_workflow_handle(run_id)
    await handle.signal(OrderSupervisorWorkflow.resume_run)

async def signal_terminate_run(run_id: str):
    """
    Sends a terminate_run signal into the workflow.
    """
    client = await get_client()
    handle = client.get_workflow_handle(run_id)
    await handle.signal(OrderSupervisorWorkflow.terminate_run)
