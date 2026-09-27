import asyncio
import json
import os
import time
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

from nostr_crypto import generate_keypair
from nostr_manager import NostrRelayManager
from lightning_service import LightningService
from ai_engine import ZapAIEngine

app = FastAPI(title="ZapAgent Sovereign AI Node", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Core subsystems
nostr_manager = NostrRelayManager()
lightning_service = LightningService()
ai_engine = ZapAIEngine()

# WebSocket active connection manager
class ConnectionManager:
    def __init__(self):
        self.active_connections: List[WebSocket] = []

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.append(websocket)

    def disconnect(self, websocket: WebSocket):
        if websocket in self.active_connections:
            self.active_connections.remove(websocket)

    async def broadcast(self, message: Dict[str, Any]):
        for connection in self.active_connections:
            try:
                await connection.send_json(message)
            except Exception:
                pass

ws_manager = ConnectionManager()

# Request schemas
class TaskRequest(BaseModel):
    prompt: str
    task_type: Optional[str] = "general"
    require_sats: Optional[bool] = True
    amount_sats: Optional[int] = 21

class SettleInvoiceRequest(BaseModel):
    payment_hash: str

class PayInvoiceRequest(BaseModel):
    invoice: str
    amount_sats: int

@app.get("/api/status")
async def get_status():
    balance_info = await lightning_service.get_balance()
    identity_info = nostr_manager.get_agent_identity()
    return {
        "status": "online",
        "agent_name": os.getenv("AGENT_NAME", "ZapAgent"),
        "ai_model": "Gemini-1.5-Flash",
        "identity": identity_info,
        "wallet": balance_info,
        "relays": nostr_manager.relays,
        "timestamp": int(time.time())
    }

@app.post("/api/task/execute")
async def execute_task(req: TaskRequest):
    # Step 1: Create Invoice
    invoice = await lightning_service.create_invoice(
        amount_sats=req.amount_sats,
        description=f"ZapAgent Task: {req.prompt[:40]}"
    )
    
    # Broadcast telemetry
    await ws_manager.broadcast({
        "type": "job_created",
        "prompt": req.prompt,
        "invoice": invoice
    })
    
    # Step 2: Run AI Engine
    ai_result = await ai_engine.execute_task(req.prompt, req.task_type)
    
    # Step 3: Broadcast Result to Nostr Relays (NIP-90 style)
    nostr_event = nostr_manager.create_job_result_event(
        job_event_id=invoice["payment_hash"],
        requester_pubkey="user-client",
        result_content=ai_result["result"]
    )
    
    # Auto-settle for seamless demo flow
    await lightning_service.settle_invoice(invoice["payment_hash"])
    
    relays_hit = await nostr_manager.broadcast_event(nostr_event)
    
    telemetry = {
        "type": "job_completed",
        "prompt": req.prompt,
        "invoice": invoice,
        "ai_result": ai_result,
        "nostr_event": nostr_event,
        "relays_hit": relays_hit,
        "timestamp": int(time.time())
    }
    
    await ws_manager.broadcast(telemetry)
    return telemetry

@app.post("/api/lightning/invoice")
async def create_invoice(amount_sats: int = 21, description: str = "ZapAgent Tip"):
    inv = await lightning_service.create_invoice(amount_sats, description)
    return inv

@app.post("/api/lightning/settle")
async def settle_invoice(req: SettleInvoiceRequest):
    try:
        inv = await lightning_service.settle_invoice(req.payment_hash)
        await ws_manager.broadcast({"type": "zap_received", "invoice": inv})
        return {"status": "settled", "invoice": inv}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/lightning/pay")
async def agent_pay_invoice(req: PayInvoiceRequest):
    try:
        payment = await lightning_service.pay_invoice(req.invoice, req.amount_sats)
        await ws_manager.broadcast({"type": "agent_payment_disbursed", "payment": payment})
        return payment
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/feed")
async def get_live_feed():
    return {"feed": nostr_manager.live_feed}

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            data = await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
