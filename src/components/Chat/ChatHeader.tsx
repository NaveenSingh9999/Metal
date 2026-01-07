// Metal Chat Header Component
import { Shield, Phone, Lock, Video, MoreVertical } from 'lucide-react';
import type { Contact } from '../../types';

interface ChatHeaderProps {
  contact: Contact | null;
  isEncrypted: boolean;
}

export function ChatHeader({ contact, isEncrypted }: ChatHeaderProps) {
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
        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold">
          {contact.displayName.charAt(0).toUpperCase()}
        </div>
        <div>
          <h2 className="font-semibold text-white">{contact.displayName}</h2>
          <div className="flex items-center gap-1 text-xs text-zinc-500">
            {isEncrypted && (
              <>
                <Lock className="w-3 h-3 text-emerald-500" />
                <span className="text-emerald-500">End-to-end encrypted</span>
              </>
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

export default ChatHeader;
