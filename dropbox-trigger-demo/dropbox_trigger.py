#!/usr/bin/env python3
"""
Minimal Dropbox-to-Mosaic trigger.

• Polls one Dropbox folder (every N seconds)
• Downloads any new video files
• Uploads to Mosaic → runs the specified agent (auto params)
• Uploads the resulting video back to the same Dropbox folder with "-mosaic-output" appended to the file name

Designed as a concise starter – ~260 LOC.
"""

from __future__ import annotations

import argparse
import io
import os
import sys
import time
from pathlib import Path, PurePosixPath
from tempfile import TemporaryDirectory
from typing import List, Optional, Set

import requests
from dotenv import load_dotenv

try:
    import dropbox
    from dropbox.files import FileMetadata, WriteMode
except ImportError as err:  # pragma: no cover
    print("❌ dropbox package missing – install with `pip install dropbox`.")
    raise

# ---------- Config ---------- #
load_dotenv()

API_BASE = os.getenv("MOSAIC_API_BASE", "https://api.usemosaic.ai/api")
API_KEY = os.getenv("MOSAIC_API_KEY")
AGENT_ID = os.getenv("MOSAIC_AGENT_ID")
DROPBOX_TOKEN = os.getenv("DROPBOX_ACCESS_TOKEN")
DROPBOX_FOLDER = os.getenv("DROPBOX_FOLDER", "/")  # e.g. "/Videos"
POLL_SECONDS = int(os.getenv("POLL_SECONDS", "60"))

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".m4v", ".wmv", ".flv"}

# ---------- Helpers ---------- #

def die(msg: str):
    print(f"❌ {msg}")
    sys.exit(1)


def dbx_service() -> dropbox.Dropbox:
    if not DROPBOX_TOKEN:
        die("Set DROPBOX_ACCESS_TOKEN in your .env file")
    return dropbox.Dropbox(DROPBOX_TOKEN, timeout=None)


def list_new_videos(dbx: dropbox.Dropbox, folder: str, seen: Set[str]) -> List[FileMetadata]:
    """Return list of FileMetadata objects that are new video files."""
    try:
        result = dbx.files_list_folder(folder, recursive=False)
    except dropbox.exceptions.ApiError as e:
        die(f"Dropbox API error listing folder: {e}")

    videos: List[FileMetadata] = []
    while True:
        for entry in result.entries:
            if isinstance(entry, FileMetadata):
                if entry.id not in seen and Path(entry.name).suffix.lower() in VIDEO_EXTS and "-mosaic-output" not in Path(entry.name).stem.lower():
                    videos.append(entry)
        if result.has_more:
            result = dbx.files_list_folder_continue(result.cursor)
        else:
            break
    return videos


def download_file(dbx: dropbox.Dropbox, meta: FileMetadata, temp_dir: Path) -> Path:
    local = temp_dir / meta.name
    with open(local, "wb") as fh:
        try:
            md, res = dbx.files_download(meta.path_lower)
        except dropbox.exceptions.HttpError as e:
            die(f"Download error: {e}")
        fh.write(res.content)
    return local


# ---------- Mosaic helpers (copied from gdrive_trigger) ---------- #

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

        # Print whenever status changes or every 5 polls
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


def upload_outputs_to_dropbox(dbx: dropbox.Dropbox, outputs: list[dict], original_meta: FileMetadata):
    orig_path = PurePosixPath(original_meta.path_lower)
    dest_stem = orig_path.stem + "-mosaic-output"
    for idx, out in enumerate(outputs):
        url = out["download_url"]
        # Single output: keep extension .mp4, multiple outputs: append _n
        suffix = ".mp4"
        name = dest_stem + ("" if len(outputs) == 1 else f"_{idx+1}") + suffix
        dest_path = str(orig_path.with_name(name))
        data = requests.get(url)
        if data.status_code != 200:
            print("Failed downloading output", data.status_code)
            continue
        try:
            dbx.files_upload(data.content, dest_path, mode=WriteMode.overwrite)
            print("⬆️  Uploaded", dest_path, len(data.content), "bytes")
        except dropbox.exceptions.ApiError as e:
            print("Dropbox upload error", e)


# ---------- Main Loop ---------- #

def main():
    if not (API_KEY and AGENT_ID and DROPBOX_TOKEN):
        die("Set MOSAIC_API_KEY, MOSAIC_AGENT_ID, DROPBOX_ACCESS_TOKEN env vars")

    parser = argparse.ArgumentParser(description="Dropbox trigger → Mosaic")
    parser.add_argument("--once", action="store_true", help="Run single pass then exit")
    parser.add_argument("--poll", type=int, default=POLL_SECONDS, help="Poll interval seconds")
    args = parser.parse_args()

    dbx = dbx_service()
    print(dbx.files_list_folder("").entries)
    try:
        account = dbx.users_get_current_account()
        print("✅ Authenticated as", account.name.display_name)
    except Exception as e:
        die(f"Dropbox auth failed: {e}")

    print("📂 Watching folder", DROPBOX_FOLDER)

    seen: Set[str] = set()

    # Pre-populate with existing videos so we only process NEW ones
    try:
        preload = list_new_videos(dbx, DROPBOX_FOLDER, set())
        for m in preload:
            seen.add(m.id)
        if preload:
            print(f"➖ Ignoring {len(preload)} existing video(s) already in the folder")
    except Exception:
        pass

    while True:
        videos = list_new_videos(dbx, DROPBOX_FOLDER, seen)
        if videos:
            for meta in videos:
                print("🎬 New:", meta.name, meta.size, "bytes")
                with TemporaryDirectory() as tmpdir:
                    local = download_file(dbx, meta, Path(tmpdir))
                    uuid = upload_to_mosaic(local)
                    if not uuid:
                        continue
                    run_id = run_agent(uuid)
                    if not run_id:
                        continue
                    if poll_until_done(run_id):
                        outs_resp = mosaic_get(f"/get-agent-run-outputs/{run_id}")
                        if outs_resp.status_code == 200:
                            outputs = outs_resp.json().get("outputs", [])
                            upload_outputs_to_dropbox(dbx, outputs, meta)
                seen.add(meta.id)
        else:
            print("(no new videos)")
        if args.once:
            break
        time.sleep(args.poll)


if __name__ == "__main__":
    main() 