#!/usr/bin/env python3
"""
Minimal Google-Drive-to-Mosaic trigger.

• Polls one Drive folder (every N seconds)
• Downloads any new video files
• Uploads to Mosaic → runs the specified agent (auto params)
• Saves outputs into ./downloads/

Designed as a concise starter – ~250 LOC.
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time
from pathlib import Path
from typing import List, Optional

import requests
from dotenv import load_dotenv
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseDownload

# ---------- Config ---------- #
load_dotenv()

API_BASE = os.getenv("MOSAIC_API_BASE", "https://api.usemosaic.ai/api")
API_KEY = os.getenv("MOSAIC_API_KEY")
AGENT_ID = os.getenv("MOSAIC_AGENT_ID")
FOLDER_ID = os.getenv("GDRIVE_FOLDER_ID")
SERVICE_ACCOUNT_FILE = os.getenv("GOOGLE_SERVICE_ACCOUNT", "service-account.json")
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "60"))

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"}

# ---------- Helpers ---------- #

def die(msg: str):
    print(f"❌ {msg}")
    sys.exit(1)


def gdrive_service():
    if not Path(SERVICE_ACCOUNT_FILE).exists():
        die(f"Service-account JSON not found: {SERVICE_ACCOUNT_FILE}")
    creds = service_account.Credentials.from_service_account_file(
        SERVICE_ACCOUNT_FILE,
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
    )
    return build("drive", "v3", credentials=creds)


def list_new_videos(svc, folder_id: str, seen: set[str]) -> List[dict]:
    q = f"'{folder_id}' in parents and trashed=false"
    res = (
        svc.files()
        .list(q=q, fields="files(id,name,createdTime,size)")
        .execute()
        .get("files", [])
    )
    vids = [f for f in res if Path(f["name"]).suffix.lower() in VIDEO_EXTS and f["id"] not in seen]
    return vids


def download_file(svc, file_meta: dict, temp_dir: Path) -> Path:
    path = temp_dir / file_meta["name"]
    req = svc.files().get_media(fileId=file_meta["id"])
    with open(path, "wb") as fh:
        dl = MediaIoBaseDownload(fh, req)
        done = False
        while not done:
            _, done = dl.next_chunk()
    return path


def mosaic_post(endpoint: str, **kwargs):
    headers = kwargs.pop("headers", {})
    headers.update({"Authorization": f"Bearer {API_KEY}", "Content-Type": "application/json"})
    return requests.post(f"{API_BASE}{endpoint}", headers=headers, **kwargs)


def mosaic_get(endpoint: str):
    return requests.get(f"{API_BASE}{endpoint}", headers={"Authorization": f"Bearer {API_KEY}"})


def upload_to_mosaic(file_path: Path) -> Optional[str]:
    resp = mosaic_post(
        "/video/get-upload-url",
        json={
            "filename": file_path.name,
            "file_size": file_path.stat().st_size,
            "content_type": "video/mp4",
        },
    )
    if resp.status_code != 200:
        print("Failed get-upload-url", resp.text)
        return None
    data = resp.json()
    with open(file_path, "rb") as fh:
        put = requests.put(data["upload_url"], data=fh, headers={"Content-Type": "video/mp4"})
        if put.status_code not in {200, 204}:
            print("Upload failed", put.status_code)
            return None
    fin = mosaic_post(f"/video/finalize-upload/{data['video_id']}", json={})
    if fin.status_code != 200:
        print("Finalize failed", fin.text)
        return None
    return fin.json()["file_uuid"]


def run_agent(file_uuid: str) -> Optional[str]:
    r = mosaic_post("/run-agent", json={"agent_id": AGENT_ID, "file_id": file_uuid, "auto": True})
    if r.status_code != 200:
        print("run-agent failed", r.text)
        return None
    return r.json()["agent_run_id"]


def poll_until_done(run_id: str, timeout_min: int = 30) -> bool:
    """Poll Mosaic until run succeeds or fails, printing live status."""
    end = time.time() + timeout_min * 60
    poll = 0
    last_status = ""
    while time.time() < end:
        poll += 1
        resp = mosaic_get(f"/get-agent-run-simple/{run_id}")
        if resp.status_code != 200:
            print("status err", resp.text)
            return False
        data = resp.json()
        status = data["status"]
        msg = data.get("status_message") or ""

        # Print whenever status changes or every 5 polls for reassurance
        if status != last_status or poll % 5 == 0:
            print(f"   ↪︎ poll {poll:03d}: {status} {('- ' + msg) if msg else ''}")
            last_status = status

        if status == "success":
            print("✅ run finished")
            return True
        if status == "failed":
            print("❌ run failed")
            return False
        time.sleep(5)
    print("⏰ timeout waiting for run to finish")
    return False


def download_outputs(run_id: str, dest: Path):
    dest.mkdir(parents=True, exist_ok=True)
    r = mosaic_get(f"/get-agent-run-outputs/{run_id}")
    if r.status_code != 200:
        print("outputs fail", r.text)
        return
    for out in r.json().get("outputs", []):
        url = out["download_url"]
        fname = dest / f"{out.get('node_id', 'output')[:8]}.mp4"
        data = requests.get(url).content
        fname.write_bytes(data)
        print("⬇️", fname.name, len(data), "bytes")

# ---------- Main Loop ---------- #

def main():
    if not (API_KEY and AGENT_ID and FOLDER_ID):
        die("Set MOSAIC_API_KEY, MOSAIC_AGENT_ID, GDRIVE_FOLDER_ID env vars")

    parser = argparse.ArgumentParser(description="Google Drive trigger → Mosaic")
    parser.add_argument("--once", action="store_true", help="Run single pass then exit")
    parser.add_argument("--poll", type=int, default=POLL_SECONDS, help="Poll interval seconds")
    args = parser.parse_args()

    svc = gdrive_service()
    seen: set[str] = set()
    print("✅ Authenticated – watching folder", FOLDER_ID)

    while True:
        vids = list_new_videos(svc, FOLDER_ID, seen)
        if vids:
            from tempfile import TemporaryDirectory

            for v in vids:
                print("🎬 New:", v["name"], int(v.get("size", 0)), "bytes")
                with TemporaryDirectory() as tmpdir:
                    local = download_file(svc, v, Path(tmpdir))
                    uuid = upload_to_mosaic(local)
                    if not uuid:
                        continue
                    run_id = run_agent(uuid)
                    if not run_id:
                        continue
                    if poll_until_done(run_id):
                        out_dir = Path("downloads") / Path(v["name"]).stem
                        download_outputs(run_id, out_dir)
                seen.add(v["id"])
        else:
            print("(no new videos)")
        if args.once:
            break
        time.sleep(args.poll)


if __name__ == "__main__":
    main() 