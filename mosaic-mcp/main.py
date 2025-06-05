#!/usr/bin/env python3
"""Mosaic MCP Server – exposes Mosaic video-processing capabilities to LLMs.

Start with:
    uv add fastmcp httpx python-dotenv python-magic-bin
    uv run mosaic-mcp/main.py

The server exposes a handful of `@tool`s – check OpenAPI at /docs once running.
"""

import asyncio
import mimetypes
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import httpx
from dotenv import load_dotenv
from fastmcp import FastMCP
from fastmcp.exceptions import ToolError
from pydantic import Field

# ---------------------------------------------------------------------------
# Config & constants
# ---------------------------------------------------------------------------

load_dotenv()

API_KEY = os.getenv("MOSAIC_API_KEY")
if not API_KEY:
    raise RuntimeError("Set MOSAIC_API_KEY env var before running the server.")

BASE_URL = os.getenv("MOSAIC_BASE_URL", "https://api.usemosaic.ai/api")
MAX_BYTES = int(os.getenv("MAX_FILE_BYTES", str(5 * 1024 * 1024 * 1024)))  # 5 GiB default

AGENTS: Dict[str, Dict[str, str]] = {
    # Example – replace UUIDs + description as you wish.
    "audio_enhance_remove_all_except_speech": {
        "id": "cbc580d3-8409-4bf8-b3b3-e9fe4a01ee5b",
        "description": "AI-powered audio enhancement; removes all noise except speech.",
    },
    "remove_bad_takes": {
        "id": "b94b296d-7bd8-4d60-851d-ff821c0c9a9d",
        "description": "Removes all bad takes from a video, leaving only the best takes.",
    },
    "add_captions": {
        "id": "b4e07fca-c963-4f0d-9d53-e979d1f026ee",
        "description": "Adds captions to a video.",
    },
}

mcp = FastMCP("Mosaic API Wrapper")

# Single shared client – httpx is async-safe.
_client: Optional[httpx.AsyncClient] = None


async def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=httpx.Timeout(300))  # 5-min default
    return _client


# ---------------------------------------------------------------------------
# Helper functions – Mosaic REST calls
# ---------------------------------------------------------------------------

async def _mosaic_post(path: str, **kwargs) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    headers.setdefault("Authorization", f"Bearer {API_KEY}")
    headers.setdefault("Content-Type", "application/json")
    http = await client()
    return await http.post(f"{BASE_URL}{path}", headers=headers, **kwargs)


async def _mosaic_get(path: str, **kwargs) -> httpx.Response:
    headers = kwargs.pop("headers", {})
    headers.setdefault("Authorization", f"Bearer {API_KEY}")
    http = await client()
    return await http.get(f"{BASE_URL}{path}", headers=headers, **kwargs)


async def _iter_file(path: Path, chunk_size: int = 1024 * 1024):
    """Async generator streaming file bytes so httpx AsyncClient can upload without sync error."""
    loop = asyncio.get_event_loop()
    with path.open("rb") as f:
        while True:
            chunk = await loop.run_in_executor(None, f.read, chunk_size)
            if not chunk:
                break
            yield chunk


async def _upload_to_mosaic(file_path: Path, filename: str, content_type: str) -> str:
    size = file_path.stat().st_size
    if size > MAX_BYTES:
        raise ToolError(f"File too large – {size} bytes > {MAX_BYTES} max.")

    # 1. get signed URL
    resp = await _mosaic_post(
        "/video/get-upload-url",
        json={
            "filename": filename,
            "file_size": size,
            "content_type": content_type,
        },
    )
    if resp.status_code != 200:
        raise ToolError(f"Mosaic upload-url error: {resp.text}")
    data = resp.json()

    # 2. PUT bytes to signed URL (stream from disk)
    http = await client()
    put_resp = await http.put(
        data["upload_url"],
        content=_iter_file(file_path),
        headers={"Content-Type": content_type},
    )
    if put_resp.status_code not in {200, 204}:
        raise ToolError(f"Upload failed ({put_resp.status_code}) – {put_resp.text}")

    # 3. finalize upload
    fin = await _mosaic_post(f"/video/finalize-upload/{data['video_id']}", json={})
    if fin.status_code != 200:
        raise ToolError(f"Finalize failed: {fin.text}")
    return fin.json()["file_uuid"]


# ---------------------------------------------------------------------------
# FastMCP Tools
# ---------------------------------------------------------------------------

