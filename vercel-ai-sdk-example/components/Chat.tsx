'use client';

import { Message } from 'ai';
import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';

interface ChatProps {
  messages: Message[];
  input: string;
  handleInputChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  handleSubmit: (e: FormEvent<HTMLFormElement>) => void;
  hideInput?: boolean;
  quickActions?: ReactNode;
}

export default function Chat({ 
  messages, 
  input, 
  handleInputChange, 
  handleSubmit,
  hideInput = false,
  quickActions
}: ChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isUserScrolling, setIsUserScrolling] = useState(false);
  const scrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrollPositionRef = useRef(0);

  // Handle scroll events
  const handleScroll = () => {
    if (!scrollRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = scrollRef.current;
    const isAtBottom = Math.abs(scrollHeight - clientHeight - scrollTop) < 10;
    
    // If user scrolled up from bottom, mark as user scrolling
    if (!isAtBottom && scrollTop < lastScrollPositionRef.current) {
      setIsUserScrolling(true);
      
      // Clear existing timeout
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      
      // Set new timeout to resume auto-scroll after 2 seconds
      scrollTimeoutRef.current = setTimeout(() => {
        setIsUserScrolling(false);
      }, 2000);
    }
    
    // If scrolled to bottom, always resume auto-scroll
    if (isAtBottom) {
      setIsUserScrolling(false);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    }
    
    lastScrollPositionRef.current = scrollTop;
  };

  // Auto-scroll when new messages arrive
  useEffect(() => {
    if (!scrollRef.current || isUserScrolling) return;
    
    // Smooth scroll to bottom
    scrollRef.current.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth'
    });
  }, [messages, isUserScrolling]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full bg-gradient-to-b from-gray-900 to-gray-950">
      {/* Header */}
      <div className="p-6 border-b border-gray-800/50 backdrop-blur-sm bg-gray-900/50">
        <h1 className="text-2xl font-bold text-white bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
          AI Video Editor Demo
        </h1>
        <p className="text-sm text-gray-400 mt-2">
          Watch AI generate code and edit videos in real-time
        </p>
      </div>

      {/* Messages */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-6 space-y-4 scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent"
      >
        {messages.map((message, index) => (
          <div
            key={message.id}
            className={`flex ${
              message.role === 'user' ? 'justify-end' : 'justify-start'
            } animate-fadeIn`}
            style={{ animationDelay: `${index * 0.05}s` }}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-5 py-3 shadow-lg transition-all duration-200 hover:shadow-xl ${
                message.role === 'user'
                  ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white ml-12'
                  : 'bg-gray-800/80 backdrop-blur-sm text-gray-100 border border-gray-700/50 mr-12'
              }`}
            >
              {/* Show tool invocations */}
              {message.toolInvocations && message.toolInvocations.length > 0 && (
                <div className="mb-3 space-y-2 pb-3 border-b border-white/10">
                  {message.toolInvocations.map((invocation, idx) => (
                    <div key={idx} className="text-xs flex items-center gap-2">
                      {invocation.state === 'call' && (
                        <>
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-yellow-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-yellow-500"></span>
                          </span>
                          <span className="text-yellow-200/80">Calling {invocation.toolName}...</span>
                        </>
                      )}
                      {invocation.state === 'result' && (
                        <>
                          <span className="inline-flex items-center justify-center w-4 h-4 bg-green-500/20 rounded-full">
                            <span className="text-green-400 text-xs">✓</span>
                          </span>
                          <span className="text-green-400/80">{invocation.toolName} completed</span>
                        </>
                      )}
                    </div>
                  ))}
                </div>
              )}
              
              <div className="whitespace-pre-wrap leading-relaxed break-words">
                {message.content}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Input or Quick Actions */}
      {!hideInput ? (
        <form onSubmit={handleSubmit} className="p-6 border-t border-gray-800/50 bg-gray-900/50 backdrop-blur-sm">
          <div className="flex gap-3">
            <input
              type="text"
              value={input}
              onChange={handleInputChange}
              placeholder="Type a message..."
              className="flex-1 px-5 py-3 bg-gray-800/50 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500/50 focus:bg-gray-800/70 transition-all duration-200 placeholder-gray-500"
            />
            <button
              type="submit"
              className={`px-8 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 font-medium shadow-lg hover:shadow-xl ${
                input && input === 'Add captions to the video' ? 'animate-pulse' : ''
              }`}
            >
              Send
            </button>
          </div>
        </form>
      ) : (
        <div className="p-6 border-t border-gray-800/50 bg-gray-900/50 backdrop-blur-sm">
          <div className="space-y-2">
            {quickActions}
          </div>
        </div>
      )}
    </div>
  );
} 