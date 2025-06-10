# Vercel AI SDK + Mosaic Video Editing Demo

A powerful demo showcasing the [Vercel AI SDK](https://ai-sdk.dev/)'s code generation capabilities combined with Mosaic's AI-powered video editing, all in one seamless experience.

## Setup

1. Clone the repository
2. Navigate to the project directory:
   ```bash
   cd vercel-ai-sdk-example
   ```

3. Install dependencies:
   ```bash
   pnpm install
   ```

4. Create a `.env.local` (you can use `.env.example` as a template) file with your API keys:
   ```env
   OPENAI_API_KEY=sk-...your-openai-key...
   MOSAIC_API_KEY=mk_...your-mosaic-key...
   ```

5. Run the development server:
   ```bash
   pnpm dev
   ```

6. Open [http://localhost:3000](http://localhost:3000) and click through the demo!

## Deploy to Railway

This project includes a `railway.toml` configuration for easy deployment:

1. Connect your GitHub repo to Railway
2. Set the following environment variables in the Railway dashboard:
   - `OPENAI_API_KEY`: Your OpenAI API key
   - `MOSAIC_API_KEY`: Your Mosaic API key  
3. Deploy! Railway will automatically:
   - Use Node.js 18 and pnpm
   - Build with `pnpm build`
   - Start with `pnpm start`
   - Configure health checks and restart policies

## Technical Implementation

### MCP Integration
- Uses Vercel AI SDK's native `experimental_createMCPClient` for seamless MCP server connection
- Connects to Mosaic's MCP server at `https://mcp.usemosaic.ai` using StreamableHTTPClientTransport
- Automatically discovers and exposes all Mosaic tools (upload_video_from_url, create_or_run_agent, etc.)
- Handles authentication via Bearer token in headers

### Code Generation
- GPT-4o generates TSX code that's compiled in-browser using Babel
- Live preview updates in real-time as code is generated
- Supports full React components with Tailwind CSS styling

### UI Features
- Tool execution indicators show when MCP tools are being called
- Button-driven interface eliminates typing
- State machine tracks progress through the demo flow
- Error handling with retry functionality

## Project Structure

```
vercel-ai-sdk-example/
├── app/
│   ├── api/
│   │   └── chat/
│   │       └── route.ts    # API endpoint with MCP integration
│   ├── page.tsx            # Main page with button flow logic
│   ├── layout.tsx          # Root layout
│   └── globals.css         # Global styles
├── components/
│   ├── Chat.tsx            # Chat interface with buttons
│   └── Preview.tsx         # Live code preview component
├── package.json
└── README.md
```