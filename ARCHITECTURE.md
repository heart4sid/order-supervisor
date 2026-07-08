# Architecture Note: Order Supervisor Orchestrator

This document outlines the core architectural patterns, state modeling, and system design decisions made for the Order Supervisor Proof of Concept.

---

## 1. Long-Running Workflows (Temporal modeling)
Commerce orders can remain active for days or weeks (e.g. from placement, custom prep, sea freight, local dispatch, until final delivery). Running an AI agent in a tight continuous polling loop is resource-prohibitive and fragile.

Instead, we map **one Temporal Workflow instance to exactly one Order**.
*   The workflow utilizes native Temporal state variables (`is_paused`, `is_terminated`, `is_completed`, `should_wake_agent`).
*   It exposes standard Temporal Signal handlers to receive mid-flight modifications (events, instructions, pause/resume flags) without restarting execution.
*   The workflow loop uses Temporal's deterministic `wait_condition(fn, timeout)` to sleep natively.

### Time Dilation for Demonstration
To make the system testable in a live demo, we implement **Time Dilation**:
*   The Agent outputs sleep durations in **hours** (e.g. sleep 4 hours).
*   The workflow scales this value down: **1 hour of sleep = 10 seconds of real-world sleep**.
*   This allows you to witness the supervisor count down, sleep, wake up on schedule, or wake early on a signal within a single minute.

---

## 2. Event-Driven Wake/Sleep Classifier Policy
Every incoming lifecycle event is delivered into the workflow as a Signal. Rather than immediately calling the expensive LLM reasoning engine for every minor status event, we implement a **Lightweight Event Classifier**:

```
                  [ Incoming Order Event Signal ]
                                 │
                                 ▼
                     Lightweight Event Classifier
                       /                       \
                      /                         \
            [ IS CRITICAL? ]              [ IS NON-CRITICAL? ]
            e.g. payment_failed,          e.g. payment_confirmed,
            shipment_delayed,             shipment_created
            refund_requested
                   │                                │
                   ▼                                ▼
         Append to timeline DB            Append to timeline DB
         Wake Main Agent immediately     Keep Main Agent asleep
         (Interrupt sleep timer)          (Wait until scheduled wake)
```

*   **Critical signals** (e.g. `payment_failed`, `shipment_delayed`, `delivered`) immediately set `should_wake_agent = True` and interrupt the sleep timer, waking the main Agent for immediate intervention.
*   **Non-critical signals** (e.g. `payment_confirmed`, `shipment_created`) record the activity in the database timeline, but do not set the wake flag. The Agent remains asleep, and will process these events collectively when its scheduled wakeup timer expires.

---

## 3. Dual-Mode Agent Runtime & Memory Compaction
The system implements a robust fallback structure in `backend/agent.py`:
*   **Live Mode**: If `GEMINI_API_KEY` is present, the agent uses the new `google-genai` SDK to construct a detailed system instruction prompt containing historical logs and instructions, querying `gemini-2.5-flash` with structured JSON output enforcement.
*   **Simulation Mode**: If no key is set, a high-fidelity deterministic rule-based state machine runs. It analyzes the latest event, applies any mid-flight overrides (like `do not contact customer` or `escalate delay`), executes relevant actions, updates the memory summary, and specifies sleep durations.

### Memory Compaction
To prevent prompt context explosion for orders with very long histories, the agent maintains a **rolling compact memory summary** (`compact_memory` column in `workflow_runs`). At the end of each reasoning step, the agent updates this single-paragraph status summary, compressing historical logs into a high-density status digest. In subsequent cycles, only this compact memory plus the recent events are fed to the agent, rather than the entire raw log, achieving simple but effective context compaction.

---

## 4. Database Persistence Layer
We use SQLite (`backend/supervisor.db`) with SQLAlchemy. It models:
1.  **Supervisor Templates**: Schema defining available agent tool sets, base instructions, models, and sleep cycles.
2.  **Workflow Runs**: Active and finished instances tracking run status, compact memory logs, next wakeup schedule, and final compiled summary.
3.  **Activity Logs**: Sequential record timeline. All operations (events, wake decisions, tool calls, and manual instructions) are logged in this table, providing a single consolidated ledger for UI rendering.
