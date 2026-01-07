// Metal Sidebar Component
import { useState } from 'react';
import { 
  MessageSquare, 
  Users, 
  Settings, 
  Plus, 
  Search,
  Lock,
  Shield
} from 'lucide-react';
import { Conversation, Contact } from '../../types';

interface SidebarProps {
  conversations: Conversation[];
  contacts: Contact[];
  currentUserId: string;
  selectedConversationId: string | null;
  onSelectConversation: (id: string) => void;
  onNewConversation: () => void;
  onOpenSettings: () => void;
  onLock: () => void;
}

export function Sidebar({
  conversations,
  contacts,
  currentUserId,
  selectedConversationId,
  onSelectConversation,
  onNewConversation,
  onOpenSettings,
  onLock
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'chats' | 'contacts'>('chats');

  const getContactName = (participantIds: string[]) => {
    const otherId = participantIds.find(id => id !== currentUserId);
    const contact = contacts.find(c => c.id === otherId);
    return contact?.displayName || 'Unknown';
  };

  const filteredConversations = conversations.filter(conv => {
    const name = getContactName(conv.participantIds);
    return name.toLowerCase().includes(searchQuery.toLowerCase());
  });

  const filteredContacts = contacts.filter(contact =>
    contact.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="w-80 bg-zinc-900 border-r border-zinc-800 flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Shield className="w-6 h-6 text-emerald-500" />
            <h1 className="text-xl font-bold text-white">Metal</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onLock}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Lock"
            >
              <Lock className="w-5 h-5 text-zinc-400" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-2 hover:bg-zinc-800 rounded-lg transition-colors"
              title="Settings"
            >
              <Settings className="w-5 h-5 text-zinc-400" />
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
          <input
            type="text"
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-zinc-800 text-white pl-10 pr-4 py-2 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-zinc-800">
        <button
          onClick={() => setActiveTab('chats')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'chats'
              ? 'text-emerald-500 border-b-2 border-emerald-500'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          Chats
        </button>
        <button
          onClick={() => setActiveTab('contacts')}
          className={`flex-1 py-3 text-sm font-medium flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'contacts'
              ? 'text-emerald-500 border-b-2 border-emerald-500'
              : 'text-zinc-400 hover:text-white'
          }`}
        >
          <Users className="w-4 h-4" />
          Contacts
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {activeTab === 'chats' ? (
          <div className="p-2">
            {filteredConversations.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No conversations yet</p>
                <button
                  onClick={onNewConversation}
                  className="mt-2 text-emerald-500 hover:underline"
                >
                  Start a new chat
                </button>
              </div>
            ) : (
              filteredConversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => onSelectConversation(conv.id)}
                  className={`w-full p-3 rounded-lg mb-1 flex items-center gap-3 transition-colors ${
                    selectedConversationId === conv.id
                      ? 'bg-emerald-600/20 text-white'
                      : 'hover:bg-zinc-800 text-zinc-300'
                  }`}
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold">
                    {getContactName(conv.participantIds).charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 text-left">
                    <div className="font-medium">
                      {conv.isGroup ? conv.groupName : getContactName(conv.participantIds)}
                    </div>
                    {conv.lastMessage && (
                      <div className="text-sm text-zinc-500 truncate">
                        {conv.lastMessage.content}
                      </div>
                    )}
                  </div>
                  {conv.unreadCount > 0 && (
                    <span className="bg-emerald-500 text-white text-xs px-2 py-1 rounded-full">
                      {conv.unreadCount}
                    </span>
                  )}
                </button>
              ))
            )}
          </div>
        ) : (
          <div className="p-2">
            {filteredContacts.length === 0 ? (
              <div className="text-center py-8 text-zinc-500">
                <Users className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>No contacts yet</p>
              </div>
            ) : (
              filteredContacts.map(contact => (
                <div
                  key={contact.id}
                  className="p-3 rounded-lg mb-1 flex items-center gap-3 hover:bg-zinc-800 cursor-pointer"
                >
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                    {contact.displayName.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white">{contact.displayName}</div>
                    <div className="text-xs text-zinc-500 font-mono truncate">
                      {contact.publicKey.slice(0, 16)}...
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* New Chat Button */}
      <div className="p-4 border-t border-zinc-800">
        <button
          onClick={onNewConversation}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
        >
          <Plus className="w-5 h-5" />
          New Conversation
        </button>
      </div>
    </div>
  );
}

export default Sidebar;
