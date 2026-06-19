'use client';

import { useChat } from 'ai/react';
import { useState, useEffect, useRef } from 'react';
import { Send, Sparkles } from 'lucide-react';
import Image from 'next/image';
import dynamic from 'next/dynamic';

const ReactMarkdown = dynamic(() => import('react-markdown'), { ssr: false });

export default function Home() {
  const { messages, input, handleInputChange, handleSubmit, isLoading, append } = useChat({
    api: '/api/chat',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUp = useRef(false);
  const [usedPrompts, setUsedPrompts] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (!userScrolledUp.current) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isLoading]);

  const handleScroll = () => {
    const el = chatContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    userScrolledUp.current = distanceFromBottom > 80;
  };

  const allPrompts = [
    "How does Jordanne approach scaling a product for millions of users?",
    "Tell me about the 'instinct' that drives her to build.",
    "What is Jordanne's philosophy on the future of AI-driven customer experience?",
    "What is 'FundLocal' and why did Jordanne build it?",
    "How does Jordanne balance automation with maintaining trust at scale?",
    "What is Jordanne's process for moving from concept to production?",
    "How does Jordanne lead and influence across technical and non-technical teams?",
    "How does Jordanne use data and experimentation to validate a new direction?"
  ];

  const visiblePrompts = allPrompts.filter((_, index) => !usedPrompts.has(index));

  const handlePromptClick = (prompt: string, index: number) => {
    setUsedPrompts(prev => new Set([...prev, index]));
    append({ role: 'user', content: prompt });
  };

  return (
    <main className="h-[100dvh] flex flex-col items-center p-3 sm:p-4 md:p-6 relative overflow-hidden bg-[#F5F5F0]" role="main">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-20 w-64 sm:w-96 h-64 sm:h-96 bg-[#E0E0DB] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse"></div>
        <div className="absolute bottom-1/4 -right-20 w-64 sm:w-96 h-64 sm:h-96 bg-[#CCCCCC] rounded-full mix-blend-multiply filter blur-3xl opacity-30 animate-pulse" style={{ animationDelay: '2s' }}></div>
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 sm:w-96 h-64 sm:h-96 bg-[#999999] rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '4s' }}></div>
      </div>

      <div className="w-full max-w-3xl mx-auto flex flex-col gap-4 relative z-10 py-4 sm:py-6 h-full min-h-0">
        {/* Header */}
        <header className="text-center space-y-2 sm:space-y-3 px-4 flex-shrink-0">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-white/70 backdrop-blur-sm rounded-full border border-[#E0E0DB] shadow-sm" role="banner">
            <Sparkles className="w-4 h-4 text-[#666666]" aria-hidden="true" />
            <span className="text-xs font-medium text-[#1A1A1A]">AI Resume Assistant</span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-[#1A1A1A] tracking-tight">
            Jordanne Dyck
          </h1>

          <p className="flex items-center justify-center gap-2 text-xs sm:text-sm text-[#666666] font-medium flex-wrap" role="doc-subtitle">
            <span>ai builder</span>
            <span className="text-[#666666]/40" aria-hidden="true">&bull;</span>
            <span>product & strategy leader</span>
            <span className="text-[#666666]/40" aria-hidden="true">&bull;</span>
            <span>15+ years shipping at scale</span>
          </p>
        </header>

        {/* Chat window container */}
        <div className="relative mt-[65px] sm:mt-[105px] flex-1 min-h-0">
          {/* Cat positioned above chat window */}
          <div className="absolute -top-[79px] right-[6px] sm:-top-[119px] z-50 pointer-events-none w-[140px] h-[140px] sm:w-[220px] sm:h-[220px]">
            <div className="relative w-full h-full">
              <Image
                src="/cat-drawn-transparent-real-coloured.png"
                alt="Friendly cat"
                width={220}
                height={220}
                className="object-contain w-full h-full"
                priority
              />
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-sm rounded-2xl sm:rounded-3xl shadow-2xl border border-[#E0E0DB] overflow-hidden flex flex-col h-full" role="region" aria-label="AI Chat Assistant">
            <div ref={chatContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-3 sm:space-y-4" role="log" aria-live="polite" aria-atomic="false">
              {messages.length === 0 && (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center max-w-md px-4 space-y-3">
                    <p className="inline-block text-base sm:text-lg font-medium text-[#0055D4] leading-relaxed bg-[#E0EBFF] px-3 py-2 rounded-xl">
                      I&apos;m an AI-native representative of Jordanne&apos;s career.
                    </p>
                    <p className="text-[11px] sm:text-xs text-[#666666] leading-relaxed">
                      Try asking me about her experience shipping production AI, the instinct that drives her to build, or how she bridges strategy with hands-on execution.
                    </p>
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
                        ? 'bg-[#0055D4] text-white'
                        : 'bg-[#EAEAE5]/60 text-[#1A1A1A] border border-[#E0E0DB]'
                    }`}
                  >
                    {message.role === 'user' ? (
                      message.content
                    ) : (
                      <div className="ai-message">
                        <ReactMarkdown
                          components={{
                            p: ({node: _node, ...props}) => (
                              <p className="my-3 leading-relaxed first:mt-0 last:mb-0" {...props} />
                            ),
                            ul: ({node: _node, ...props}) => (
                              <ul className="my-3 ml-6 list-disc space-y-2 first:mt-0 last:mb-0" {...props} />
                            ),
                            li: ({node: _node, ...props}) => (
                              <li className="leading-relaxed" {...props} />
                            ),
                            strong: ({node: _node, ...props}) => (
                              <strong className="font-semibold" {...props} />
                            ),
                            h2: ({node: _node, ...props}) => (
                              <h2 className="text-base sm:text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />
                            ),
                            h3: ({node: _node, ...props}) => (
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
                  <div className="bg-[#EAEAE5]/60 border border-[#E0E0DB] rounded-2xl px-3 py-2 sm:px-4 sm:py-2.5">
                    <div className="flex space-x-1.5 sm:space-x-2" role="status" aria-label="Loading response">
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#0055D4] rounded-full animate-bounce"></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#0055D4] rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                      <div className="w-1.5 h-1.5 sm:w-2 sm:h-2 bg-[#0055D4] rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            <div className="flex-shrink-0 border-t border-[#E0E0DB] bg-white/40 backdrop-blur-sm">
              <div className="p-3 sm:p-4 space-y-2 sm:space-y-3">
                <form onSubmit={handleSubmit} className="flex gap-2" aria-label="Chat with AI assistant">
                  <input
                    value={input}
                    onChange={handleInputChange}
                    placeholder="Ask about experience, projects, skills..."
                    className="flex-1 rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 text-sm sm:text-sm md:text-base bg-white/80 border border-[#E0E0DB] focus:outline-none focus:ring-2 focus:ring-[#0055D4]/30 focus:border-transparent text-[#1A1A1A] placeholder-[#999999]"
                    disabled={isLoading}
                    aria-label="Message input"
                  />
                  <button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    className="rounded-xl sm:rounded-2xl px-3 py-2.5 sm:px-4 sm:py-3 bg-[#0055D4] hover:bg-[#004ABB] disabled:bg-[#CCCCCC] disabled:cursor-not-allowed text-white transition-all duration-200 flex items-center justify-center min-w-[44px] sm:min-w-[48px]"
                    aria-label="Send message"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                  </button>
                </form>

                {visiblePrompts.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 sm:gap-2 justify-center">
                    {visiblePrompts.slice(0, 4).map((prompt, idx) => (
                      <button
                        key={idx}
                        onClick={() => handlePromptClick(prompt, allPrompts.indexOf(prompt))}
                        disabled={isLoading}
                        className="text-[11px] sm:text-xs px-3 py-1.5 sm:px-3 sm:py-1.5 rounded-xl bg-[#EAEAE5] hover:bg-[#E0E0DB] active:bg-[#E0E0DB] text-[#1A1A1A] border border-[#CCCCCC]/40 transition-all duration-200 font-medium leading-snug text-left"
                      >
                        {prompt}
                      </button>
                    ))}
                  </div>
                )}

                {visiblePrompts.length === 0 && messages.length > 0 && (
                  <div className="text-center py-1">
                    <p className="text-[11px] sm:text-xs text-[#999999]">
                      Ask me anything else about Jordanne&apos;s experience
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <footer className="text-center space-y-3 px-4 flex-shrink-0">
          <section className="space-y-2" aria-label="Contact Information">
            <p className="text-sm sm:text-base font-medium text-[#1A1A1A]">
              Wanna experience the human version? 🙋‍♀️
            </p>
            <nav className="flex flex-wrap items-center justify-center gap-3 sm:gap-4 text-xs sm:text-sm" aria-label="Contact links">
              <a
                href="mailto:jordanne.dyck@gmail.com"
                className="text-[#666666] hover:text-[#0055D4] transition-colors underline decoration-[#CCCCCC] hover:decoration-[#0055D4]"
              >
                Email
              </a>
              <span className="text-[#CCCCCC]" aria-hidden="true">&bull;</span>
              <a
                href="https://www.linkedin.com/in/jordannedyck/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#666666] hover:text-[#0055D4] transition-colors underline decoration-[#CCCCCC] hover:decoration-[#0055D4]"
              >
                LinkedIn
              </a>
              <span className="text-[#CCCCCC]" aria-hidden="true">&bull;</span>
              <a
                href="tel:6474542244"
                className="text-[#666666] hover:text-[#0055D4] transition-colors underline decoration-[#CCCCCC] hover:decoration-[#0055D4]"
              >
                647-454-2244
              </a>
            </nav>
          </section>

          <div className="w-20 h-px bg-[#E0E0DB] mx-auto" aria-hidden="true"></div>

          <p className="text-[10px] sm:text-xs text-[#999999] leading-tight">
            Built by Jordanne Dyck. Think of this AI as Jordanne&apos;s very smart, but sometimes-forgetful, apprentice — always confirm the details.
          </p>
        </footer>
      </div>
    </main>
  );
}
