import datetime
import json
from sqlalchemy import create_engine, Column, Integer, String, Text, ForeignKey
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship

DATABASE_URL = "sqlite:///e:/Order Supervisor/backend/supervisor.db"

engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

class SupervisorTemplate(Base):
    __tablename__ = "supervisor_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, nullable=False)
    base_instruction = Column(Text, nullable=False)
    model_name = Column(String, default="gemini-2.5-flash")
    default_wakeup_hours = Column(Integer, default=4)
    available_tools = Column(String, default="message_fulfillment_team,message_payments_team,message_logistics_team,message_customer,create_internal_note")

    runs = relationship("WorkflowRun", back_populates="supervisor")

class WorkflowRun(Base):
    __tablename__ = "workflow_runs"

    run_id = Column(String, primary_key=True, index=True) # Temporal Workflow ID (UUID string)
    supervisor_id = Column(Integer, ForeignKey("supervisor_templates.id"), nullable=False)
    order_id = Column(String, nullable=False)
    order_data = Column(Text, nullable=False) # JSON encoded order context
    status = Column(String, default="ACTIVE") # ACTIVE, PAUSED, COMPLETED, TERMINATED
    compact_memory = Column(Text, default="")
    next_wakeup_at = Column(String, nullable=True)
    run_instructions = Column(Text, default="[]") # JSON array of mid-flight guidelines
    final_summary = Column(Text, nullable=True) # JSON containing final learnings
    created_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    updated_at = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())

    supervisor = relationship("SupervisorTemplate", back_populates="runs")
    activities = relationship("ActivityLog", back_populates="run", cascade="all, delete-orphan")

class ActivityLog(Base):
    __tablename__ = "activity_logs"

    id = Column(Integer, primary_key=True, index=True)
    run_id = Column(String, ForeignKey("workflow_runs.run_id"), nullable=False)
    timestamp = Column(String, default=lambda: datetime.datetime.utcnow().isoformat())
    type = Column(String, nullable=False) # event, wake_decision, sleep_decision, agent_action, manual_instruction, final_output
    name = Column(String, nullable=False)
    payload = Column(Text, default="{}") # JSON containing additional details

    run = relationship("WorkflowRun", back_populates="activities")

def init_db():
    Base.metadata.create_all(bind=engine)
