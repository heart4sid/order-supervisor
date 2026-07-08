import os
import json
from google import genai
from google.genai import types

def run_agent_reasoning(
    run_id: str,
    order_id: str,
    order_context: dict,
    base_instruction: str,
    run_instructions: list,
    compact_memory: str,
    timeline: list,
    model_name: str = "gemini-2.5-flash"
) -> dict:
    """
    Runs agent reasoning over the current order lifecycle state.
    Returns a dict matching the required JSON schema.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    
    if api_key:
        return run_live_gemini(
            api_key=api_key,
            order_id=order_id,
            order_context=order_context,
            base_instruction=base_instruction,
            run_instructions=run_instructions,
            compact_memory=compact_memory,
            timeline=timeline,
            model_name=model_name
        )
    else:
        return run_simulated_agent(
            order_id=order_id,
            order_context=order_context,
            base_instruction=base_instruction,
            run_instructions=run_instructions,
            compact_memory=compact_memory,
            timeline=timeline
        )

def run_live_gemini(
    api_key: str,
    order_id: str,
    order_context: dict,
    base_instruction: str,
    run_instructions: list,
    compact_memory: str,
    timeline: list,
    model_name: str
) -> dict:
    """
    Calls the actual Gemini API to generate structural decisions.
    """
    client = genai.Client(api_key=api_key)
    
    prompt = f"""
You are an autonomous Enterprise Order Supervisor Agent. Your mission is to oversee a single commerce order from placement to completion.
Evaluate the current timeline, previous memory, and instructions to formulate your reasoning and next actions.

Order Context:
{json.dumps(order_context, indent=2)}

Base Instruction:
{base_instruction}

Run-specific Instructions (mid-flight manual overrides):
{json.dumps(run_instructions, indent=2)}

Compact Memory (previous summary):
{compact_memory}

Timeline of Events & Actions:
{json.dumps(timeline, indent=2)}

Current System Time: {datetime_now_iso()}

