'use client';

import { useChat } from '@ai-sdk/react';
import { useEffect, useState, useRef } from 'react';
import Chat from '../components/Chat';
import Preview from '../components/Preview';

const INITIAL_MESSAGE = `Create a simple landing page with:
- A hero section with dark gradient background
- A bold headline "Transform Your Videos with AI"
- A subheadline about AI-powered video editing
- A CTA button "Get Started"
- Embed this demo video: https://files.catbox.moe/h8dvzx.mp4
Make it modern and beautiful with Tailwind CSS.`;

export default function Home() {
  const {
    messages,
    input,
    handleInputChange,
    handleSubmit,
    append,
    error,
    reload,
    setInput,
  } = useChat({
    api: '/api/chat',
    onError: (error) => {
      console.error('Chat error:', error);
    },
  });

  const [code, setCode] = useState<string>('');
  const [currentStep, setCurrentStep] = useState<'initial' | 'upload' | 'caption' | 'status'>('initial');
  const hasInitialized = useRef(false);

  // Auto-send initial message on mount
  useEffect(() => {
    if (!hasInitialized.current && messages.length === 0) {
      hasInitialized.current = true;
      append({ role: 'user', content: INITIAL_MESSAGE });
    }
  }, [messages.length, append]);

  // Track conversation progress
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage) return;

    // After initial page generation, show upload button
    if (currentStep === 'initial' && lastMessage.role === 'assistant' && lastMessage.content.includes('```tsx')) {
      setCurrentStep('upload');
    }
    // After upload confirmation, show caption button
    else if (currentStep === 'upload' && lastMessage.role === 'assistant' && lastMessage.content.includes('uploaded successfully')) {
      setCurrentStep('caption');
    }
    // After caption process starts, show status button
    else if (currentStep === 'caption' && lastMessage.role === 'assistant' && 
             (lastMessage.content.includes('Processing') || lastMessage.content.includes('may take'))) {
      setCurrentStep('status');
    }
  }, [messages, currentStep]);

  // Extract code from messages
  useEffect(() => {
    const lastAssistantMessage = messages
      .filter((m) => m.role === 'assistant')
      .pop();

    if (lastAssistantMessage?.content) {
      const codeMatch = lastAssistantMessage.content.match(/```tsx\n([\s\S]*?)```/);
      if (codeMatch) {
        setCode(codeMatch[1]);
      }
    }
  }, [messages]);

  const handleQuickAction = (message: string) => {
    append({ role: 'user', content: message });
  };

  return (
    <div className="flex h-screen bg-gray-900">
      {/* Chat Panel */}
      <div className="w-1/2 border-r border-gray-800">
        <Chat
          messages={messages}
          input={input}
          handleInputChange={handleInputChange}
          handleSubmit={handleSubmit}
          hideInput={true}
          quickActions={
            currentStep === 'upload' ? (
              <button
                onClick={() => handleQuickAction('Upload the video from the landing page to Mosaic')}
                className="w-full px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 text-white rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02] animate-fadeIn"
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-xl">📤</span>
                  <span>Upload video to Mosaic</span>
                </span>
              </button>
            ) : currentStep === 'caption' ? (
              <button
                onClick={() => handleQuickAction('Add captions to the uploaded video')}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-600 to-teal-600 text-white rounded-xl hover:from-green-700 hover:to-teal-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02] animate-fadeIn"
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-xl">💬</span>
                  <span>Add captions to video</span>
                </span>
              </button>
            ) : currentStep === 'status' ? (
              <button
                onClick={() => handleQuickAction('Check the status of the video processing')}
                className="w-full px-6 py-4 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-xl hover:from-purple-700 hover:to-pink-700 transition-all duration-200 font-medium shadow-lg hover:shadow-xl transform hover:scale-[1.02]"
              >
                <span className="flex items-center justify-center gap-3">
                  <span className="text-xl animate-spin-slow">🔄</span>
                  <span>Check processing status</span>
                </span>
              </button>
            ) : null
          }
        />
      </div>

      {/* Preview Panel */}
      <div className="w-1/2">
        <Preview code={code} />
      </div>

      {/* Error Display */}
      {error && (
        <div className="fixed bottom-4 right-4 bg-red-600 text-white p-4 rounded-lg max-w-md">
          <p className="font-semibold">Error</p>
          <p className="text-sm mt-1">{error.message}</p>
          <button
            onClick={() => reload()}
            className="mt-2 text-sm underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
