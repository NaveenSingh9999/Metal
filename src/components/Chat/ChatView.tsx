// Metal Chat View Component
import { Sidebar } from './Sidebar';
import { ChatHeader } from './ChatHeader';
import { MessageList } from './MessageList';
import { MessageInput } from './MessageInput';
import { Message, Conversation, Contact } from '../../types';

interface ChatViewProps {
  conversations: Conversation[];
  contacts: Contact[];
  messages: Message[];
  currentUserId: string;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onSendMessage: (content: string, expiresIn?: number) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
}

export function ChatView({
  conversations,
  contacts,
  messages,
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  onSendMessage,
  onNewConversation,
  onOpenSettings,
  onLock
}: ChatViewProps) {
  const selectedConversation = conversations.find(c => c.id === selectedConversationId);
  const currentContact = selectedConversation
    ? contacts.find(c => selectedConversation.participantIds.includes(c.id) && c.id !== currentUserId)
    : null;

  return (
    <div className="flex h-screen bg-zinc-950">
      <Sidebar
        conversations={conversations}
        contacts={contacts}
        currentUserId={currentUserId}
        selectedConversationId={selectedConversationId}
        onSelectConversation={onSelectConversation}
        onNewConversation={onNewConversation}
        onOpenSettings={onOpenSettings}
        onLock={onLock}
      />

      <div className="flex-1 flex flex-col">
        <ChatHeader
          contact={currentContact || null}
          isEncrypted={true}
        />

        {selectedConversationId ? (
          <>
            <MessageList
              messages={messages}
              currentUserId={currentUserId}
            />
            <MessageInput
              onSend={onSendMessage}
              disabled={!selectedConversationId}
            />
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center bg-zinc-950">
            <div className="text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-zinc-900 flex items-center justify-center">
                <svg className="w-12 h-12 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
              </div>
              <h2 className="text-2xl font-bold text-white mb-2">Metal Messenger</h2>
              <p className="text-zinc-500 max-w-sm">
                Select a conversation or start a new one. All messages are end-to-end encrypted.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default ChatView;
