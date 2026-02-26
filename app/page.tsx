'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import { Send, Brain, Sparkles } from 'lucide-react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, setInput } = useChat({
    api: '/api/chat',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [usedPrompts, setUsedPrompts] = useState<Set<number>>(new Set());

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const allPrompts = [
    "Summarize Jordanne's background and expertise",
    "How does Jordanne solve complex problems?",
    "What makes Jordanne's approach unique?",
    "Tell me about AI and product innovation experience",
    "What's Jordanne's leadership style?",
    "What projects has Jordanne led?",
    "Tell me about data strategy experience",
    "How has Jordanne enabled innovation within teams?"
  ];

  const visiblePrompts = allPrompts.filter((_, index) => !usedPrompts.has(index));

  const handlePromptClick = (prompt: string, index: number) => {
    setInput(prompt);
    setUsedPrompts(prev => new Set([...prev, index]));
    const form = document.querySelector('form');
    if (form) {
      const submitEvent = new Event('submit', { bubbles: true, cancelable: true });
      form.dispatchEvent(submitEvent);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-3 sm:p-4 md:p-6 relative overflow-visible bg-[#E8E6DC] font-sans" role="main">
      <style jsx global>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap');
        
        body {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        .chat-content {
          font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
        }

        .prompt-bubble {
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        }

        /* Custom markdown styling - applies to all ReactMarkdown content */
        .ai-message p {
          margin: 0.75rem 0;
          line-height: 1.6;
        }

        .ai-message p:first-child {
          margin-top: 0;
        }

        .ai-message p:last-child {
          margin-bottom: 0;
        }

        .ai-message ul {
          margin: 0.75rem 0;
          padding-left: 1.5rem;
          list-style-type: disc;
        }

        .ai-message li {
          margin: 0.5rem 0;
          line-height: 1.5;
        }

        .ai-message strong {
          font-weight: 600;
          color: #2d2c28;
        }

        .ai-message h2 {
          font-size: 1.1rem;
          font-weight: 700;
          margin-top: 1rem;
          margin-bottom: 0.5rem;
        }

        .ai-message h2:first-child {
          margin-top: 0;
        }

        .ai-message h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 0.75rem;
          margin-bottom: 0.5rem;
        }
      `}</style>

      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-64 sm:w-96 h-64 sm:h-96 bg-[#C9C5B1] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-1/4 -right-20 w-64 sm:w-96 h-64 sm:h-96 bg-[#9B9782] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-96 h-64 sm:h-96 bg-[#787569] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 relative z-10 py-6" style={{ minHeight: '90vh' }}>
        {/* Header positioned above cat - Inter font */}
        <header className="text-center space-y-2 sm:space-y-3 px-4 flex-shrink-0 font-sans">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-sm rounded-full border border-[#C9C5B1]/40 shadow-sm" role="banner">
            <Sparkles className="w-4 h-4 text-[#4F4D46]" aria-hidden="true" />
            <span className="text-xs font-medium text-[#4F4D46]">AI Resume Assistant</span>
          </div>
          
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[#4F4D46] tracking-tight">
            Jordanne Dyck
          </h1>
          
          <p className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#787569] font-medium flex-wrap" role="doc-subtitle">
            <span>AI Innovation</span>
            <span className="text-[#787569]/40" aria-hidden="true">•</span>
            <span>Digital Transformation</span>
            <span className="text-[#787569]/40" aria-hidden="true">•</span>
            <span>Product Strategy</span>
          </p>
        </header>

        {/* Chat window container with 105px top margin */}
        <div className="relative mt-[105px]" style={{ height: '55vh' }}>
          {/* Cat positioned above chat window - moved up 1px more */}
          <div className="absolute -top-[119px] right-[6px] z-50 pointer-events-none" style={{ width: '220px', height: '220px' }}>
            <div className="relative w-full h-full">
              <Image
                src="/cat-drawn-transparent-real-coloured.png"
                alt="Friendly cat"
                width={220}
                height={220}
                className="object-contain"
                priority
              />
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl border border-[#C9C5B1]/30 overflow-hidden flex flex-col h-full" role="region" aria-label="AI Chat Assistant">
            <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4 chat-content" role="log" aria-live="polite" aria-atomic="false">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center space-y-3 sm:space-y-4 max-w-md px-4">
                    <Brain className="w-10 h-10 sm:w-12 sm:h-12 mx-auto text-[#787569]" />
                    <div className="space-y-1.5 sm:space-y-2">
                      <h2 className="text-base sm:text-lg md:text-xl font-semibold text-[#4F4D46]">
                        Ask me about Jordanne
                      </h2>
                      <p className="text-xs sm:text-sm text-[#787569]/80 leading-relaxed">
                        I have access to Jordanne&apos;s complete professional knowledge base including experience, projects, skills, and work style.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {messages.map((message, index) => (
                <div
                  key={index}
                  className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] sm:max-w-[80%] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5 text-xs sm:text-sm md:text-base leading-relaxed ${
                      message.role === 'user'
                        ? 'bg-[#4F4D46] text-white'
                        : 'bg-[#C9C5B1]/40 text-[#4F4D46] border border-[#9B9782]/20'
                    }`}
                  >
                    {message.role === 'user' ? (
                      // User messages - plain text
                      message.content
                    ) : (
                      // AI messages - render markdown (wrapped in div for styling)
                      <div className="ai-message">
                        <ReactMarkdown
                          components={{
                            p: ({node, ...props}) => (
                              <p className="my-3 leading-relaxed first:mt-0 last:mb-0" {...props} />
                            ),
                            ul: ({node, ...props}) => (
                              <ul className="my-3 ml-6 list-disc space-y-2 first:mt-0 last:mb-0" {...props} />
                            ),
                            li: ({node, ...props}) => (
                              <li className="leading-relaxed" {...props} />
                            ),
                            strong: ({node, ...props}) => (
                              <strong className="font-semibold" {...props} />
                            ),
                            h2: ({node, ...props}) => (
                              <h2 className="text-base sm:text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />
                            ),
                            h3: ({node, ...props}) => (
                              <h3 className="text-sm sm:text-base font-semibold mt-3 mb-1.5 first:mt-0" {...props} />
                            ),
                          }}
                        >
                          {message.content}
                        </ReactMarkdown>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-[#C9C5B1]/40 border border-[#9B9782]/20 rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5">
                    <div className="flex space-x-1.5 sm:space-x-2">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#787569] rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#787569] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#787569] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex-shrink-0 border-t border-[#C9C5B1]/30 bg-white/40 backdrop-blur-sm">
              <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                <form onSubmit={handleSubmit} className="flex gap-2 chat-content" role="search" aria-label="Chat with AI assistant">
                  <input
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Ask about experience, projects, skills..."
                    className="flex-1 rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-3 text-xs sm:text-sm md:text-base bg-white/80 border border-[#C9C5B1]/50 focus:outline-none focus:ring-2 focus:ring-[#787569]/30 focus:border-transparent text-[#4F4D46] placeholder-[#787569]/50"
                    disabled={isLoading}
                    aria-label="Message input"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="rounded-xl sm:rounded-2xl px-3 py-2 sm:px-4 sm:py-3 bg-[#4F4D46] hover:bg-[#3a3933] disabled:bg-[#787569]/30 disabled:cursor-not-allowed text-white transition-all duration-200 flex items-center justify-center min-w-[40px] sm:min-w-[48px]"
                    aria-label="Send message"
                  >
                    <Send className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                  </button>
                </form>

                {visiblePrompts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                    {visiblePrompts.slice(0, 4).map((prompt, idx) => (
                      <button
                        key={allPrompts.indexOf(prompt)}
                        onClick={() => handlePromptClick(prompt, allPrompts.indexOf(prompt))}
                        disabled={isLoading}
                        className="prompt-bubble text-[11px] sm:text-xs px-2.5 py-2 sm:px-2.5 sm:py-1.5 rounded-full bg-[#C9C5B1]/60 hover:bg-[#C9C5B1] active:bg-[#C9C5B1] text-[#4F4D46] border border-[#787569]/20 transition-all duration-200 font-medium leading-tight"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}

                {visiblePrompts.length === 0 && messages.length > 0 && (
                  <div className="text-center py-1 chat-content">
                    <p className="text-[11px] sm:text-xs text-[#787569]/60">
                      Ask me anything else about Jordanne&apos;s experience
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center space-y-3 px-4 flex-shrink-0 font-sans">
          {/* Quirky contact section */}
          <section className="space-y-2" aria-label="Contact Information">
            <p className="text-sm sm:text-base font-medium text-[#4F4D46]">
              Wanna experience the human version? 🙋‍♀️
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm" aria-label="Contact links">
              <a 
                href="mailto:jordanne.dyck@gmail.com" 
                className="text-[#787569] hover:text-[#4F4D46] transition-colors underline decoration-[#787569]/30 hover:decoration-[#4F4D46]"
              >
                Email
              </a>
              <span className="text-[#787569]/40" aria-hidden="true">•</span>
              <a 
                href="https://www.linkedin.com/in/jordannedyck/" 
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#787569] hover:text-[#4F4D46] transition-colors underline decoration-[#787569]/30 hover:decoration-[#4F4D46]"
              >
                LinkedIn
              </a>
              <span className="text-[#787569]/40" aria-hidden="true">•</span>
              <a 
                href="tel:6474542244" 
                className="text-[#787569] hover:text-[#4F4D46] transition-colors underline decoration-[#787569]/30 hover:decoration-[#4F4D46]"
              >
                647-454-2244
              </a>
            </nav>
          </section>

          {/* Divider */}
          <div className="w-20 h-px bg-[#787569]/20 mx-auto" aria-hidden="true"></div>

          {/* Tech credits */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-4 text-xs sm:text-sm text-[#787569]">
            <span className="flex items-center gap-1.5">
              <Brain className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Powered by MCP, Next.js & OpenAI</span>
            </span>
            <span className="hidden sm:inline" aria-hidden="true">•</span>
            <span className="text-center leading-tight">
              Built by Jordanne Dyck
            </span>
          </div>
          
          <p className="text-[10px] sm:text-xs text-[#787569]/50 leading-tight">
            Think of this AI as Jordanne&apos;s very smart, but sometimes-forgetful, apprentice. It has access to Jordanne&apos;s professional knowledge base, but you should always confirm the details.
          </p>
        </footer>
      </div>
    </main>
  );
}