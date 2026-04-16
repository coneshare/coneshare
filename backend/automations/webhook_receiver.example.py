'''
pip install flask
export CONESHARE_SIGNING_SECRET='supersecret'   # optional for local testing
python coneshare_webhook_receiver.py
'''

import hashlib
import hmac
import json
import os

from flask import Flask, request, jsonify

app = Flask(__name__)

# Set this to the same value as AutomationDestination.signing_secret
SIGNING_SECRET = os.getenv("CONESHARE_SIGNING_SECRET", "")


def verify_signature(raw_body: bytes, signature_header: str, secret: str) -> bool:
    if not secret:
        return True  # allow unsigned mode for local testing
    if not signature_header or not signature_header.startswith("sha256="):
        return False

    received = signature_header.split("=", 1)[1]
    payload = json.loads(raw_body.decode("utf-8"))
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":")).encode("utf-8")
    expected = hmac.new(secret.encode("utf-8"), canonical, hashlib.sha256).hexdigest()
    return hmac.compare_digest(received, expected)


@app.post("/webhooks/coneshare")
def coneshare_webhook():
    raw = request.get_data()
    sig = request.headers.get("X-Coneshare-Signature", "")
    idem = request.headers.get("X-Coneshare-Idempotency-Key", "")

    if not verify_signature(raw, sig, SIGNING_SECRET):
        return jsonify({"ok": False, "error": "invalid signature"}), 401

    payload = request.get_json(silent=True) or {}
    print("idempotency_key:", idem)
    print("event payload:", json.dumps(payload, indent=2))

    # TODO: send to your CRM/queue/etc.
    return jsonify({"ok": True}), 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8123, debug=True)
