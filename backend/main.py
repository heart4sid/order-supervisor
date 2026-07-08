import json
import uuid
import datetime
from typing import List, Dict, Any
from fastapi import FastAPI, HTTPException, Depends
from dotenv import load_dotenv
load_dotenv()
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session

import database
from database import SessionLocal, SupervisorTemplate, WorkflowRun, ActivityLog, init_db
import temporal_client

app = FastAPI(title="Order Supervisor API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # In production, restrict this. For POC, allow all.
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Dependency to get DB session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic schemas
class SupervisorCreate(BaseModel):
    name: str
    base_instruction: str
    model_name: str = "gemini-2.5-flash"
    default_wakeup_hours: int = 4
    available_tools: List[str] = ["message_fulfillment_team", "message_payments_team", "message_logistics_team", "message_customer", "create_internal_note"]

class RunCreate(BaseModel):
    supervisor_id: int
    order_id: str
    order_data: Dict[str, Any]

class EventInject(BaseModel):
    event_name: str
    payload: Dict[str, Any] = {}

class InstructionInject(BaseModel):
    instruction: str

class SettingsUpdate(BaseModel):
    gemini_api_key: str

@app.on_event("startup")
def startup_event():
    # Make sure tables are created on startup
    init_db()

# --- Settings APIs ---

@app.post("/api/settings")
def update_settings(data: SettingsUpdate):
    import os
    os.environ["GEMINI_API_KEY"] = data.gemini_api_key
    return {"status": "SUCCESS", "message": "Gemini API key updated in environment."}

@app.get("/api/settings")
def get_settings():
    import os
    return {"gemini_api_key_set": bool(os.environ.get("GEMINI_API_KEY"))}

# --- Supervisor Templates APIs ---

@app.post("/api/supervisors")
def create_supervisor(data: SupervisorCreate, db: Session = Depends(get_db)):
    tools_str = ",".join(data.available_tools)
    tmpl = SupervisorTemplate(
        name=data.name,
        base_instruction=data.base_instruction,
        model_name=data.model_name,
        default_wakeup_hours=data.default_wakeup_hours,
        available_tools=tools_str
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl

@app.get("/api/supervisors")
def get_supervisors(db: Session = Depends(get_db)):
    return db.query(SupervisorTemplate).all()

@app.get("/api/supervisors/{id}")
def get_supervisor(id: int, db: Session = Depends(get_db)):
    tmpl = db.query(SupervisorTemplate).filter(SupervisorTemplate.id == id).first()
    if not tmpl:
        raise HTTPException(status_code=404, detail="Supervisor template not found")
    return tmpl

# --- Workflow Runs APIs ---

@app.post("/api/runs")
async def start_run(data: RunCreate, db: Session = Depends(get_db)):
    # Verify supervisor template exists
    supervisor = db.query(SupervisorTemplate).filter(SupervisorTemplate.id == data.supervisor_id).first()
    if not supervisor:
        raise HTTPException(status_code=404, detail="Supervisor template not found")
        
    run_id = str(uuid.uuid4())
    
    # Store initial run state in DB
    run = WorkflowRun(
        run_id=run_id,
        supervisor_id=data.supervisor_id,
        order_id=data.order_id,
        order_data=json.dumps(data.order_data),
        status="ACTIVE",
        compact_memory="Workflow initiated. Preparing first analysis.",
        created_at=datetime.datetime.utcnow().isoformat(),
        updated_at=datetime.datetime.utcnow().isoformat()
    )
    db.add(run)
    
    # Add initial order_created event to activity logs
    initial_event = ActivityLog(
        run_id=run_id,
        timestamp=datetime.datetime.utcnow().isoformat(),
        type="event",
        name="order_created",
        payload=json.dumps({
            "message": f"Order {data.order_id} has been placed.",
            "order_id": data.order_id,
            "items": data.order_data.get("items", []),
            "customer": data.order_data.get("customer", {})
        })
    )
    db.add(initial_event)
    db.commit()
    
    try:
        # Start Temporal Workflow
        await temporal_client.start_order_supervisor_workflow(run_id)
        db.refresh(run)
        return run
    except Exception as e:
        # If temporal starting fails, clean up the DB entry or mark it as terminated
        run.status = "TERMINATED"
        db.commit()
        raise HTTPException(status_code=500, detail=f"Failed to start Temporal workflow: {str(e)}")

@app.get("/api/runs")
def get_runs(db: Session = Depends(get_db)):
    runs = db.query(WorkflowRun).all()
    results = []
    for run in runs:
        # Query supervisor metadata
        supervisor = db.query(SupervisorTemplate).filter(SupervisorTemplate.id == run.supervisor_id).first()
        results.append({
            "run_id": run.run_id,
            "supervisor_id": run.supervisor_id,
            "supervisor_name": supervisor.name if supervisor else "Unknown",
            "order_id": run.order_id,
            "status": run.status,
            "compact_memory": run.compact_memory,
            "next_wakeup_at": run.next_wakeup_at,
            "created_at": run.created_at,
            "updated_at": run.updated_at
        })
    return results

@app.get("/api/runs/{run_id}")
def get_run_details(run_id: str, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    supervisor = db.query(SupervisorTemplate).filter(SupervisorTemplate.id == run.supervisor_id).first()
    
    # Fetch chronological activity timeline
    logs = db.query(ActivityLog).filter(ActivityLog.run_id == run_id).order_by(ActivityLog.timestamp.asc()).all()
    timeline = []
    for log in logs:
        timeline.append({
            "id": log.id,
            "timestamp": log.timestamp,
            "type": log.type, # event, wake_decision, sleep_decision, agent_action, manual_instruction, final_output
            "name": log.name,
            "payload": json.loads(log.payload or "{}")
        })
        
    try:
        order_data = json.loads(run.order_data)
    except:
        order_data = {}
        
    try:
        run_insts = json.loads(run.run_instructions or "[]")
    except:
        run_insts = []
        
    try:
        final_summary = json.loads(run.final_summary or "null") if run.final_summary else None
    except:
        final_summary = None

    return {
        "run_id": run.run_id,
        "supervisor_id": run.supervisor_id,
        "supervisor": {
            "name": supervisor.name if supervisor else "Unknown",
            "base_instruction": supervisor.base_instruction if supervisor else "",
            "model_name": supervisor.model_name if supervisor else "",
            "available_tools": supervisor.available_tools.split(",") if supervisor and supervisor.available_tools else []
        },
        "order_id": run.order_id,
        "order_data": order_data,
        "status": run.status,
        "compact_memory": run.compact_memory,
        "next_wakeup_at": run.next_wakeup_at,
        "run_instructions": run_insts,
        "final_summary": final_summary,
        "timeline": timeline,
        "created_at": run.created_at,
        "updated_at": run.updated_at
    }

# --- Workflow Signals Control APIs ---

@app.post("/api/runs/{run_id}/events")
async def inject_event(run_id: str, data: EventInject, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    if run.status not in ["ACTIVE", "PAUSED"]:
        raise HTTPException(status_code=400, detail="Cannot send signals to a non-active workflow run")
        
    try:
        # Injects signal to Temporal workflow
        await temporal_client.signal_inject_event(run_id, data.event_name, data.payload)
        return {"status": "SUCCESS", "message": f"Event '{data.event_name}' injected successfully."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send event signal to Temporal: {str(e)}")

@app.post("/api/runs/{run_id}/instructions")
async def inject_instructions(run_id: str, data: InstructionInject, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    if run.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Can only inject instructions to ACTIVE workflows")
        
    try:
        await temporal_client.signal_add_instruction(run_id, data.instruction)
        return {"status": "SUCCESS", "message": "Manual instructions added."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to add manual instruction signal to Temporal: {str(e)}")

@app.post("/api/runs/{run_id}/interrupt")
async def interrupt_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    if run.status != "ACTIVE":
        raise HTTPException(status_code=400, detail="Only ACTIVE runs can be paused")
        
    try:
        await temporal_client.signal_pause_run(run_id)
        return {"status": "SUCCESS", "message": "Workflow paused."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send pause signal: {str(e)}")

@app.post("/api/runs/{run_id}/resume")
async def resume_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    if run.status != "PAUSED":
        raise HTTPException(status_code=400, detail="Only PAUSED runs can be resumed")
        
    try:
        await temporal_client.signal_resume_run(run_id)
        return {"status": "SUCCESS", "message": "Workflow resumed."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send resume signal: {str(e)}")

@app.post("/api/runs/{run_id}/terminate")
async def terminate_run(run_id: str, db: Session = Depends(get_db)):
    run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
        
    if run.status not in ["ACTIVE", "PAUSED"]:
        raise HTTPException(status_code=400, detail="Cannot terminate a completed or already terminated run")
        
    try:
        await temporal_client.signal_terminate_run(run_id)
        return {"status": "SUCCESS", "message": "Workflow terminate signal sent."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send terminate signal: {str(e)}")
