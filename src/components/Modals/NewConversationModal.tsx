// Metal New Conversation Modal
import { useState } from 'react';
import { X, UserPlus, Search } from 'lucide-react';
import type { Contact } from '../../types';

interface NewConversationModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: Contact[];
  onStartConversation: (contactId: string) => void;
  onAddContact: (publicKey: string, displayName: string) => void;
}

export function NewConversationModal({
  isOpen,
  onClose,
  contacts,
  onStartConversation,
  onAddContact
}: NewConversationModalProps) {
  const [mode, setMode] = useState<'select' | 'add'>('select');
  const [searchQuery, setSearchQuery] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newContactKey, setNewContactKey] = useState('');
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const filteredContacts = contacts.filter(c =>
    c.displayName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleAddContact = () => {
    if (!newContactName.trim() || !newContactKey.trim()) {
      setError('Name and public key are required');
      return;
    }
    
    try {
      onAddContact(newContactKey.trim(), newContactName.trim());
      setNewContactName('');
      setNewContactKey('');
      setMode('select');
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add contact');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-zinc-900 rounded-2xl border border-zinc-800 w-full max-w-md">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <h2 className="text-lg font-semibold text-white">
            {mode === 'select' ? 'New Conversation' : 'Add Contact'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {mode === 'select' ? (
            <>
              {/* Search */}
              <div className="relative mb-4">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Search contacts..."
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
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white font-semibold">
                        {contact.displayName.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <div className="font-medium text-white">{contact.displayName}</div>
                        <div className="text-xs text-zinc-500 font-mono truncate max-w-48">
                          {contact.publicKey.slice(0, 24)}...
                        </div>
                      </div>
                    </button>
                  ))
                )}
              </div>

              {/* Add Contact Button */}
              <button
                onClick={() => setMode('add')}
                className="w-full mt-4 p-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-5 h-5" />
                Add New Contact
              </button>
            </>
          ) : (
            <>
              {/* Add Contact Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Display Name
                  </label>
                  <input
                    type="text"
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Contact name"
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-zinc-400 mb-2">
                    Public Key
                  </label>
                  <textarea
                    value={newContactKey}
                    onChange={(e) => setNewContactKey(e.target.value)}
                    placeholder="Paste contact's public key"
                    rows={3}
                    className="w-full bg-zinc-800 text-white px-4 py-3 rounded-lg border border-zinc-700 focus:border-emerald-500 focus:outline-none font-mono text-sm resize-none"
                  />
                </div>

                {error && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                    {error}
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setMode('select');
                      setError('');
                    }}
                    className="flex-1 p-3 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-white font-medium transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleAddContact}
                    className="flex-1 p-3 bg-emerald-600 hover:bg-emerald-700 rounded-lg text-white font-medium transition-colors"
                  >
                    Add Contact
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default NewConversationModal;
