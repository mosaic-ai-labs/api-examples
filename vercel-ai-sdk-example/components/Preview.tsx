'use client';

import { useEffect, useState } from 'react';

interface PreviewProps {
  code: string;
}

export default function Preview({ code }: PreviewProps) {
  const [error, setError] = useState<string | null>(null);
  const [iframeKey, setIframeKey] = useState(0);

  useEffect(() => {
    if (!code) return;

    try {
      // Transform the code to handle JSX
      const transformedCode = transformCode(code);
      
      // Create the full HTML document
      const html = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <script src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
            <style>
              body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel">
              ${transformedCode}
              
              const root = ReactDOM.createRoot(document.getElementById('root'));
              root.render(React.createElement(Landing));
            </script>
          </body>
        </html>
      `;

      // Update iframe content
      const iframe = document.getElementById('preview-iframe') as HTMLIFrameElement;
      if (iframe) {
        iframe.srcdoc = html;
        setError(null);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to render preview');
    }
  }, [code]);

  const transformCode = (code: string) => {
    // Basic transformation to ensure the code works
    // Remove any import statements
    let transformed = code.replace(/^import\s+.*?;?\s*$/gm, '');
    
    // Remove export default and just keep the function
    transformed = transformed.replace(/export\s+default\s+function/, 'function');
    
    return transformed;
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-800">
        <h2 className="text-xl font-semibold text-white">Live Preview</h2>
        <p className="text-sm text-gray-400 mt-1">
          Your generated component rendered in real-time
        </p>
      </div>

      {/* Preview Area */}
      <div className="flex-1 relative">
        {error ? (
          <div className="absolute inset-0 flex items-center justify-center p-8">
            <div className="bg-red-900/20 border border-red-500 rounded-lg p-4 max-w-md">
              <h3 className="text-red-400 font-semibold mb-2">Render Error</h3>
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          </div>
        ) : !code ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500">Waiting for generated code...</p>
          </div>
        ) : null}
        
        <iframe
          id="preview-iframe"
          key={iframeKey}
          className="w-full h-full bg-white"
          sandbox="allow-scripts"
          title="Component Preview"
        />
      </div>
    </div>
  );
} 