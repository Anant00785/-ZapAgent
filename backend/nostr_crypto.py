import hashlib
import hmac
import json
import secrets
import time
from typing import Dict, Any, List, Optional

# Curve parameters for secp256k1
_P = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEFFFFFC2F
_N = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141
_G_x = 0x79BE667EF9DCBBAC55A06295CE870B07029BFCDB2DCE28D959F2815B16F81798
_G_y = 0x483ADA7726A3C4655DA4FBFC0E1108A8FD17B448A68554199C47D08FFB10D4B8
_G = (_G_x, _G_y)

def _point_add(p1, p2):
    if p1 is None:
        return p2
    if p2 is None:
        return p1
    x1, y1 = p1
    x2, y2 = p2
    if x1 == x2 and y1 != y2:
        return None
    if x1 == x2:
        m = (3 * x1 * x1 * pow(2 * y1, _P - 2, _P)) % _P
    else:
        m = ((y2 - y1) * pow(x2 - x1, _P - 2, _P)) % _P
    x3 = (m * m - x1 - x2) % _P
    y3 = (m * (x1 - x3) - y1) % _P
    return (x3, y3)

def _point_mul(p, n):
    r = None
    m2 = p
    while n > 0:
        if n & 1:
            r = _point_add(r, m2)
        n >>= 1
        m2 = _point_add(m2, m2)
    return r

def generate_keypair() -> tuple[str, str]:
    """Generate a valid (private_key_hex, public_key_hex) pair for Nostr."""
    privkey_int = secrets.randbelow(_N - 1) + 1
    privkey_hex = format(privkey_int, '064x')
    pub_point = _point_mul(_G, privkey_int)
    pubkey_hex = format(pub_point[0], '064x')
    return privkey_hex, pubkey_hex

def get_public_key(privkey_hex: str) -> str:
    """Derive 32-byte schnorr x-only public key from 32-byte private key."""
    privkey_int = int(privkey_hex, 16)
    pub_point = _point_mul(_G, privkey_int)
    return format(pub_point[0], '064x')

def schnorr_sign(msg_hash_bytes: bytes, privkey_hex: str) -> str:
    """BIP-340 Schnorr signature implementation for Nostr events."""
    privkey_int = int(privkey_hex, 16)
    P = _point_mul(_G, privkey_int)
    
    # If P.y is odd, negate private key
    d = privkey_int if P[1] % 2 == 0 else _N - privkey_int
    
    # Synthetic nonce generation (RFC 6979 / BIP-340)
    t = d.to_bytes(32, 'big')
    rand_bytes = secrets.token_bytes(32)
    k0 = int.from_bytes(hashlib.sha256(t + rand_bytes + msg_hash_bytes).digest(), 'big') % _N
    if k0 == 0:
        k0 = 1
    
    R = _point_mul(_G, k0)
    k = k0 if R[1] % 2 == 0 else _N - k0
    
    rx_bytes = R[0].to_bytes(32, 'big')
    px_bytes = P[0].to_bytes(32, 'big')
    
    e_hash = hashlib.sha256(rx_bytes + px_bytes + msg_hash_bytes).digest()
    e = int.from_bytes(e_hash, 'big') % _N
    
    s = (k + e * d) % _N
    sig_bytes = rx_bytes + s.to_bytes(32, 'big')
    return sig_bytes.hex()

def create_nostr_event(
    privkey_hex: str,
    kind: int,
    content: str,
    tags: Optional[List[List[str]]] = None
) -> Dict[str, Any]:
    """Create and sign a standard Nostr event (NIP-01 / NIP-90)."""
    pubkey = get_public_key(privkey_hex)
    created_at = int(time.time())
    tags = tags or []
    
    # Serialize event for ID calculation: [0, pubkey, created_at, kind, tags, content]
    serialized = json.dumps(
        [0, pubkey, created_at, kind, tags, content],
        separators=(',', ':'),
        ensure_ascii=False
    )
    event_id = hashlib.sha256(serialized.encode('utf-8')).hexdigest()
    sig = schnorr_sign(bytes.fromhex(event_id), privkey_hex)
    
    return {
        "id": event_id,
        "pubkey": pubkey,
        "created_at": created_at,
        "kind": kind,
        "tags": tags,
        "content": content,
        "sig": sig
    }
