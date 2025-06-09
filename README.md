# Mosaic API Examples

example apps built with the mosaic api ([docs.usemosaic.ai](https://docs.usemosaic.ai))

## [gdrive-trigger](https://github.com/mosaic-ai-labs/api-examples/tree/main/gdrive-trigger)

A compact, dependency-light script that watches a single Google Drive folder and pipes every new video through a Mosaic **Agent**.

## [dropbox-trigger](https://github.com/mosaic-ai-labs/api-examples/tree/main/dropbox-trigger)

A script that watches a Dropbox folder, runs a Mosaic Agent on new videos and posts results back to the same folder.

## [mosaic-mcp](https://github.com/mosaic-ai-labs/api-examples/tree/main/mosaic-mcp)

A lightweight [FastMCP](https://gofastmcp.com) wrapper around the Mosaic video-editing API.
It exposes convenient tools so LLMs (Claude, Cursor etc.) can upload
videos, run Mosaic agents, poll status, download outputs, and discover the
available agents – all without hard-coding HTTP details in the prompt.
Includes uploading local files, listing and running agents, polling agent
status, and downloading outputs!

Try it out by adding the following to your Claude Desktop config:

```jsonc
{
  "mcpServers": {
    "mosaic-api": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "http://mcp.usemosaic.ai/mcp"
      ],
      "headers": {
        "Authorization": "Bearer mk_..."
      }
    }
  }
}
```

## [create-shorts-post-to-socials](https://github.com/mosaic-ai-labs/api-examples/tree/main/create-shorts-post-to-socials)

A web app that connects to Google Drive & Dropbox, processes videos through Mosaic to create social media shorts, and outputs the results.
Adding support for directly posting to social media platforms is on the roadmap and will be added within the next few weeks.


## [vercel-ai-sdk-example](https://github.com/mosaic-ai-labs/api-examples/tree/main/vercel-ai-sdk-example)

A demo showcasing the [Vercel AI SDK](https://ai-sdk.dev/)'s code generation capabilities combined with Mosaic's AI-powered video editing in the same app.