@mcp.tool("upload_video_from_local_file")
async def upload_video(
    file: Union[bytes, str] = Field(..., description="Raw bytes OR absolute file path to the video"),
    filename: Optional[str] = Field(None, description="File name (auto-derived when path provided)"),
) -> str:
    """Accepts raw bytes **or** a local file path, uploads to Mosaic, returns `file_id`."""

    # Handle if caller passed a path string
    if isinstance(file, str):
        path = Path(file)
        if not path.exists() or not path.is_file():
            raise ToolError(f"File path not found: {file}")
        if filename is None:
            filename = path.name
        content_type = mimetypes.guess_type(filename)[0] or "video/mp4"
        return await _upload_to_mosaic(path, filename, content_type)

    # Otherwise we expect raw bytes
    if len(file) < 1024:  # Mosaic minimum 1 KiB
        raise ToolError("File too small – Mosaic requires at least 1 KiB of data")
    if len(file) > MAX_BYTES:
        raise ToolError(f"File too large – {len(file)} bytes > {MAX_BYTES} max.")

    if filename is None:
        raise ToolError("filename parameter required when passing raw bytes")

    suffix = Path(filename).suffix
    content_type = mimetypes.guess_type(filename)[0] or "video/mp4"

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(file)
        tmp_path = Path(tmp.name)

    try:
        return await _upload_to_mosaic(tmp_path, filename, content_type)
    finally:
        tmp_path.unlink(missing_ok=True)


@mcp.tool("upload_video_from_url")
async def upload_video_from_url(url: str) -> str:
    filename = Path(url).name or "video.mp4"
    content_type = mimetypes.guess_type(filename)[0] or "video/mp4"

    http = await client()
    async with http.stream("GET", url) as resp:
        if resp.status_code != 200:
            raise ToolError(f"Download error {resp.status_code}: {url}")
        total = int(resp.headers.get("Content-Length", 0)) or None
        if total and total > MAX_BYTES:
            raise ToolError("File too large to download/upload (Content-Length header)")

        with tempfile.NamedTemporaryFile(delete=False, suffix=Path(filename).suffix) as tmp:
            async for chunk in resp.aiter_bytes():
                tmp.write(chunk)
            tmp_path = Path(tmp.name)

    # Size check after download too
    if tmp_path.stat().st_size > MAX_BYTES:
        tmp_path.unlink(missing_ok=True)
        raise ToolError("File exceeds 5 GiB limit after download")

    try:
        return await _upload_to_mosaic(tmp_path, filename, content_type)
    finally:
        tmp_path.unlink(missing_ok=True)


@mcp.tool("create_or_run_agent")
async def create_or_run_agent(
    file_id: str,
    agent: Optional[str] = None,
    prompt: Optional[str] = None,
    auto: bool = True,
    parameters: Optional[Dict[str, Any]] = None,
) -> str:
    """Kick off Mosaic processing.

    Either:
    • pass `agent` (name key or UUID) to run a pre-existing agent, **OR**
    • pass a free-text `prompt` which lets Mosaic build an agent on the fly.
    These two options are mutually exclusive.
    """

    if bool(agent) == bool(prompt):  # both empty or both filled
        raise ToolError("Provide exactly one of 'agent' (existing) OR 'prompt' (LLM autogen)")

    payload: Dict[str, Any] = {"file_id": file_id, "auto": auto}

    if agent:
        payload["agent_id"] = AGENTS.get(agent, {}).get("id", agent)
    else:
        payload["agent_id"] = None  # Must be explicitly null when using prompt
        payload["prompt"] = prompt

    if parameters:
        payload["parameters"] = parameters

    resp = await _mosaic_post("/run-agent", json=payload)
    if resp.status_code != 200:
        raise ToolError(f"run-agent failed: {resp.text}")
    return resp.json()["agent_run_id"]


@mcp.tool("get_run_status")
async def get_run_status(run_id: str) -> Dict[str, Any]:
    resp = await _mosaic_get(f"/get-agent-run-simple/{run_id}")
    if resp.status_code != 200:
        raise ToolError(resp.text)
    data = resp.json()
    return {"status": data.get("status"), "progress": data.get("progress")}


@mcp.tool("get_output_urls")
async def get_output_urls(run_id: str) -> List[str]:
    resp = await _mosaic_get(f"/get-agent-run-outputs/{run_id}")
    if resp.status_code != 200:
        raise ToolError(resp.text)
    outs = resp.json().get("outputs", [])
    return [o["download_url"] for o in outs]


@mcp.tool("list_agents")
async def list_agents() -> List[Dict[str, str]]:
    """Returns an array of {name,id,description} objects so the LLM can decide which agent to run."""
    return [
        {"name": key, "id": meta["id"], "description": meta["description"]}
        for key, meta in AGENTS.items()
    ]


# ---------------------------------------------------------------------------
# Entry-point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    # By default FastMCP uses STDIO transport which ignores host/port.
    # Call without extra kwargs; use CLI for http/sse transports.
    mcp.run()
