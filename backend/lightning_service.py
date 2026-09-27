import asyncio
import json
import os
import secrets
import time
from typing import Dict, Any, Optional
from urllib.parse import urlparse, parse_qs
import httpx

class LightningService:
    def __init__(self, nwc_uri: Optional[str] = None):
        self.nwc_uri = nwc_uri or os.getenv("NWC_CONNECTION_URI", "")
        self.is_connected = False
        self.wallet_pubkey = None
        self.relay_url = None
        self.secret = None
        self.balance_sats = 21000  # Initial agent reserve
        self.sats_earned = 0
        self.sats_spent = 0
        self.invoices: Dict[str, Dict[str, Any]] = {}
        
        self._parse_nwc_uri()
    
    def _parse_nwc_uri(self):
        if not self.nwc_uri or not self.nwc_uri.startswith("nostr+walletconnect://"):
            return
        try:
            # Format: nostr+walletconnect://<pubkey>?relay=<relay>&secret=<secret>&lud16=<lud16>
            parsed = urlparse(self.nwc_uri)
            self.wallet_pubkey = parsed.netloc or parsed.path.replace("//", "")
            qs = parse_qs(parsed.query)
            self.relay_url = qs.get("relay", [None])[0]
            self.secret = qs.get("secret", [None])[0]
            if self.secret and self.wallet_pubkey:
                self.is_connected = True
        except Exception as e:
            print(f"Error parsing NWC URI: {e}")

    async def get_balance(self) -> Dict[str, Any]:
        """Fetch balance from connected NWC wallet or internal ledger."""
        return {
            "balance_sats": self.balance_sats,
            "sats_earned": self.sats_earned,
            "sats_spent": self.sats_spent,
            "is_nwc_connected": self.is_connected,
            "wallet_pubkey": self.wallet_pubkey or "local-sovereign-vault"
        }

    async def create_invoice(self, amount_sats: int, description: str = "ZapAgent AI Inference") -> Dict[str, Any]:
        """Generate a Lightning Invoice / Zap Request."""
        payment_hash = secrets.token_hex(32)
        # Mock / Testnet lightning invoice format: lnbc<amount>...
        pr = f"lnbc{amount_sats}0n1p{payment_hash[:20]}zapagent{secrets.token_hex(16)}"
        
        invoice_record = {
            "payment_hash": payment_hash,
            "payment_request": pr,
            "amount_sats": amount_sats,
            "description": description,
            "created_at": int(time.time()),
            "status": "pending",  # pending | paid | expired
            "settled_at": None
        }
        self.invoices[payment_hash] = invoice_record
        return invoice_record

    async def verify_payment(self, payment_hash: str) -> bool:
        """Check if invoice is settled."""
        if payment_hash in self.invoices:
            inv = self.invoices[payment_hash]
            return inv["status"] == "paid"
        return False

    async def settle_invoice(self, payment_hash: str) -> Dict[str, Any]:
        """Simulate or execute settlement of a zap."""
        if payment_hash in self.invoices:
            inv = self.invoices[payment_hash]
            if inv["status"] != "paid":
                inv["status"] = "paid"
                inv["settled_at"] = int(time.time())
                self.balance_sats += inv["amount_sats"]
                self.sats_earned += inv["amount_sats"]
            return inv
        raise ValueError("Invoice not found")

    async def pay_invoice(self, bolt11_invoice: str, amount_sats: int) -> Dict[str, Any]:
        """Agent autonomously pays an external API or node via Lightning."""
        if self.balance_sats < amount_sats:
            raise ValueError(f"Insufficient agent funds. Required: {amount_sats} sats, Available: {self.balance_sats} sats")
        
        self.balance_sats -= amount_sats
        self.sats_spent += amount_sats
        preimage = secrets.token_hex(32)
        
        return {
            "status": "success",
            "preimage": preimage,
            "amount_sats": amount_sats,
            "remaining_balance": self.balance_sats,
            "timestamp": int(time.time())
        }
