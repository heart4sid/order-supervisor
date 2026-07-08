"use client";

import { useState, useEffect, useRef } from "react";

const BACKEND_URL = "http://127.0.0.1:8000";

export default function Home() {
  // Database configurations
  const [supervisors, setSupervisors] = useState([]);
  const [runs, setRuns] = useState([]);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [runDetails, setRunDetails] = useState(null);

  // Settings
  const [apiKeySet, setApiKeySet] = useState(false);
  const [inputApiKey, setInputApiKey] = useState("");

  // Create Template state
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [newTmplName, setNewTmplName] = useState("");
  const [newTmplBaseInst, setNewTmplBaseInst] = useState("");
  const [newTmplModel, setNewTmplModel] = useState("gemini-2.5-flash");
  const [newTmplWakeup, setNewTmplWakeup] = useState(4);
  const [newTmplTools, setNewTmplTools] = useState([
    "message_fulfillment_team",
    "message_payments_team",
    "message_logistics_team",
    "message_customer",
    "create_internal_note",
  ]);

  // Create Run state
  const [selectedTmplId, setSelectedTmplId] = useState("");
  const [newRunOrderId, setNewRunOrderId] = useState("");
  const [newRunItems, setNewRunItems] = useState([
    { name: "Premium Leather Boots", qty: 1, price: 189.99 },
  ]);
  const [newRunCustomerName, setNewRunCustomerName] = useState("Jane Doe");
  const [newRunCustomerEmail, setNewRunCustomerEmail] = useState("jane.doe@example.com");

  // Signal state
  const [selectedEventName, setSelectedEventName] = useState("payment_confirmed");
  const [eventPayloadJson, setEventPayloadJson] = useState('{\n  "message": "Payment verified via Stripe."\n}');
  const [manualInstruction, setManualInstruction] = useState("");

  // Local state for countdown
  const [secondsLeft, setSecondsLeft] = useState(null);
  
  // Keep polling reference
  const pollTimerRef = useRef(null);

  // Fetch initial data
  useEffect(() => {
    fetchSupervisors();
    fetchRuns();
    checkSettings();

    // Poll active runs
    const interval = setInterval(() => {
      fetchRuns();
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Fetch selected run details when selectedRunId changes
  useEffect(() => {
    if (selectedRunId) {
      fetchRunDetails(selectedRunId);
      // Set up polling for details
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      pollTimerRef.current = setInterval(() => {
        fetchRunDetails(selectedRunId);
      }, 2000);
    } else {
      setRunDetails(null);
      if (pollTimerRef.current) {
        clearInterval(pollTimerRef.current);
        pollTimerRef.current = null;
      }
    }

    return () => {
      if (pollTimerRef.current) clearInterval(pollTimerRef.current);
    };
  }, [selectedRunId]);

  // Countdown timer logic
  useEffect(() => {
    if (!runDetails || !runDetails.next_wakeup_at || runDetails.status !== "ACTIVE") {
      setSecondsLeft(null);
      return;
    }

    const calculateTimeLeft = () => {
      const target = new Date(runDetails.next_wakeup_at).getTime();
      const now = new Date().getTime();
      const diff = Math.max(0, Math.floor((target - now) / 1000));
      setSecondsLeft(diff);
    };

    calculateTimeLeft();
    const timer = setInterval(calculateTimeLeft, 1000);
    return () => clearInterval(timer);
  }, [runDetails]);

  const fetchSupervisors = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/supervisors`);
      const data = await res.json();
      setSupervisors(data);
      if (data.length > 0 && !selectedTmplId) {
        setSelectedTmplId(data[0].id.toString());
      }
    } catch (e) {
      console.error("Error fetching supervisors:", e);
    }
  };

  const fetchRuns = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs`);
      const data = await res.json();
      setRuns(data);
    } catch (e) {
      console.error("Error fetching runs:", e);
    }
  };

  const fetchRunDetails = async (id) => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs/${id}`);
      if (res.status === 404) {
        setSelectedRunId(null);
        return;
      }
      const data = await res.json();
      setRunDetails(data);
    } catch (e) {
      console.error("Error fetching run details:", e);
    }
  };

  const checkSettings = async () => {
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings`);
      const data = await res.json();
      setApiKeySet(data.gemini_api_key_set);
    } catch (e) {
      console.error("Error checking API key settings:", e);
    }
  };

  const handleSaveApiKey = async () => {
    if (!inputApiKey) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/settings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gemini_api_key: inputApiKey }),
      });
      if (res.ok) {
        setApiKeySet(true);
        setInputApiKey("");
        alert("Gemini API Key successfully updated in backend environment!");
      }
    } catch (e) {
      console.error("Error saving API key:", e);
    }
  };

  const handleCreateTemplate = async (e) => {
    e.preventDefault();
    if (!newTmplName || !newTmplBaseInst) return;

    try {
      const res = await fetch(`${BACKEND_URL}/api/supervisors`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newTmplName,
          base_instruction: newTmplBaseInst,
          model_name: newTmplModel,
          default_wakeup_hours: parseInt(newTmplWakeup),
          available_tools: newTmplTools,
        }),
      });
      if (res.ok) {
        setShowCreateTemplate(false);
        setNewTmplName("");
        setNewTmplBaseInst("");
        fetchSupervisors();
      }
    } catch (e) {
      console.error("Error creating template:", e);
    }
  };

  const handleGenerateMockOrder = () => {
    const randomId = "ORD-" + Math.floor(100000 + Math.random() * 900000);
    setNewRunOrderId(randomId);
    const mockItems = [
      [
        { name: "Wireless Headphones", qty: 1, price: 129.99 },
        { name: "USB-C Fast Charger", qty: 2, price: 24.50 },
      ],
      [
        { name: "Organic Wool Sweater", qty: 1, price: 95.00 },
      ],
      [
        { name: "Mechanical Keyboard", qty: 1, price: 149.99 },
        { name: "Gaming Mouse", qty: 1, price: 79.99 },
        { name: "Desk Pad Large", qty: 1, price: 29.99 },
      ],
    ];
    const pickedItems = mockItems[Math.floor(Math.random() * mockItems.length)];
    setNewRunItems(pickedItems);
    
    const mockCustomers = [
      { name: "John Smith", email: "john.smith@gmail.com" },
      { name: "Emily Watson", email: "emily.w@yahoo.com" },
      { name: "Carlos Santana", email: "carlos.s@outlook.com" },
    ];
    const pickedCust = mockCustomers[Math.floor(Math.random() * mockCustomers.length)];
    setNewRunCustomerName(pickedCust.name);
    setNewRunCustomerEmail(pickedCust.email);
  };

  const handleStartRun = async (e) => {
    e.preventDefault();
    if (!selectedTmplId || !newRunOrderId) {
      alert("Please fill in the supervisor template and Order ID.");
      return;
    }

    const orderData = {
      items: newRunItems,
      customer: {
        name: newRunCustomerName,
        email: newRunCustomerEmail,
      },
      timestamps: {
        placed_at: new Date().toISOString(),
      },
    };

    try {
      const res = await fetch(`${BACKEND_URL}/api/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supervisor_id: parseInt(selectedTmplId),
          order_id: newRunOrderId,
          order_data: orderData,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedRunId(data.run_id);
        fetchRuns();
        // Clear order form ID
        setNewRunOrderId("");
      } else {
        const error = await res.json();
        alert(`Error: ${error.detail}`);
      }
    } catch (e) {
      console.error("Error starting run:", e);
    }
  };

  const handleInjectEvent = async () => {
    if (!selectedRunId) return;
    try {
      let payload = {};
      try {
        payload = JSON.parse(eventPayloadJson);
      } catch (err) {
        alert("Payload must be valid JSON.");
        return;
      }

      const res = await fetch(`${BACKEND_URL}/api/runs/${selectedRunId}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          event_name: selectedEventName,
          payload: payload,
        }),
      });
      if (res.ok) {
        fetchRunDetails(selectedRunId);
        // Alert success
        setManualInstruction("");
      }
    } catch (e) {
      console.error("Error injecting event:", e);
    }
  };

  const handleInjectInstruction = async (e) => {
    e.preventDefault();
    if (!selectedRunId || !manualInstruction) return;
    try {
      const res = await fetch(`${BACKEND_URL}/api/runs/${selectedRunId}/instructions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: manualInstruction }),
      });
      if (res.ok) {
        setManualInstruction("");
        fetchRunDetails(selectedRunId);
      }
    } catch (e) {
      console.error("Error injecting instruction:", e);
    }
  };

  const handlePause = async () => {
    if (!selectedRunId) return;
    await fetch(`${BACKEND_URL}/api/runs/${selectedRunId}/interrupt`, { method: "POST" });
    fetchRunDetails(selectedRunId);
    fetchRuns();
  };

  const handleResume = async () => {
    if (!selectedRunId) return;
    await fetch(`${BACKEND_URL}/api/runs/${selectedRunId}/resume`, { method: "POST" });
    fetchRunDetails(selectedRunId);
    fetchRuns();
  };

  const handleTerminate = async () => {
    if (!selectedRunId) return;
    if (confirm("Are you sure you want to terminate this run?")) {
      await fetch(`${BACKEND_URL}/api/runs/${selectedRunId}/terminate`, { method: "POST" });
      fetchRunDetails(selectedRunId);
      fetchRuns();
    }
  };

  // Helper to load event templates
  const loadEventTemplate = (eventName) => {
    setSelectedEventName(eventName);
    let sample = {};
    if (eventName === "payment_confirmed") {
      sample = { message: "Payment verified successfully via Stripe.", transaction_id: "tx_3M19aB" };
    } else if (eventName === "payment_failed") {
      sample = { message: "Declined: Insufficient Funds.", card_brand: "Visa", error_code: "card_declined" };
    } else if (eventName === "shipment_created") {
      sample = { message: "Label created. Package picked up by courier.", carrier: "FedEx", tracking_number: "FX-8812903-US" };
    } else if (eventName === "shipment_delayed") {
      sample = { message: "Delayed in transit due to severe weather in Memphis.", carrier: "FedEx", reason: "Weather delay", new_eta: new Date(Date.now() + 86400000 * 2).toISOString() };
    } else if (eventName === "delivered") {
      sample = { message: "Package delivered at front porch.", carrier: "FedEx", signed_by: "Left at door" };
    } else if (eventName === "refund_requested") {
      sample = { message: "Customer initiated refund request via help center.", amount: 189.99, reason: "Wrong size" };
    } else if (eventName === "customer_message_received") {
      sample = { message: "Hello! My tracking link shows it hasn't moved. Can you check?" };
    } else if (eventName === "no_update_for_n_hours") {
      sample = { message: "Inactivity check. 24 hours without tracking scan.", duration_hours: 24 };
    }
    setEventPayloadJson(JSON.stringify(sample, null, 2));
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-slate-100 font-sans antialiased selection:bg-cyan-500 selection:text-slate-950">
      
      {/* Top Header Bar */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md px-6 py-4 flex flex-col md:flex-row items-center justify-between gap-4 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-indigo-500 flex items-center justify-center font-bold text-slate-950">Ω</div>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">Enterprise Order Supervisor</h1>
            <p className="text-xs text-slate-400">Autonomous Workflow and AI Orchestration Dashboard</p>
          </div>
        </div>

        {/* API Settings Section */}
        <div className="flex items-center gap-3 bg-slate-950/80 border border-slate-800 px-4 py-2 rounded-xl text-sm">
          {apiKeySet ? (
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-semibold text-emerald-400">Gemini Live Active</span>
              <button 
                onClick={() => setApiKeySet(false)} 
                className="text-[10px] text-slate-400 hover:text-red-400 underline ml-2"
              >
                Clear Key
              </button>
            </div>
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
                <span className="text-xs font-semibold text-amber-400 mr-2">Simulation Mode</span>
              </div>
              <div className="flex items-center gap-1.5">
                <input 
                  type="password" 
                  placeholder="Paste GEMINI_API_KEY..."
                  value={inputApiKey}
                  onChange={(e) => setInputApiKey(e.target.value)}
                  className="bg-slate-900 border border-slate-700 px-2 py-1 rounded text-xs focus:outline-none focus:border-cyan-500 w-44"
                />
                <button 
                  onClick={handleSaveApiKey}
                  className="bg-cyan-600 hover:bg-cyan-500 text-slate-950 font-bold px-2 py-1 rounded text-xs transition"
                >
                  Save
                </button>
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="flex-1 flex flex-col md:flex-row gap-6 p-6 overflow-hidden">
        
        {/* SIDEBAR: Config & Runs List */}
        <section className="w-full md:w-80 flex flex-col gap-6 shrink-0">
          
          {/* Create Supervisor template card */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-sm tracking-wide text-slate-300 uppercase">Supervisor Configurations</h2>
              <button 
                onClick={() => setShowCreateTemplate(!showCreateTemplate)}
                className="text-xs bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg px-2.5 py-1.5 transition"
              >
                {showCreateTemplate ? "Cancel" : "+ New"}
              </button>
            </div>

            {showCreateTemplate ? (
              <form onSubmit={handleCreateTemplate} className="flex flex-col gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Config Name</label>
                  <input 
                    type="text" 
                    required 
                    placeholder="e.g. VIP Courier Care"
                    value={newTmplName}
                    onChange={(e) => setNewTmplName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Base Instruction</label>
                  <textarea 
                    required 
                    rows="3"
                    placeholder="Base behavior instructions for the LLM supervisor..."
                    value={newTmplBaseInst}
                    onChange={(e) => setNewTmplBaseInst(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Model Choice</label>
                    <select 
                      value={newTmplModel}
                      onChange={(e) => setNewTmplModel(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-100 focus:outline-none"
                    >
                      <option value="gemini-2.5-flash">Gemini Flash</option>
                      <option value="gemini-2.5-pro">Gemini Pro</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-slate-400 mb-1">Sleep (Hours)</label>
                    <input 
                      type="number" 
                      min="1" 
                      value={newTmplWakeup}
                      onChange={(e) => setNewTmplWakeup(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 rounded-lg p-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
                <button 
                  type="submit"
                  className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-slate-950 font-bold text-xs py-2 rounded-xl mt-2 transition"
                >
                  Create Configuration
                </button>
              </form>
            ) : (
              <div className="flex flex-col gap-2 max-h-48 overflow-y-auto">
                {supervisors.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-4">No configurations created.</p>
                ) : (
                  supervisors.map((s) => (
                    <div key={s.id} className="p-3 bg-slate-950/60 border border-slate-800 rounded-xl">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-xs text-slate-300">{s.name}</span>
                        <span className="text-[10px] bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded">{s.model_name.replace("gemini-", "")}</span>
                      </div>
                      <p className="text-[10px] text-slate-400 line-clamp-2">{s.base_instruction}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>

          {/* RUNS LIST */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5 shadow-xl flex-1 flex flex-col min-h-0">
            <h2 className="font-bold text-sm tracking-wide text-slate-300 uppercase mb-4">Active & Completed Runs</h2>
            
            <div className="flex-1 overflow-y-auto flex flex-col gap-2.5 pr-1">
              {runs.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-8">No order supervisor runs active.</p>
              ) : (
                runs.map((r) => {
                  const isActive = r.status === "ACTIVE";
                  const isPaused = r.status === "PAUSED";
                  const isCompleted = r.status === "COMPLETED";
                  
                  let badgeColor = "bg-red-500/20 text-red-400 border-red-500/30";
                  if (isActive) badgeColor = "bg-emerald-500/20 text-emerald-400 border-emerald-500/30";
                  if (isPaused) badgeColor = "bg-amber-500/20 text-amber-400 border-amber-500/30";
                  if (isCompleted) badgeColor = "bg-indigo-500/20 text-indigo-400 border-indigo-500/30";

                  return (
                    <div 
                      key={r.run_id}
                      onClick={() => setSelectedRunId(r.run_id)}
                      className={`p-3 rounded-xl border text-left cursor-pointer transition flex flex-col gap-1.5 ${
                        selectedRunId === r.run_id 
                          ? "bg-slate-800/80 border-cyan-500 shadow-md shadow-cyan-950/20" 
                          : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-200">{r.order_id}</span>
                        <span className={`text-[9px] border px-1.5 py-0.5 rounded font-mono ${badgeColor}`}>{r.status}</span>
                      </div>
                      
                      <div className="flex items-center justify-between text-[10px] text-slate-400">
                        <span>Config: {r.supervisor_name}</span>
                        <span>{new Date(r.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                      </div>
                      
                      <p className="text-[10px] text-slate-400 line-clamp-1 border-t border-slate-900 pt-1.5 italic">
                        {r.compact_memory || "Awaiting execution..."}
                      </p>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </section>

        {/* MAIN PANEL: Run Details or Launch Run */}
        <section className="flex-1 flex flex-col bg-slate-900/40 border border-slate-800 rounded-3xl p-6 shadow-2xl overflow-y-auto">
          {selectedRunId && runDetails ? (
            // DETAILED RUN VIEW
            <div className="flex flex-col gap-6 flex-1">
              
              {/* Active Run Header */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="text-xl font-black text-slate-200">{runDetails.order_id}</span>
                    <span className={`text-xs px-2.5 py-1 rounded-full font-bold uppercase tracking-wide border flex items-center gap-1.5 ${
                      runDetails.status === "ACTIVE" ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse" :
                      runDetails.status === "PAUSED" ? "bg-amber-500/10 text-amber-400 border-amber-500/20" :
                      runDetails.status === "COMPLETED" ? "bg-indigo-500/10 text-indigo-400 border-indigo-500/20" :
                      "bg-red-500/10 text-red-400 border-red-500/20"
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${
                        runDetails.status === "ACTIVE" ? "bg-emerald-400" :
                        runDetails.status === "PAUSED" ? "bg-amber-400" :
                        runDetails.status === "COMPLETED" ? "bg-indigo-400" :
                        "bg-red-400"
                      }`}></span>
                      {runDetails.status}
                    </span>
                  </div>
                  <div className="flex flex-col gap-0.5 text-xs text-slate-400">
                    <span>Supervisor: <strong className="text-slate-300">{runDetails.supervisor.name}</strong> ({runDetails.supervisor.model_name})</span>
                    <span className="font-mono text-[10px] text-slate-500">Run UUID: {runDetails.run_id}</span>
                  </div>
                </div>

                {/* Workflow Control Buttons */}
                <div className="flex items-center gap-2">
                  <button 
                    disabled={runDetails.status !== "ACTIVE"}
                    onClick={handlePause}
                    className="flex-1 sm:flex-initial bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 disabled:opacity-40 font-semibold text-xs px-3.5 py-2 rounded-xl transition"
                  >
                    Pause Supervisor
                  </button>
                  <button 
                    disabled={runDetails.status !== "PAUSED"}
                    onClick={handleResume}
                    className="flex-1 sm:flex-initial bg-emerald-600 hover:bg-emerald-500 text-slate-950 disabled:opacity-40 font-bold text-xs px-3.5 py-2 rounded-xl transition"
                  >
                    Resume Supervisor
                  </button>
                  <button 
                    disabled={runDetails.status !== "ACTIVE" && runDetails.status !== "PAUSED"}
                    onClick={handleTerminate}
                    className="flex-1 sm:flex-initial bg-red-650 hover:bg-red-600 text-slate-100 disabled:opacity-40 font-semibold text-xs px-3.5 py-2 rounded-xl transition"
                  >
                    Terminate
                  </button>
                </div>
              </div>

              {/* Grid Content Layout */}
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Column 1: State & Memory Card */}
                <div className="flex flex-col gap-6">
                  
                  {/* Countdown Timer Card */}
                  <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex flex-col gap-2">
                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Operational Wakeup Status</h3>
                    
                    {runDetails.status === "ACTIVE" ? (
                      <div>
                        <div className="flex items-baseline gap-2">
                          <span className="text-3xl font-black text-cyan-400 font-mono">
                            {secondsLeft !== null ? `${secondsLeft}s` : "---"}
                          </span>
                          <span className="text-xs text-slate-400">until scheduled review</span>
                        </div>
                        <p className="text-[10px] text-slate-500 mt-2 italic">
                          (Time dilation: 1 hour of supervisor sleep maps to 10 seconds of real-world timer)
                        </p>
                      </div>
                    ) : runDetails.status === "PAUSED" ? (
                      <span className="text-lg font-bold text-amber-400">Indefinitely Asleep (Paused)</span>
                    ) : (
                      <span className="text-lg font-bold text-indigo-400">Workflow Inactive (Terminated)</span>
                    )}

                    {runDetails.next_wakeup_at && (
                      <span className="text-[10px] text-slate-400 mt-1 block">
                        Target Time: {new Date(runDetails.next_wakeup_at).toLocaleTimeString()}
                      </span>
                    )}
                  </div>

                  {/* Compact Memory Card */}
                  <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex flex-col gap-3">
                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Supervisor Memory Ledger</h3>
                    
                    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3.5 text-xs text-slate-300 leading-relaxed font-sans italic">
                      "{runDetails.compact_memory || "Memory is blank. Initiating first check..."}"
                    </div>

                    <div>
                      <span className="text-[10px] uppercase font-bold text-slate-500 block mb-1">Active Tools Available</span>
                      <div className="flex flex-wrap gap-1">
                        {runDetails.supervisor.available_tools.map((tool) => (
                          <span key={tool} className="text-[9px] bg-slate-800 text-slate-300 px-2 py-0.5 rounded-md font-mono">{tool}</span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Order Context Details */}
                  <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex flex-col gap-3">
                    <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider">Order Context Details</h3>
                    <div className="text-xs flex flex-col gap-1.5 text-slate-300">
                      <div><strong className="text-slate-400">Customer:</strong> {runDetails.order_data?.customer?.name} ({runDetails.order_data?.customer?.email})</div>
                      <div>
                        <strong className="text-slate-400">Items Ordered:</strong>
                        <ul className="list-disc pl-4 mt-1 flex flex-col gap-1 text-[11px] text-slate-400">
                          {runDetails.order_data?.items?.map((item, idx) => (
                            <li key={idx}>
                              {item.name} x{item.qty} (${item.price.toFixed(2)})
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Column 2: Event Injector & Instructions */}
                <div className="flex flex-col gap-6">
                  
                  {/* Event Injector */}
                  <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex flex-col gap-4">
                    <div>
                      <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Signal & Event Injector</h3>
                      <p className="text-[10px] text-slate-500">Simulate order lifecycle milestones and signals received from commerce engines.</p>
                    </div>

                    {/* Pre-defined buttons grid */}
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        "payment_confirmed", "payment_failed",
                        "shipment_created", "shipment_delayed",
                        "delivered", "refund_requested",
                        "customer_message_received", "no_update_for_n_hours"
                      ].map((evt) => (
                        <button
                          key={evt}
                          onClick={() => loadEventTemplate(evt)}
                          className={`text-[10px] font-medium text-left p-2 rounded-lg border transition ${
                            selectedEventName === evt 
                              ? "bg-cyan-950/50 border-cyan-500 text-cyan-400" 
                              : "bg-slate-900 border-slate-800 hover:border-slate-700 text-slate-300"
                          }`}
                        >
                          {evt.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Payload JSON Configuration</label>
                      <textarea
                        rows="4"
                        value={eventPayloadJson}
                        onChange={(e) => setEventPayloadJson(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-800 rounded-lg p-2.5 text-xs text-slate-300 font-mono focus:outline-none focus:border-cyan-500"
                      />
                    </div>

                    <button
                      onClick={handleInjectEvent}
                      disabled={runDetails.status !== "ACTIVE" && runDetails.status !== "PAUSED"}
                      className="w-full bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 disabled:opacity-40 text-slate-950 font-bold text-xs py-2 rounded-xl transition"
                    >
                      Inject Event Signal
                    </button>
                  </div>

                  {/* Mid-Flight Instructions */}
                  <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex flex-col gap-4">
                    <div>
                      <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1">Mid-Flight Instructions</h3>
                      <p className="text-[10px] text-slate-500">Inject additional guidelines dynamically into this run's execution context.</p>
                    </div>

                    {runDetails.run_instructions.length > 0 && (
                      <div className="flex flex-col gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-500">Applied instructions:</span>
                        <div className="flex flex-col gap-1">
                          {runDetails.run_instructions.map((inst, i) => (
                            <div key={i} className="text-[11px] bg-slate-900 border border-slate-800/80 px-2.5 py-1.5 rounded-lg text-slate-300 italic border-l-2 border-l-cyan-400">
                              "{inst}"
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <form onSubmit={handleInjectInstruction} className="flex gap-2">
                      <input
                        type="text"
                        placeholder="e.g. Do not contact customer without review..."
                        value={manualInstruction}
                        onChange={(e) => setManualInstruction(e.target.value)}
                        className="flex-1 bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:border-cyan-500"
                      />
                      <button
                        type="submit"
                        disabled={!manualInstruction || runDetails.status !== "ACTIVE"}
                        className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-slate-200 disabled:opacity-40 font-bold px-3 py-1.5 rounded-lg text-xs transition"
                      >
                        Add
                      </button>
                    </form>
                  </div>
                </div>

                {/* Column 3: Live Log / Timeline */}
                <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-5 flex flex-col min-h-96">
                  <h3 className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">Timeline Ledger</h3>
                  
                  {/* Timeline listing */}
                  <div className="flex-1 overflow-y-auto flex flex-col gap-4 pr-1">
                    
                    {/* Final Output display at top of timeline if completed */}
                    {runDetails.status === "COMPLETED" && runDetails.final_summary && (
                      <div className="bg-indigo-950/30 border border-indigo-500/30 rounded-xl p-4 flex flex-col gap-3">
                        <div className="flex items-center gap-2 text-indigo-400 text-xs font-bold uppercase">
                          <span>✨ Supervisor Closing Report</span>
                        </div>
                        <p className="text-xs text-slate-300 leading-relaxed font-semibold">
                          {runDetails.final_summary.final_summary}
                        </p>
                        {runDetails.final_summary.important_actions_taken?.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">Actions Executed</span>
                            <div className="flex flex-col gap-1">
                              {runDetails.final_summary.important_actions_taken.map((act, i) => (
                                <div key={i} className="text-[11px] text-slate-300 font-mono bg-slate-900 border border-slate-850 p-1.5 rounded">✓ {act}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        {runDetails.final_summary.key_learnings?.length > 0 && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block mb-1">Key Learnings</span>
                            <ul className="list-disc pl-4 text-[11px] text-slate-300 flex flex-col gap-1">
                              {runDetails.final_summary.key_learnings.map((l, i) => <li key={i}>{l}</li>)}
                            </ul>
                          </div>
                        )}
                        {runDetails.final_summary.feedback_recommendations && (
                          <div>
                            <span className="text-[10px] font-bold text-slate-400 block mb-0.5">Recommendations</span>
                            <p className="text-[11px] text-indigo-300 italic">"{runDetails.final_summary.feedback_recommendations}"</p>
                          </div>
                        )}
                      </div>
                    )}

                    {runDetails.timeline.length === 0 ? (
                      <p className="text-xs text-slate-500 text-center py-8">Timeline is currently empty.</p>
                    ) : (
                      runDetails.timeline.map((item) => {
                        const isEvent = item.type === "event";
                        const isReasoning = item.type === "wake_decision";
                        const isAction = item.type === "agent_action";
                        const isManual = item.type === "manual_instruction";
                        const isFinal = item.type === "final_output";

                        let badgeColor = "bg-slate-800 text-slate-400";
                        let titleText = item.name;

                        if (isEvent) {
                          badgeColor = "bg-cyan-500/10 text-cyan-400 border-cyan-500/20";
                          titleText = `Event: ${item.name.replace(/_/g, ' ')}`;
                        } else if (isReasoning) {
                          badgeColor = "bg-emerald-500/10 text-emerald-400 border-emerald-500/20";
                          titleText = "Supervisor Evaluation";
                        } else if (isAction) {
                          badgeColor = "bg-amber-500/10 text-amber-400 border-amber-500/20";
                          titleText = `Executed Action: ${item.name.replace(/_/g, ' ')}`;
                        } else if (isManual) {
                          badgeColor = "bg-purple-500/10 text-purple-400 border-purple-500/20";
                          titleText = "Manual Overrides";
                        } else if (isFinal) {
                          badgeColor = "bg-indigo-500/10 text-indigo-400 border-indigo-500/20";
                          titleText = "Workflow Closed Summary";
                        }

                        return (
                          <div key={item.id} className="relative pl-4 border-l border-slate-800 text-left">
                            {/* Dot node */}
                            <span className={`absolute -left-1.5 top-1.5 w-3 h-3 rounded-full border border-slate-950 ${
                              isEvent ? "bg-cyan-500" :
                              isReasoning ? "bg-emerald-500" :
                              isAction ? "bg-amber-500" :
                              isManual ? "bg-purple-500" : "bg-indigo-500"
                            }`}></span>
                            
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[11px] font-bold text-slate-200">{titleText}</span>
                              <span className="text-[9px] text-slate-500">{new Date(item.timestamp).toLocaleTimeString()}</span>
                            </div>

                            <div className="text-[11px] text-slate-400 leading-relaxed font-sans">
                              {isReasoning && item.payload.reasoning && (
                                <p className="bg-slate-900/60 border border-slate-850 p-2.5 rounded-lg text-emerald-300 italic">
                                  {item.payload.reasoning}
                                </p>
                              )}
                              
                              {isAction && item.payload.message && (
                                <p className="font-mono bg-slate-900 border border-slate-850 p-2 rounded-lg text-slate-300 text-[10px]">
                                  <strong>Message:</strong> {item.payload.message}
                                </p>
                              )}

                              {isEvent && item.payload.message && (
                                <p className="text-cyan-200">{item.payload.message}</p>
                              )}

                              {isManual && item.payload.message && (
                                <p className="text-purple-300">Added mid-flight instruction: "{item.payload.message}"</p>
                              )}

                              {/* Show nested payload keys if they are events and have metadata */}
                              {isEvent && Object.keys(item.payload).length > 1 && (
                                <div className="mt-1 flex flex-wrap gap-1.5 text-[9px] font-mono">
                                  {Object.entries(item.payload).map(([k, v]) => {
                                    if (k === "message" || typeof v === "object") return null;
                                    return (
                                      <span key={k} className="bg-slate-900 text-slate-500 px-1.5 py-0.5 rounded border border-slate-850">
                                        {k}: {String(v)}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

              </div>

              {/* Close Selected Run View Button */}
              <div className="flex justify-end mt-2">
                <button
                  onClick={() => setSelectedRunId(null)}
                  className="bg-slate-800 hover:bg-slate-700 border border-slate-750 text-xs px-4 py-2 rounded-xl transition"
                >
                  Return to Dashboard Welcome
                </button>
              </div>

            </div>
          ) : (
            // LAUNCH NEW RUN / WELCOME STATE
            <div className="flex flex-col gap-8 py-4">
              
              {/* Welcome text */}
              <div className="border-b border-slate-800 pb-6 text-center sm:text-left">
                <h2 className="text-2xl font-black text-slate-200 tracking-tight bg-gradient-to-r from-cyan-400 to-indigo-400 bg-clip-text text-transparent">Supervisor Operations Center</h2>
                <p className="text-slate-400 text-xs mt-1">Select an active run from the sidebar ledger or deploy a new order supervisor workflow using the deployment forms below.</p>
              </div>

              {/* Grid with New Run Form */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                
                {/* Deployment Form */}
                <div className="bg-slate-950/50 border border-slate-850 rounded-2xl p-6 flex flex-col gap-5">
                  <div className="flex items-center gap-2 border-b border-slate-900 pb-3">
                    <span className="w-5 h-5 rounded bg-cyan-500/10 text-cyan-400 flex items-center justify-center text-xs font-bold font-mono">1</span>
                    <h3 className="font-bold text-sm text-slate-200">Deploy Supervisor Run</h3>
                  </div>

                  <form onSubmit={handleStartRun} className="flex flex-col gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Select Configuration Template</label>
                      {supervisors.length === 0 ? (
                        <div className="text-xs text-red-400 bg-red-950/20 border border-red-500/10 p-2.5 rounded-lg">
                          No supervisor configurations templates exist. Create one first!
                        </div>
                      ) : (
                        <select
                          value={selectedTmplId}
                          onChange={(e) => setSelectedTmplId(e.target.value)}
                          className="w-full bg-slate-900 border border-slate-800 rounded-xl p-2.5 text-xs text-slate-200 focus:outline-none focus:border-cyan-500"
                        >
                          {supervisors.map((s) => (
                            <option key={s.id} value={s.id}>{s.name} ({s.model_name})</option>
                          ))}
                        </select>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-400 mb-1.5 uppercase">Commerce Order ID</label>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          required
                          placeholder="e.g. ORD-881203"
                          value={newRunOrderId}
                          onChange={(e) => setNewRunOrderId(e.target.value)}
                          className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500"
                        />
                        <button
                          type="button"
                          onClick={handleGenerateMockOrder}
                          className="bg-slate-800 border border-slate-700 hover:bg-slate-700 text-cyan-400 font-bold px-3 py-2 rounded-xl text-xs transition"
                        >
                          Generate Mock Order
                        </button>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={supervisors.length === 0}
                      className="w-full bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 disabled:opacity-40 text-slate-950 font-black text-xs py-3 rounded-xl shadow-lg shadow-cyan-950/30 transition mt-2"
                    >
                      Instantiate Supervisor Workflow Run
                    </button>
                  </form>
                </div>

                {/* Current Order Preview Panel */}
                <div className="bg-slate-950/30 border border-slate-850 border-dashed rounded-2xl p-6 flex flex-col gap-4">
                  <h3 className="font-bold text-xs text-slate-400 uppercase tracking-wider">Preview Inception Payload</h3>
                  
                  <div className="flex flex-col gap-3 text-xs text-slate-300">
                    <div className="bg-slate-900/50 border border-slate-850 rounded-xl p-3">
                      <div className="font-bold text-slate-400 mb-1">Customer Profile</div>
                      <div>Name: <span className="text-slate-200">{newRunCustomerName}</span></div>
                      <div>Email: <span className="text-slate-200">{newRunCustomerEmail}</span></div>
                    </div>

                    <div className="bg-slate-900/50 border border-slate-850 rounded-xl p-3">
                      <div className="font-bold text-slate-400 mb-2">Order Line Items</div>
                      <table className="w-full text-left">
                        <thead>
                          <tr className="text-[10px] text-slate-500 border-b border-slate-800 uppercase">
                            <th className="pb-1.5">Item Description</th>
                            <th className="pb-1.5 text-center">Qty</th>
                            <th className="pb-1.5 text-right">Price</th>
                          </tr>
                        </thead>
                        <tbody>
                          {newRunItems.map((item, idx) => (
                            <tr key={idx} className="border-b border-slate-900 last:border-0 text-slate-200">
                              <td className="py-1.5">{item.name}</td>
                              <td className="py-1.5 text-center">{item.qty}</td>
                              <td className="py-1.5 text-right">${item.price.toFixed(2)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

              </div>
              
              {/* Default Supervisor Configuration Helper */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-5 mt-4">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wide mb-2">💡 Quick Start Hint:</h4>
                <p className="text-slate-400 text-xs leading-relaxed">
                  If you don't have any supervisor configurations created, create one first in the top sidebar panel. You can define base behavior constraints (e.g. <em>"Prioritize resolving payment failures first, check logistics delays closely"</em>), choose your model, and run it. The Temporal workflow will be created, running the Agent loop automatically.
                </p>
              </div>

            </div>
          )}
        </section>

      </main>

      <footer className="border-t border-slate-900 bg-slate-950 p-4 text-center text-xs text-slate-500">
        Enterprise Order Supervisor Orchestrator POC &copy; 2026. Made using Python, FastAPI, Next.js, and Temporal.
      </footer>

    </div>
  );
}
