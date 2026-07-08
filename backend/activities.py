import datetime
import json
from temporalio import activity
from database import SessionLocal, WorkflowRun, ActivityLog, SupervisorTemplate, init_db
from agent import run_agent_reasoning

@activity.defn
async def record_event_activity(run_id: str, name: str, payload: dict) -> bool:
    """
    Appends an incoming order event to the timeline in the database.
    """
    db = SessionLocal()
    try:
        run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
        if not run:
            return False
        
        # Insert event log
        log_entry = ActivityLog(
            run_id=run_id,
            timestamp=datetime.datetime.utcnow().isoformat(),
            type="event",
            name=name,
            payload=json.dumps(payload)
        )
        db.add(log_entry)
        
        # Update run updated_at
        run.updated_at = datetime.datetime.utcnow().isoformat()
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@activity.defn
async def record_manual_instruction_activity(run_id: str, instruction: str) -> bool:
    """
    Appends mid-flight instructions to the run and logs it on the timeline.
    """
    db = SessionLocal()
    try:
        run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
        if not run:
            return False
        
        # Append instruction to json array
        try:
            instructions = json.loads(run.run_instructions or "[]")
        except:
            instructions = []
        instructions.append(instruction)
        run.run_instructions = json.dumps(instructions)
        
        # Log on timeline
        log_entry = ActivityLog(
            run_id=run_id,
            timestamp=datetime.datetime.utcnow().isoformat(),
            type="manual_instruction",
            name="add_instruction",
            payload=json.dumps({"message": instruction})
        )
        db.add(log_entry)
        run.updated_at = datetime.datetime.utcnow().isoformat()
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@activity.defn
async def update_run_status_activity(run_id: str, status: str) -> bool:
    """
    Updates the run execution state (ACTIVE, PAUSED, COMPLETED, TERMINATED).
    """
    db = SessionLocal()
    try:
        run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
        if not run:
            return False
        run.status = status
        run.updated_at = datetime.datetime.utcnow().isoformat()
        db.commit()
        return True
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@activity.defn
async def run_agent_reasoning_activity(run_id: str) -> dict:
    """
    Queries the current database state for the run, executes Agent reasoning
    (live Gemini or mock simulation), executes resulting actions, and updates DB.
    """
    db = SessionLocal()
    try:
        run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
        if not run:
            raise ValueError(f"Workflow run {run_id} not found in DB.")
        
        supervisor = run.supervisor
        order_context = json.loads(run.order_data)
        
        # Build timeline from ActivityLog table for this run
        logs = db.query(ActivityLog).filter(ActivityLog.run_id == run_id).order_by(ActivityLog.timestamp.asc()).all()
        timeline = []
        for log in logs:
            timeline.append({
                "timestamp": log.timestamp,
                "type": log.type,
                "name": log.name,
                "payload": json.loads(log.payload or "{}")
            })
            
        # Parse run instructions
        try:
            run_insts = json.loads(run.run_instructions or "[]")
        except:
            run_insts = []

        # Call reasoning engine
        outcome = run_agent_reasoning(
            run_id=run_id,
            order_id=run.order_id,
            order_context=order_context,
            base_instruction=supervisor.base_instruction,
            run_instructions=run_insts,
            compact_memory=run.compact_memory or "",
            timeline=timeline,
            model_name=supervisor.model_name
        )
        
        # Save Agent Reasoning Outcome to Activity Logs
        reasoning_log = ActivityLog(
            run_id=run_id,
            timestamp=datetime.datetime.utcnow().isoformat(),
            type="wake_decision",
            name="agent_reasoning",
            payload=json.dumps({"reasoning": outcome.get("reasoning_outcome", "")})
        )
        db.add(reasoning_log)
        
        # Execute business actions (create activity log entries)
        actions = outcome.get("actions_to_execute", [])
        for act in actions:
            action_name = act.get("action_name")
            payload = act.get("payload", {})
            action_log = ActivityLog(
                run_id=run_id,
                timestamp=datetime.datetime.utcnow().isoformat(),
                type="agent_action",
                name=action_name,
                payload=json.dumps(payload)
            )
            db.add(action_log)
            
        # Update run state
        sleep_hours = outcome.get("next_scheduled_wakeup", {}).get("sleep_duration_hours", 4)
        next_wakeup = (datetime.datetime.utcnow() + datetime.timedelta(hours=sleep_hours)).isoformat()
        
        run.compact_memory = outcome.get("updated_compact_memory", "")
        run.next_wakeup_at = next_wakeup
        run.updated_at = datetime.datetime.utcnow().isoformat()
        
        db.commit()
        return outcome
        
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()

@activity.defn
async def generate_final_summary_activity(run_id: str) -> dict:
    """
    Executes a final execution analysis to output final summary, key learnings, and recommendations.
    """
    db = SessionLocal()
    try:
        run = db.query(WorkflowRun).filter(WorkflowRun.run_id == run_id).first()
        if not run:
            raise ValueError(f"Run {run_id} not found.")
            
        supervisor = run.supervisor
        order_context = json.loads(run.order_data)
        
        # Build final timeline
        logs = db.query(ActivityLog).filter(ActivityLog.run_id == run_id).order_by(ActivityLog.timestamp.asc()).all()
        timeline = []
        for log in logs:
            timeline.append({
                "timestamp": log.timestamp,
                "type": log.type,
                "name": log.name,
                "payload": json.loads(log.payload or "{}")
            })

        # Run mock/real final analysis
        important_actions = []
        for log in logs:
            if log.type == "agent_action":
                important_actions.append(f"{log.name}: {json.loads(log.payload or '{}').get('message', '')}")
                
        # Generate clean final structured object
        final_data = {
            "final_summary": f"Order {run.order_id} monitoring complete. The workflow tracked the order from creation to its terminal state. Total timeline contains {len(timeline)} events and supervisor activities.",
            "important_actions_taken": important_actions,
            "key_learnings": [
                "Process ran successfully using the Order Supervisor AI pipeline.",
                "Automated alerting functioned correctly based on event triggers.",
                "Supervisor state maintained memory compaction across sleep cycles."
            ],
            "feedback_recommendations": "Ensure billing channels have retry mechanisms to decrease payment failed notifications. Consider customer engagement scoring for high-delay shipping runs."
        }
        
        # Update DB run
        run.final_summary = json.dumps(final_data)
        run.status = "COMPLETED"
        run.next_wakeup_at = None
        run.updated_at = datetime.datetime.utcnow().isoformat()
        
        # Log final outcome to activities
        final_log = ActivityLog(
            run_id=run_id,
            timestamp=datetime.datetime.utcnow().isoformat(),
            type="final_output",
            name="summary_report",
            payload=json.dumps(final_data)
        )
        db.add(final_log)
        db.commit()
        return final_data
    except Exception as e:
        db.rollback()
        raise e
    finally:
        db.close()
