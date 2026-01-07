// Metal Message List Component
import { useEffect, useRef } from 'react';
import { Check, CheckCheck, Clock, AlertCircle, Lock } from 'lucide-react';
import { Message } from '../../types';

interface MessageListProps {
  messages: Message[];
  currentUserId: string;
}

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  
  return date.toLocaleDateString([], { 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function MessageStatus({ status }: { status: Message['status'] }) {
  switch (status) {
    case 'sending':
      return <Clock className="w-3 h-3 text-zinc-500" />;
    case 'sent':
      return <Check className="w-3 h-3 text-zinc-500" />;
    case 'delivered':
      return <CheckCheck className="w-3 h-3 text-zinc-500" />;
    case 'read':
      return <CheckCheck className="w-3 h-3 text-emerald-500" />;
    case 'failed':
      return <AlertCircle className="w-3 h-3 text-red-500" />;
    default:
      return null;
  }
}

export function MessageList({ messages, currentUserId }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center text-zinc-500">
          <Lock className="w-16 h-16 mx-auto mb-4 opacity-30" />
          <p className="text-lg">End-to-end encrypted</p>
          <p className="text-sm mt-1">Messages are secured with AES-256-GCM</p>
        </div>
      </div>
    );
  }

  let lastDate = '';

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-2">
      {messages.map((message) => {
        const isOwn = message.senderId === currentUserId;
        const messageDate = new Date(message.timestamp).toDateString();
        const showDateDivider = messageDate !== lastDate;
        lastDate = messageDate;

        return (
          <div key={message.id}>
            {showDateDivider && (
              <div className="flex items-center justify-center my-4">
                <span className="bg-zinc-800 text-zinc-500 text-xs px-3 py-1 rounded-full">
                  {new Date(message.timestamp).toLocaleDateString([], {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric'
                  })}
                </span>
              </div>
            )}
            <div className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                  isOwn
                    ? 'bg-emerald-600 text-white rounded-br-md'
                    : 'bg-zinc-800 text-white rounded-bl-md'
                }`}
              >
                {message.type === 'system' ? (
                  <p className="text-sm italic text-zinc-400">{message.content}</p>
                ) : (
                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                )}
                <div className={`flex items-center gap-1 mt-1 ${
                  isOwn ? 'justify-end' : 'justify-start'
                }`}>
                  <span className="text-xs opacity-60">
                    {formatTime(message.timestamp)}
                  </span>
                  {isOwn && <MessageStatus status={message.status} />}
                  {message.isEncrypted && (
                    <Lock className="w-3 h-3 opacity-40" />
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}

export default MessageList;
