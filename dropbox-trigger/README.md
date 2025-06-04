# Dropbox → Mosaic Trigger (Starter)

A compact, dependency-light script that watches a single Dropbox folder and pipes every new video through a Mosaic **Agent** then re-uploads the result.

* Polls Dropbox every _N_ seconds (default 60)
* Downloads unseen video files
* Uploads to Mosaic (`/video/get-upload-url` → `/finalize-upload`)
* Runs your agent with `auto=true`
* Uploads the resulting video back into the **same Dropbox folder** using the original file name with `-mosaic-output` appended (or `_1`, `_2`, … if multiple outputs)

---

## 1 · Prerequisites

| What | Where |
|------|-------|
| Mosaic API key (`mk_…`) | Dashboard → Developer → API Keys |
| Mosaic Agent ID | Dashboard → Agents (copy UUID) |
| Dropbox **Access Token** | [Dropbox App Console](https://www.dropbox.com/developers/apps) → Generate access token |

> The token **must** be full access (not app-specific) to have access to your entire Dropbox account. Make sure it has `files.content.read`, `files.content.write`, `files.metadata.read`, and `files.metadata.write`.

Install deps:
```bash
pip install dropbox requests python-dotenv
```

Create a `.env` file:
```bash
MOSAIC_API_KEY=mk_xxxxxxxxxxxxxxxxx
MOSAIC_AGENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
DROPBOX_ACCESS_TOKEN=sl.ABxxxYYY
# Optional tweaks
DROPBOX_FOLDER=/Videos      # folder to watch, default is root
POLL_SECONDS=30             # polling interval
```

---

## 2 · Run
```bash
python dropbox_trigger.py          # loops forever
python dropbox_trigger.py --once   # single pass (useful for cron)
```

Outputs appear in the same Dropbox folder as `video-mosaic-output.mp4` (or `video-mosaic-output_1.mp4` if the agent produced multiple outputs).

---

## 3 · Copy / Reuse
This folder is self-contained – copy `dropbox_trigger.py`, `README.md`, your `.env` into any project and you have an instant Dropbox → Mosaic integration.

Happy automating! ✨ 