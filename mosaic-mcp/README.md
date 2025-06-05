# Mosaic MCP Server

A lightweight [FastMCP](https://gofastmcp.com) wrapper around the Mosaic video-editing API.
It exposes convenient MCP tools so LLMs (Claude, Cursor etc.) can upload
videos, run Mosaic agents, poll status, download outputs, and discover the
available agents – all without hard-coding HTTP details in the prompt.

> [!NOTE]
> THIS IS THE MCP SERVER; TO USE THE CLIENT READ [THIS SECTION](https://github.com/mosaic-ai-labs/api-examples/blob/main/mosaic-mcp/README.md#4-claude-desktop-configuration)

---

## 1 · Prerequisites

* Python **3.12**
* [`uv`](https://github.com/astral-sh/uv) package manager (`pip install uv`)
* A Mosaic **API key** (`mk_…`)

---

## 2 · Install & configure

```bash
# Inside the repo root
cd mosaic-mcp

# 1. Create .venv
uv venv --python 3.12

# 2. Install dependencies
uv sync

# 3. Add your Mosaic key
echo "MOSAIC_API_KEY=mk_live_xxxxxxxxx" > .env
```

(Optional) tweak the 5 GiB upload limit via `MAX_FILE_BYTES` in `.env`.

---

## 3 · Running the server

```bash
fastmcp run mosaic-mcp/main.py:mcp \
  --transport streamable-http \
  --host localhost \
  --port 8080
```

---

## 4 · Claude Desktop configuration

```jsonc
{
  "mcpServers": {
    "mosaic-api": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://localhost:8080/mcp"
      ],
      "headers": {
        "Authorization": "Bearer mk_..."
      }
    }
  }
}
```


---

## 5 · Available tools

| Tool | Arguments | Description |
|------|-----------|-------------|
| `upload_video_from_local_file` | `file` (absolute path), `filename?` | Upload a local video and return `file_id` |
| `upload_video_from_url` | `url` | Fetch video from URL → Mosaic |
| `create_or_run_agent` | `file_id`, **either** `agent` *or* `prompt`, `auto?`, `parameters?` | Run an existing agent **or** generate one on-the-fly from a natural-language prompt |
| `get_run_status` | `run_id` | Poll status & progress |
| `get_output_urls` | `run_id` | Signed download URLs |
| `list_agents` | — | List agent names, UUIDs, descriptions |

Agents are editable in `main.py` (`AGENTS` dict).

---

## 6 · Updating agents
Open `mosaic-mcp/main.py`, edit the `AGENTS` dictionary with your own UUIDs
and friendly names. Restart the server – `list_agents` will reflect the
changes immediately.

---

Happy automating! 🎬