You MUST structure your response as JSON matching this schema:
{{
  "reasoning_outcome": "Detailed text explaining your assessment of the current order state and history.",
  "actions_to_execute": [
    {{
      "action_name": "message_fulfillment_team | message_payments_team | message_logistics_team | message_customer | create_internal_note",
      "payload": {{
        "message": "The precise text content of the message or note."
      }}
    }}
  ],
  "updated_compact_memory": "A consolidated, high-density summary of the order's status and your interventions to date.",
  "next_scheduled_wakeup": {{
    "sleep_duration_hours": 4, 
    "guidance_for_classifier": "Text instructions telling the system's entry filter which specific incoming signals should trigger an early emergency wake-up."
  }}
}}
Return ONLY valid JSON. Do not include markdown code block formatting (like ```json ... ```) in your API response.
"""
    try:
        response = client.models.generate_content(
            model=model_name,
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            )
        )
        return json.loads(response.text)
    except Exception as e:
        print(f"Error querying Gemini API: {e}. Falling back to simulation.", flush=True)
        return run_simulated_agent(
            order_id=order_id,
            order_context=order_context,
            base_instruction=base_instruction,
            run_instructions=run_instructions,
            compact_memory=compact_memory,
            timeline=timeline
        )

def run_simulated_agent(
    order_id: str,
    order_context: dict,
    base_instruction: str,
    run_instructions: list,
    compact_memory: str,
    timeline: list
) -> dict:
    """
    Deterministic mock simulation logic representing agent responses.
    """
    # 1. Identify the last event from the timeline
    last_event = None
    last_event_name = ""
    last_event_msg = ""
    for entry in reversed(timeline):
        if entry.get("type") == "event":
            last_event = entry
            last_event_name = entry.get("name")
            payload = entry.get("payload", {})
            if isinstance(payload, str):
                try:
                    payload = json.loads(payload)
                except:
                    pass
            last_event_msg = payload.get("message", "") if isinstance(payload, dict) else ""
            break
            
    # Check manual instructions overrides
    suppress_customer_contact = False
    escalate_immediately = False
    prioritize_speed = False
    
    for instruction in run_instructions:
        text = instruction.lower()
        if "do not contact" in text or "suppress customer" in text:
            suppress_customer_contact = True
        if "escalate" in text:
            escalate_immediately = True
        if "speed" in text or "fast" in text:
            prioritize_speed = True

    reasoning = "Analyzing order progress. "
    actions = []
    memory = compact_memory or "Order tracking initiated."
    sleep_hours = 4
    guidance = "Wake on any lifecycle signal or update."

    # If timeline is empty, assume starting
    if not last_event_name:
        reasoning += "Order started. Awaiting payment confirmation."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": f"Order {order_id} monitoring started. Base instruction active."}
        })
        memory = "Monitoring started. Waiting for payment."
        sleep_hours = 4
        guidance = "Wake me immediately on payment_confirmed, payment_failed, or cancel signals."
        
    elif last_event_name == "order_created":
        reasoning += "Order created event received. Initializing checks."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": f"Order tracking initialized for {order_id}."}
        })
        memory = "Order created. Pending payment confirmation."
        sleep_hours = 4
        guidance = "Wake me on payment_confirmed or payment_failed."
        
    elif last_event_name == "payment_confirmed":
        reasoning += "Payment confirmed. Logistics and fulfillment can now proceed."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": "Payment verified. Alerting fulfillment team to pack items."}
        })
        actions.append({
            "action_name": "message_fulfillment_team",
            "payload": {"message": f"Payment cleared for order {order_id}. Please prepare for shipment."}
        })
        memory = "Payment confirmed. Fulfillment notified."
        sleep_hours = 6
        guidance = "Wake me on shipment_created, refund_requested, or customer_message_received."
        
    elif last_event_name == "payment_failed":
        reasoning += "Payment failed. This blocks fulfillment. Prompting customer and payments team."
        actions.append({
            "action_name": "message_payments_team",
            "payload": {"message": f"Payment failure alert for Order {order_id}. Customer transaction failed."}
        })
        
        if not suppress_customer_contact:
            actions.append({
                "action_name": "message_customer",
                "payload": {"message": f"Hello, we experienced an issue processing payment for your order {order_id}. Please review billing details."}
            })
        else:
            actions.append({
                "action_name": "create_internal_note",
                "payload": {"message": "Customer payment notification suppressed by custom run instruction."}
            })
            
        memory = "Payment failed. Interventions sent. Awaiting new transaction."
        sleep_hours = 2
        guidance = "Wake immediately if payment_confirmed or payment_failed arrives."
        
    elif last_event_name == "shipment_created":
        reasoning += "Shipment has been created. Awaiting delivery confirmation from logistics."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": f"Shipment generated. Carrier tracking active."}
        })
        memory = "Order shipped. Tracking active."
        sleep_hours = 12
        guidance = "Wake me on delivered, shipment_delayed, or refund_requested."
        
    elif last_event_name == "shipment_delayed":
        reasoning += "Shipment delay detected. Initiating escalation and customer communication."
        actions.append({
            "action_name": "message_logistics_team",
            "payload": {"message": f"Shipment delay warning for Order {order_id}. Carrier review requested."}
        })
        
        if escalate_immediately:
            actions.append({
                "action_name": "create_internal_note",
                "payload": {"message": "CRITICAL: Shipment delay escalated to manager due to run-specific rules."}
            })
            
        if not suppress_customer_contact:
            actions.append({
                "action_name": "message_customer",
                "payload": {"message": "Hi, we wanted to inform you that your shipment is experiencing a transit delay. We are tracking it closely."}
            })
            
        memory = "Delayed shipment. Logistics alerted. Customer updated."
        sleep_hours = 3 if prioritize_speed else 6
        guidance = "Wake me on delivered, customer_message_received, or cancel."
        
    elif last_event_name == "delivered":
        reasoning += "Order has been delivered. Finalizing lifecycle records."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": f"Delivery confirmed. Completing supervisor session."}
        })
        memory = "Delivered. Awaiting final summary closure."
        sleep_hours = 24
        guidance = "No updates required. Workflow concluding."
        
    elif last_event_name == "refund_requested":
        reasoning += "Refund requested by customer. Initiating financial processing check."
        actions.append({
            "action_name": "message_payments_team",
            "payload": {"message": f"Refund review requested for Order {order_id}. Please verify refund window."}
        })
        memory = "Refund request logged. Pending finance verification."
        sleep_hours = 4
        guidance = "Wake on refund_completed or cancel."
        
    elif last_event_name == "customer_message_received":
        reasoning += f"Received message from customer: '{last_event_msg}'."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": f"Customer message logged: '{last_event_msg}'"}
        })
        if not suppress_customer_contact:
            actions.append({
                "action_name": "message_customer",
                "payload": {"message": "Thank you for reaching out. We have logged your request and our support team will respond shortly."}
            })
        memory = f"Customer message logged. Auto-replied. Memory: {compact_memory or 'N/A'}"
        sleep_hours = 4
        guidance = "Wake on any logistics or payment signal."
        
    elif last_event_name == "no_update_for_n_hours":
        reasoning += "Alert: No status updates have been received for an extended period. Pinging teams."
        actions.append({
            "action_name": "message_logistics_team",
            "payload": {"message": f"Inquiry: No shipping updates for Order {order_id} in last 24 hours."}
        })
        memory = "Stale status alert triggered. Logistics pinged."
        sleep_hours = 4
        guidance = "Wake immediately on any signal."

    else:
        # Unknown event handler
        reasoning += f"Unknown event '{last_event_name}' received. Logging observation."
        actions.append({
            "action_name": "create_internal_note",
            "payload": {"message": f"Logged unknown lifecycle signal: {last_event_name}."}
        })
        memory = f"Unknown signal: {last_event_name}."
        sleep_hours = 4
        guidance = "Wake on next signal."

    # Incorporate any custom instructions in the reasoning outcome to show adaptability
    if run_instructions:
        reasoning += f" (Run Instructions applied: {', '.join(run_instructions)})"

    return {
        "reasoning_outcome": reasoning,
        "actions_to_execute": actions,
        "updated_compact_memory": memory,
        "next_scheduled_wakeup": {
            "sleep_duration_hours": sleep_hours,
            "guidance_for_classifier": guidance
        }
    }

def datetime_now_iso() -> str:
    import datetime
    return datetime.datetime.utcnow().isoformat()
