// Metal Message Input Component
import { useState, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { Send, Timer, Paperclip, Smile } from 'lucide-react';

interface MessageInputProps {
  onSend: (content: string, expiresIn?: number) => void;
  disabled?: boolean;
}

export function MessageInput({ onSend, disabled = false }: MessageInputProps) {
  const [content, setContent] = useState('');
  const [showExpiry, setShowExpiry] = useState(false);
  const [expiryMinutes, setExpiryMinutes] = useState<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleSend = () => {
    if (!content.trim() || disabled) return;
    
    onSend(content.trim(), expiryMinutes ? expiryMinutes * 60 : undefined);
    setContent('');
    setExpiryMinutes(null);
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    
    // Auto-resize
    const textarea = e.target;
    textarea.style.height = 'auto';
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + 'px';
  };

  const expiryOptions = [
    { label: '5 min', value: 5 },
    { label: '1 hour', value: 60 },
    { label: '24 hours', value: 1440 },
    { label: 'Off', value: null }
  ];

  return (
    <div className="border-t border-zinc-800 bg-zinc-900 p-4">
      {/* Expiry selector */}
      {showExpiry && (
        <div className="mb-3 flex items-center gap-2">
          <Timer className="w-4 h-4 text-zinc-500" />
          <span className="text-sm text-zinc-500">Self-destruct:</span>
          {expiryOptions.map(opt => (
            <button
              key={opt.label}
              onClick={() => {
                setExpiryMinutes(opt.value);
                if (opt.value === null) setShowExpiry(false);
              }}
              className={`px-3 py-1 rounded-full text-sm transition-colors ${
                expiryMinutes === opt.value
                  ? 'bg-emerald-600 text-white'
                  : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-end gap-2">
        {/* Attachment button */}
        <button
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="Attach file"
        >
          <Paperclip className="w-5 h-5" />
        </button>

        {/* Self-destruct timer */}
        <button
          onClick={() => setShowExpiry(!showExpiry)}
          className={`p-2 rounded-lg transition-colors ${
            expiryMinutes
              ? 'bg-orange-600/20 text-orange-500'
              : 'hover:bg-zinc-800 text-zinc-400 hover:text-white'
          }`}
          title="Self-destruct timer"
        >
          <Timer className="w-5 h-5" />
        </button>

        {/* Input */}
        <div className="flex-1 relative">
          <textarea
            ref={textareaRef}
            value={content}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            disabled={disabled}
            rows={1}
            className="w-full bg-zinc-800 text-white rounded-xl px-4 py-3 pr-12 resize-none border border-zinc-700 focus:border-emerald-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            className="absolute right-2 bottom-2 p-2 hover:bg-zinc-700 rounded-lg transition-colors text-zinc-400 hover:text-white"
            title="Emoji"
          >
            <Smile className="w-5 h-5" />
          </button>
        </div>

        {/* Send button */}
        <button
          onClick={handleSend}
          disabled={!content.trim() || disabled}
          className="p-3 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition-colors"
        >
          <Send className="w-5 h-5 text-white" />
        </button>
      </div>

      {expiryMinutes && (
        <p className="text-xs text-orange-500 mt-2 flex items-center gap-1">
          <Timer className="w-3 h-3" />
          Message will self-destruct after {expiryMinutes} minutes
        </p>
      )}
    </div>
  );
}

export default MessageInput;
