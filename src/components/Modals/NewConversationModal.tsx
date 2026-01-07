// Metal New Conversation Modal - with Metal ID support
import { useState } from 'react';
import { X, UserPlus, Search, MapPin, Loader2, Hash, Copy, Check } from 'lucide-react';
import type { Contact } from '../../types';
import { formatMetalId, isValidMetalId, parseMetalId } from '../../services/metal-id';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  currentMetalId?: string;
  onStartConversation: (contactId: string) => void;
  onAddContactByMetalId: (metalId: string) => Promise<Contact>;
  onFindNearbyUsers: () => Promise<Contact[]>;
}

export function NewConversationModal({
  isOpen,
  onClose,
  contacts,
  currentMetalId,
  onStartConversation,
  onAddContactByMetalId,
  onFindNearbyUsers
}: NewConversationModalProps) {
  const [mode, setMode] = useState<'select' | 'add' | 'nearby'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [metalIdInput, setMetalIdInput] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [foundUser, setFoundUser] = useState<Contact | null>(null);
  const [nearbyUsers, setNearbyUsers] = useState<Contact[]>([]);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const filteredContacts = contacts.filter(c =>
    c.displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.metalId?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearchByMetalId = async () => {
    const normalized = parseMetalId(metalIdInput);
    
    if (!isValidMetalId(normalized)) {
      setError('Invalid Metal ID format. Expected 5 characters (e.g., ABC12)');
      return;
    }

    setIsSearching(true);
    setError('');
    setFoundUser(null);

    try {
      const contact = await onAddContactByMetalId(normalized);
      setFoundUser(contact);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'User not found');
    } finally {
      setIsSearching(false);
    }
  };

  const handleFindNearby = async () => {
    setIsSearching(true);
    setError('');
    setNearbyUsers([]);

    try {
      const users = await onFindNearbyUsers();
      setNearbyUsers(users);
      if (users.length === 0) {
        setError('No Metal users found nearby');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to find nearby users');
    } finally {
      setIsSearching(false);
    }
  };

  const handleCopyMetalId = async () => {
    if (currentMetalId) {
      await navigator.clipboard.writeText(currentMetalId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleStartWithFoundUser = () => {
    if (foundUser && foundUser.id) {
      onStartConversation(foundUser.id);
      onClose();
    }
  };

  const resetModal = () => {
    setMode('select');
    setSearchQuery('');
    setMetalIdInput('');
    setFoundUser(null);
    setNearbyUsers([]);
    setError('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'select' && 'New Conversation'}
            {mode === 'add' && 'Add by Metal ID'}
            {mode === 'nearby' && 'Find Nearby'}
          </h2>
          <button
            onClick={() => {
              resetModal();
              onClose();
            }}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Your Metal ID */}
        {currentMetalId && mode === 'select' && (
          <div className="px-4 pt-4">
            <div className="bg-zinc-800/50 rounded-lg p-3 flex items-center justify-between">
              <div>
                <div className="text-xs text-zinc-500 mb-1">Your Metal ID</div>
                <div className="font-mono text-lg font-bold text-emerald-400">
                  {formatMetalId(currentMetalId)}
                </div>
              </div>
              <button
                onClick={handleCopyMetalId}
                className="p-2 hover:bg-zinc-700 rounded-lg transition-colors"
                title="Copy Metal ID"
              >
                {copied ? (
                  <Check className="w-5 h-5 text-emerald-400" />
                ) : (
                  <Copy className="w-5 h-5 text-zinc-400" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Content */}
        <div className="p-4">
          {mode === 'select' ? (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search contacts or Metal ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-zinc-800 text-white pl-10 pr-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              {/* Contact List */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {filteredContacts.length === 0 ? (
                  <div className="text-center py-8 text-zinc-500">
                    <p>No contacts found</p>
                  </div>
                ) : (
                  filteredContacts.map(contact => (
                    <button
                      key={contact.id}
                      onClick={() => {
                        onStartConversation(contact.id);
                        onClose();
                      }}
                      className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-zinc-800 transition-colors"
                    >
                      <div className="relative">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                          {contact.displayName.charAt(0).toUpperCase()}
                        </div>
                        {contact.isOnline && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
                        )}
                      </div>
                      <div className="text-left flex-1">
                        <div className="font-medium text-white flex items-center gap-2">
                          {contact.displayName}
                          {contact.isTyping && (
                            <span className="text-xs text-emerald-400">typing...</span>
                          )}
                        </div>
                        <div className="text-xs text-zinc-500 font-mono">
                          {formatMetalId(contact.metalId)}
                        </div>
                      </div>
                      {contact.isOnline ? (
                        <span className="text-xs text-emerald-400">Online</span>
                      ) : contact.lastSeen ? (
                        <span className="text-xs text-zinc-500">
                          {formatLastSeen(contact.lastSeen)}
                        </span>
                      ) : null}
                    </button>
                  ))
                )}
              </div>

              {/* Action Buttons */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <button
                  onClick={() => setMode('add')}
                  className="p-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <Hash className="w-5 h-5" />
                  Add by ID
                </button>
                <button
                  onClick={() => {
                    setMode('nearby');
                    handleFindNearby();
                  }}
                  className="p-3 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors"
                >
                  <MapPin className="w-5 h-5" />
                  Find Nearby
                </button>
              </div>
            </>
          ) : mode === 'add' ? (
            <>
              {/* Add by Metal ID Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Enter Metal ID
                  </label>
                  <input
                    type="text"
                    value={metalIdInput}
                    onChange={(e) => setMetalIdInput(e.target.value.toUpperCase())}
                    placeholder="ABC12"
                    maxLength={6}
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none font-mono text-xl text-center tracking-widest uppercase"
                  />
                  <p className="mt-2 text-xs text-zinc-500 text-center">
                    Ask your contact for their 5-character Metal ID
                  </p>
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                {foundUser && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center text-white font-semibold text-lg">
                        {foundUser.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div className="font-medium text-white">{foundUser.displayName}</div>
                        <div className="text-sm text-emerald-400 font-mono">
                          {formatMetalId(foundUser.metalId)}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleStartWithFoundUser}
                      className="w-full mt-3 p-2 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium transition-colors"
                    >
                      Start Conversation
                    </button>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setMode('select');
                      setError('');
                      setFoundUser(null);
                      setMetalIdInput('');
                    }}
                    className="flex-1 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white font-medium transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleSearchByMetalId}
                    disabled={isSearching || metalIdInput.length < 5}
                    className="flex-1 p-3 bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:text-zinc-500 rounded-lg text-white font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {isSearching ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        <Search className="w-5 h-5" />
                        Search
                      </>
                    )}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Nearby Users */}
              <div className="space-y-4">
                {isSearching ? (
                  <div className="text-center py-8">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-3" />
                    <p className="text-zinc-400">Searching for nearby Metal users...</p>
                  </div>
                ) : error ? (
                  <div className="text-center py-8">
                    <MapPin className="w-8 h-8 text-zinc-600 mx-auto mb-3" />
                    <p className="text-zinc-400">{error}</p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto space-y-2">
                    {nearbyUsers.map((user, index) => (
                      <button
                        key={user.metalId || index}
                        onClick={async () => {
                          try {
                            const contact = await onAddContactByMetalId(user.metalId);
                            onStartConversation(contact.id);
                            onClose();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : 'Failed to add contact');
                          }
                        }}
                        className="w-full p-3 rounded-lg flex items-center gap-3 hover:bg-zinc-800 transition-colors"
                      >
                        <div className="relative">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white font-semibold">
                            {user.displayName.charAt(0).toUpperCase()}
                          </div>
                          {user.isOnline && (
                            <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-emerald-500 rounded-full border-2 border-zinc-900" />
                          )}
                        </div>
                        <div className="text-left flex-1">
                          <div className="font-medium text-white">{user.displayName}</div>
                          <div className="text-xs text-zinc-500 font-mono">
                            {formatMetalId(user.metalId)}
                          </div>
                        </div>
                        <UserPlus className="w-5 h-5 text-blue-400" />
                      </button>
                    ))}
                  </div>
                )}

                <button
                  onClick={() => {
                    setMode('select');
                    setError('');
                    setNearbyUsers([]);
                  }}
                  className="w-full p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white font-medium transition-colors"
                >
                  Back
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function formatLastSeen(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  
  if (diff < 60000) return 'Just now';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
  return `${Math.floor(diff / 86400000)}d ago`;
}

export default NewConversationModal;
