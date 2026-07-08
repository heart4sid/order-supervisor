# Enterprise Order Supervisor

A stateful, event-driven orchestration system built to oversee order lifecycles from creation until final completion. This Proof of Concept (POC) utilizes a Python backend with FastAPI and SQLite, a local Temporal dev server to model long-running workflows, and a Next.js App Router frontend for interactive monitoring and signal simulation.

---

## Technical Stack

*   **Frontend**: Next.js (App Router, Tailwind CSS v4)
*   **Backend**: Python 3.14 (FastAPI, SQLite, SQLAlchemy)
*   **Orchestration**: Temporal Python SDK
*   **AI Engine**: Google GenAI SDK (`google-genai`) with live Gemini/Simulation fallback support

---

## Project Structure

```
├── backend/
│   ├── main.py              # FastAPI Web API
│   ├── database.py          # SQLite Schema & SQLAlchemy models
│   ├── workflow.py          # Temporal Workflow definitions (sleep-wake loop)
│   ├── activities.py        # Temporal Activities (DB updates & Agent invocations)
│   ├── agent.py             # Agent Reasoning logic (Gemini & rule-based simulation)
│   ├── worker.py            # Temporal Worker Daemon
│   ├── temporal_client.py   # Connection wrappers to Temporal
│   └── supervisor.db        # SQLite database file (created on runtime)
├── bin/
│   └── temporal.exe         # Local Temporal Server CLI (v1.7.3)
└── frontend/
    └── app/
        └── page.js          # Next.js Dashboard UI
```

---

## Getting Started

### 1. Prerequisites
Ensure you have the following installed on your machine:
*   [Node.js](https://nodejs.org) (v18 or higher)
*   [Python 3](https://python.org) (with `pip` package manager)

### 2. Installation
Open your terminal in the project workspace directory and run:

#### Set Up Backend Dependencies:
```bash
py -m pip install temporalio google-genai fastapi uvicorn python-dotenv
```

#### Set Up Frontend Dependencies:
Next.js dependencies are already initialized. To ensure all packages are ready, run:
```bash
cd frontend
npm install
cd ..
```

---

## How to Run the System

You will need **four** separate terminal windows to run the complete environment:

### Terminal 1: Start Temporal Server
Run the local dev Temporal Server:
```powershell
& "e:\Order Supervisor\bin\temporal.exe" server start-dev
```
The Temporal Web UI will be available at: [http://localhost:8233](http://localhost:8233).

### Terminal 2: Start Temporal Worker
Launch the worker daemon to process supervisor tasks:
```powershell
cd backend
py worker.py
```

### Terminal 3: Start FastAPI Backend
Launch the API server (reloads on file changes):
```powershell
cd backend
py -m uvicorn main:app --reload
```
The API Swagger documentation will be available at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

### Terminal 4: Start Next.js Frontend
Launch the developer server:
```powershell
cd frontend
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser to view the interactive dashboard.

---

## Simulating the Order Lifecycle

1.  **Configure a Template**: In the top sidebar panel, create a configuration template (e.g. name: `"Standard commerce care"`, base instructions: `"Prioritize payments first."`).
2.  **Deploy Run**: Fill in the Deploy form. Click "Generate Mock Order" and click "Instantiate Supervisor Workflow Run".
3.  **Monitor Loop**: You will see the supervisor initialize, run an initial reasoning step, execute actions (e.g. log note, alert fulfillment), and go to sleep.
4.  **Signal Injection**: Use the Signal Injector in the details panel to fire order events (`payment_confirmed`, `payment_failed`, `shipment_created`, etc.). Notice that:
    *   *Non-critical* signals (e.g., `payment_confirmed`) update the timeline but keep the supervisor asleep.
    *   *Critical* signals (e.g., `payment_failed`) immediately trigger a wake-up, leading to active tool calls.
5.  **Injected Mid-flight Rules**: Enter custom guidelines (e.g. *"If shipment is delayed, escalate immediately"*) and watch them affect subsequent simulated/AI agent evaluations.
6.  **Close Workflow**: Inject the terminal `delivered` event to trigger final compilation reports.
