# Google Drive → Mosaic Trigger (Starter)

A compact, dependency-light script that watches a single Google Drive folder and pipes every new video through a Mosaic **Agent**.

* Polls Google Drive every _N_ seconds (default 60)
* Downloads unseen video files
* Uploads to Mosaic (`/video/get-upload-url` → `/finalize-upload`)
* Runs your agent with `auto=true`
* Saves outputs under `./downloads/<video-name>/`

---

## 1 · Prerequisites

| What | Where |
|------|-------|
| Mosaic API key (`mk_…`) | Dashboard → Developer → API Keys |
| Mosaic Agent ID | Dashboard → Agents (copy UUID) |
| Google **Service Account** JSON | Google Cloud Console → IAM & Admin → Service Accounts -> download JSON and save it as `service-account.json`in this folder |

> **Share your Drive folder with the service-account's email** so it can see the files.

Install deps:
```bash
pip install google-api-python-client google-auth requests python-dotenv
```

Create a `.env` file:
```bash
MOSAIC_API_KEY=mk_xxxxxxxxxxxxxxxxx
MOSAIC_AGENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GDRIVE_FOLDER_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
POLL_SECONDS=30
```
Place your `service-account.json` next to the script (or set `GOOGLE_SERVICE_ACCOUNT=path.json`).

---

## 2 · Run
```bash
python gdrive_trigger.py          # loops forever
python gdrive_trigger.py --once   # single pass (useful for cron)
```

Outputs appear in `./downloads/`.

---

## 3 · Copy / Reuse
This folder is self-contained – copy `gdrive_trigger.py`, `README.md`, your `.env` and `service-account.json` into any project and you have an instant Drive → Mosaic integration.

Enjoy! ✨ 