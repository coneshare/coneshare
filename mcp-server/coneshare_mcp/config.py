import os
import socket
from dataclasses import dataclass


@dataclass
class Settings:
    api_url: str
    mcp_transport: str
    mcp_host: str
    mcp_port: int
    mcp_path: str


def get_settings() -> Settings:
    # Smart default: inside docker use http://backend:8000/api/v1, outside use http://localhost:8000/api/v1
    default_url = "http://backend:8000/api/v1"
    if "CONESHARE_API_URL" not in os.environ:
        try:
            socket.gethostbyname("backend")
        except Exception:
            default_url = "http://localhost:8000/api/v1"

    return Settings(
        api_url=os.getenv("CONESHARE_API_URL", default_url).rstrip("/"),
        mcp_transport=os.getenv("MCP_TRANSPORT", "streamable-http").lower(),
        mcp_host=os.getenv("MCP_HOST", "0.0.0.0"),
        mcp_port=int(os.getenv("MCP_PORT", "8001")),
        mcp_path=os.getenv("MCP_PATH", "/sse"),
    )
