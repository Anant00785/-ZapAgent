import asyncio
import json
import os
import time
from typing import Dict, Any, List, Callable, Optional
import websockets

from nostr_crypto import generate_keypair, create_nostr_event, get_public_key

class NostrRelayManager:
    def __init__(self, privkey_hex: Optional[str] = None, relays: Optional[List[str]] = None):
        self.privkey_hex = privkey_hex or os.getenv("NOSTR_PRIVATE_KEY")
        if not self.privkey_hex:
            self.privkey_hex, self.pubkey_hex = generate_keypair()
        else:
            self.pubkey_hex = get_public_key(self.privkey_hex)
            
        self.relays = relays or os.getenv(
            "NOSTR_RELAYS",
            "wss://relay.damus.io,wss://nos.lol,wss://relay.primal.net"
        ).split(",")
        
        self.connected_relays: List[str] = []
        self.event_callbacks: List[Callable[[Dict[str, Any]], Any]] = []
        self.is_running = False
        self.live_feed: List[Dict[str, Any]] = []

    def get_agent_identity(self) -> Dict[str, str]:
        return {
            "pubkey_hex": self.pubkey_hex,
            "privkey_hex": self.privkey_hex[:6] + "..." + self.privkey_hex[-6:],
            "npub": f"npub1{self.pubkey_hex[:12]}...",
            "active_relays": self.relays
        }

    def register_event_listener(self, callback: Callable[[Dict[str, Any]], Any]):
        self.event_callbacks.append(callback)

    async def broadcast_event(self, event: Dict[str, Any]) -> List[str]:
        """Broadcast signed event to configured relays."""
        successful_relays = []
        msg = json.dumps(["EVENT", event])
        
        for relay in self.relays:
            try:
                async with websockets.connect(relay.strip(), timeout=3.0) as ws:
                    await ws.send(msg)
                    successful_relays.append(relay)
            except Exception as e:
                pass  # Relay offline/unreachable
        
        self.live_feed.insert(0, {
            "type": "broadcast",
            "event": event,
            "relays": successful_relays,
            "timestamp": int(time.time())
        })
        if len(self.live_feed) > 50:
            self.live_feed.pop()
            
        return successful_relays

    def publish_agent_profile(self, name: str = "ZapAgent", about: str = "Autonomous AI Agent on Bitcoin & Nostr"):
        """Publish NIP-01 metadata (Kind 0)."""
        content = json.dumps({
            "name": name,
            "about": about,
            "nip05": f"{name.lower()}@zapagent.ai",
            "lud16": "zapagent@getalby.com"
        })
        event = create_nostr_event(self.privkey_hex, kind=0, content=content)
        return event

    def create_job_result_event(self, job_event_id: str, requester_pubkey: str, result_content: str) -> Dict[str, Any]:
        """Publish NIP-90 Job Result (Kind 6000)."""
        tags = [
            ["e", job_event_id],
            ["p", requester_pubkey],
            ["status", "success"]
        ]
        return create_nostr_event(self.privkey_hex, kind=6000, content=result_content, tags=tags)
