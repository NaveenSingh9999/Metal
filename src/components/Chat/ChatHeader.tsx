// Metal Chat Header Component
import { Shield, Phone, Lock, Video, MoreVertical } from 'lucide-react';
import type { Contact } from '../../types';
import { formatMetalId } from '../../services/metal-id';

interface ChatHeaderProps {
  contact: Contact | null;
  isEncrypted: boolean;
  isTyping?: boolean;
}

export function ChatHeader({ contact, isEncrypted, isTyping }: ChatHeaderProps) {
  if (!contact) {
    return (
      <div className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-center">
        <div className="flex items-center gap-2 text-zinc-500">
          <Shield className="w-5 h-5" />
          <span>Select a conversation to start messaging</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-4">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold">
            {contact.displayName.charAt(0).toUpperCase()}
          </div>
          {contact.isOnline && (
            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-semibold text-white">{contact.displayName}</h2>
            <span className="text-xs font-mono text-zinc-500">
              {formatMetalId(contact.metalId)}
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {isTyping ? (
              <span className="text-emerald-400 flex items-center gap-1">
                <span className="flex gap-0.5">
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1 h-1 bg-emerald-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </span>
                typing...
              </span>
            ) : contact.isOnline ? (
              <span className="text-emerald-500">Online</span>
            ) : contact.lastSeen ? (
              <span className="text-zinc-500">Last seen {formatLastSeen(contact.lastSeen)}</span>
            ) : null}
            {isEncrypted && (
              <span className="flex items-center gap-1 text-zinc-500">
                <Lock className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500">E2E</span>
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <button
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="Voice call"
        >
          <Phone className="w-5 h-5" />
        </button>
        <button
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="Video call"
        >
          <Video className="w-5 h-5" />
        </button>
        <button
          className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
          title="More options"
        >
          <MoreVertical className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function formatLastSeen(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default ChatHeader;
