import { openai } from '@ai-sdk/openai';
import { streamText } from 'ai';
import { experimental_createMCPClient as createMCPClient } from 'ai';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const MOSAIC_MCP_BASE = 'https://mcp.usemosaic.ai';
const MOSAIC_API_KEY = process.env.MOSAIC_API_KEY!;

// Custom HTTP transport for MCP
class HttpMCPTransport {
  private url: string;
  private headers: Record<string, string>;
  private messageHandler?: (message: any) => void;
  private errorHandler?: (error: Error) => void;
  private closeHandler?: () => void;

  constructor(config: { url: string; headers?: Record<string, string> }) {
    this.url = config.url;
    this.headers = config.headers || {};
  }

  async start() {
    // HTTP transport doesn't need initialization
  }

  async send(message: any) {
    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.headers,
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      const result = await response.json();
      if (this.messageHandler) {
        this.messageHandler(result);
      }
    } catch (error) {
      if (this.errorHandler) {
        this.errorHandler(error as Error);
      }
    }
  }

  async close() {
    if (this.closeHandler) {
      this.closeHandler();
    }
  }

  set onmessage(handler: (message: any) => void) {
    this.messageHandler = handler;
  }

  set onerror(handler: (error: Error) => void) {
    this.errorHandler = handler;
  }

  set onclose(handler: () => void) {
    this.closeHandler = handler;
  }
}

export async function POST(req: Request) {
  const { messages } = await req.json();

  // Filter out messages with incomplete tool calls to avoid conversion errors
  const filteredMessages = messages.filter((msg: any) => {
    if (msg.role === 'assistant' && msg.toolInvocations) {
      // Only include if all tool invocations have results
      return msg.toolInvocations.every((inv: any) => inv.state === 'result');
    }
    return true;
  });

  try {
    // Create MCP client with official HTTP transport
    const url = new URL(`${MOSAIC_MCP_BASE}/mcp`);
    const mcpClient = await createMCPClient({
      name: 'mosaic-mcp',
      transport: new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers: {
            'Authorization': `Bearer ${MOSAIC_API_KEY}`,
          },
        },
      }),
    });

    // Get tools from MCP server
    const tools = await mcpClient.tools();

    const result = streamText({
      model: openai('gpt-4o'),
      system: `You are an AI assistant that helps users generate React components and edit videos using Mosaic.

IMPORTANT DEMO FLOW:
1. When asked to generate a landing page, create a beautiful React component with Tailwind CSS
2. When asked to upload a video:
   - Extract the video URL from the current page code
   - Use upload_video_from_url tool
   - Respond with: "✅ Video uploaded successfully! What would you like me to do with it?"
3. When asked to add captions:
   - Use create_or_run_agent with prompt: "Add captions to this video"
   - Respond with: "🎬 Processing your video with captions... This may take a couple of minutes. You can check the status anytime!"
4. When asked to check status:
   - Use get_run_status tool
   - If still processing: "⏳ Still processing... X% complete. Check again in a moment!"
   - If complete: 
     - Use get_output_urls to get the new video URL
     - Generate updated landing page code with the new video URL
     - Say: "✅ Video processing complete! I've updated the page with your captioned video."

COMPONENT GENERATION RULES:
- Always wrap code in \`\`\`tsx fences
- The root component MUST export default function Landing() { ... }
- Use Tailwind CSS classes for styling
- For videos use <video controls src="..." className="..." />
- When updating with a new video URL, keep all other page content the same

VIDEO EDITING NOTES:
- You can ONLY upload videos from URLs, not local files
- Always extract the video URL from the current page code
- When processing is complete, ALWAYS update the page with the new video URL`,
      messages: filteredMessages,
      maxSteps: 10,
      tools: await mcpClient.tools(),
      onStepFinish: async (event) => {
        // Log tool calls for debugging
        if (event.toolCalls && event.toolCalls.length > 0) {
          console.log('[Tool Calls]', event.toolCalls.map(tc => ({
            name: tc.toolName,
            args: tc.args
          })));
        }
      },
      onFinish: async () => {
        await mcpClient.close();
      },
    });

    return result.toDataStreamResponse();
  } catch (error) {
    console.error('Error creating MCP client:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to initialize MCP client' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
} 