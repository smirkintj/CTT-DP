'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquareText, Send, Sparkles, X } from 'lucide-react';
import type { User } from '../types';

type AssistantCard = {
  title: string;
  subtitle?: string;
  taskId?: string | null;
  meta: Array<{ label: string; value: string }>;
};

type ChatMessage = {
  role: 'assistant' | 'user';
  content: string;
  cards?: AssistantCard[];
};

type AssistantDockProps = {
  currentUser: User;
};

const starterPrompts = ['Show my open tasks', 'What is blocked right now?', 'Give me recent activity'];

export function AssistantDock({ currentUser }: AssistantDockProps) {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: 'assistant',
      content: `Hi ${firstName(currentUser.name)}. I can help with open tasks, blockers, overdue items, and recent activity. What do you want to check?`
    }
  ]);

  const historyPayload = useMemo(
    () => messages.map((message) => ({ role: message.role, content: message.content })),
    [messages]
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, isSending, isOpen]);

  const sendMessage = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || isSending) return;

    const nextMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(nextMessages);
    setInput('');
    setIsSending(true);

    try {
      const response = await fetch('/api/assistant/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          history: historyPayload
        })
      });

      const data = await response.json().catch(() => null);
      const reply =
        typeof data?.response === 'string' && data.response.trim().length > 0
          ? data.response.trim()
          : 'I ran into a problem pulling that up. Try again in a moment.';
      const cards = Array.isArray(data?.cards) ? (data.cards as AssistantCard[]) : [];

      setMessages([...nextMessages, { role: 'assistant', content: reply, cards }]);
    } catch {
      setMessages([
        ...nextMessages,
        {
          role: 'assistant',
          content: 'I could not reach the assistant service. Try again in a moment.'
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-[0_18px_45px_rgba(15,23,42,0.28)] transition-transform hover:scale-[1.02] focus:outline-none focus:ring-2 focus:ring-slate-300"
        aria-label={isOpen ? 'Close assistant' : 'Open assistant'}
      >
        {isOpen ? <X size={20} /> : <MessageSquareText size={20} />}
      </button>

      {isOpen ? (
        <section className="fixed bottom-24 right-6 z-40 flex h-[min(720px,78vh)] w-[min(420px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-[0_24px_80px_rgba(15,23,42,0.18)]">
          <div className="border-b border-slate-200 bg-[radial-gradient(circle_at_top_left,_rgba(30,41,59,0.08),_transparent_45%),linear-gradient(180deg,_#ffffff,_#f8fafc)] px-5 py-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
                  <Sparkles size={12} />
                  Assistant
                </div>
                <h3 className="mt-3 text-xl font-semibold tracking-tight text-slate-900">UAT copilot</h3>
                <p className="mt-1 text-sm leading-relaxed text-slate-500">
                  Ask about workload, blockers, overdue items, or recent activity.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-full p-2 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
                aria-label="Close assistant"
              >
                <X size={18} />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {starterPrompts.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => void sendMessage(prompt)}
                  className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:border-slate-300 hover:text-slate-900"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/80 px-4 py-4">
            {messages.map((message, index) => (
              <article
                key={`${message.role}-${index}`}
                className={`animate-card-enter ${message.role === 'user' ? 'ml-10' : 'mr-10'}`}
              >
                <div
                  className={`rounded-[22px] px-4 py-3 text-sm leading-6 shadow-sm ${
                    message.role === 'user'
                      ? 'bg-slate-900 text-white'
                      : 'border border-slate-200 bg-white text-slate-800'
                  }`}
                >
                  {message.content}
                </div>

                {message.cards && message.cards.length > 0 ? (
                  <div className="mt-3 space-y-3">
                    {message.cards.map((card, cardIndex) => (
                      <button
                        key={`${card.title}-${cardIndex}`}
                        type="button"
                        onClick={() => {
                          if (!card.taskId) return;
                          setIsOpen(false);
                          router.push(`/tasks/${card.taskId}`);
                        }}
                        className={`w-full rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-left shadow-sm transition-transform hover:-translate-y-[1px] ${
                          card.taskId ? 'cursor-pointer' : 'cursor-default'
                        }`}
                      >
                        <div className="text-sm font-semibold text-slate-900">{card.title}</div>
                        {card.subtitle ? (
                          <div className="mt-1 text-xs font-medium uppercase tracking-[0.14em] text-slate-400">
                            {card.subtitle}
                          </div>
                        ) : null}
                        <div className="mt-3 grid grid-cols-3 gap-2">
                          {card.meta.map((item) => (
                            <div key={`${card.title}-${item.label}`}>
                              <div className="text-[11px] uppercase tracking-[0.14em] text-slate-400">
                                {item.label}
                              </div>
                              <div className="mt-1 text-sm font-medium text-slate-700">{item.value}</div>
                            </div>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>
                ) : null}
              </article>
            ))}

            {isSending ? (
              <div className="mr-10 rounded-[22px] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
                <span className="inline-flex items-center gap-2">
                  <Loader2 size={14} className="animate-spin" />
                  Pulling that up...
                </span>
              </div>
            ) : null}
          </div>

          <form
            className="border-t border-slate-200 bg-white p-4"
            onSubmit={(event) => {
              event.preventDefault();
              void sendMessage(input);
            }}
          >
            <div className="flex items-end gap-3 rounded-[24px] border border-slate-200 bg-slate-50 px-3 py-3">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault();
                    void sendMessage(input);
                  }
                }}
                rows={1}
                placeholder="Ask about tasks, blockers, or activity"
                className="max-h-28 min-h-[28px] flex-1 resize-none bg-transparent text-sm text-slate-800 outline-none placeholder:text-slate-400"
              />
              <button
                type="submit"
                disabled={isSending || input.trim().length === 0}
                className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-900 text-white transition-colors hover:bg-slate-800 disabled:bg-slate-300"
                aria-label="Send message"
              >
                <Send size={16} />
              </button>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">Press Enter to send. Shift+Enter adds a new line.</p>
          </form>
        </section>
      ) : null}
    </>
  );
}

function firstName(name: string) {
  const trimmed = name.trim();
  if (!trimmed) return 'there';
  return trimmed.split(/\s+/)[0];
}
