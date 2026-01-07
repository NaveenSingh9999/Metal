// Metal - Secure Decentralized Messenger
import { useEffect } from 'react';
import { useAppStore } from './stores';
import { LoginScreen } from './components/Auth';
import { ChatView } from './components/Chat';
import { SettingsModal } from './components/Settings';
import { NewConversationModal } from './components/Modals';
import { Shield } from 'lucide-react';

function App() {
  const {
    isAuthenticated,
    hasExistingIdentity,
    isCheckingIdentity,
    currentUser,
    authError,
    conversations,
    contacts,
    messages,
    selectedConversationId,
    isSettingsOpen,
    isNewConversationOpen,
    settings,
    presence,
    checkExistingIdentity,
    login,
    createIdentity,
    logout,
    selectConversation,
    sendMessage,
    setTyping,
    addContactByMetalId,
    findNearbyUsers,
    startConversation,
    openSettings,
    closeSettings,
    updateSettings,
    openNewConversation,
    closeNewConversation,
    deleteAccount
  } = useAppStore();

  // Check for existing identity on mount
  useEffect(() => {
    checkExistingIdentity();
  }, []);

  // Get current conversation messages
  const currentMessages = selectedConversationId 
    ? messages[selectedConversationId] || []
    : [];

  // Export data handler
  const handleExportData = async () => {
    if (!currentUser) return;
    
    const exportData = {
      identity: {
        id: currentUser.id,
        displayName: currentUser.displayName,
        publicKey: currentUser.publicKey
      },
      contacts,
      conversations,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `metal-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get typing users for current conversation
  const typingContactIds = selectedConversationId 
    ? Array.from(presence.values())
        .filter(p => p.isTyping && p.currentConversationId === selectedConversationId)
        .map(p => p.metalId)
    : [];

  // Loading state while checking for existing identity
  if (isCheckingIdentity) {
    return (
      <div className="min-h-screen bg-zinc-950 flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center animate-pulse">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <p className="text-zinc-500">Loading...</p>
        </div>
      </div>
    );
  }

  // Not authenticated - show login
  if (!isAuthenticated) {
    return (
      <LoginScreen
        hasExistingIdentity={hasExistingIdentity}
        onLogin={login}
        onCreateIdentity={createIdentity}
        error={authError || undefined}
      />
    );
  }

  // Authenticated - show chat
  return (
    <>
      <ChatView
        conversations={conversations}
        contacts={contacts}
        messages={currentMessages}
        currentUserId={currentUser?.id || ''}
        currentMetalId={currentUser?.metalId}
        selectedConversationId={selectedConversationId}
        typingContactIds={typingContactIds}
        onSelectConversation={selectConversation}
        onSendMessage={sendMessage}
        onTyping={setTyping}
        onNewConversation={openNewConversation}
        onOpenSettings={openSettings}
        onLock={logout}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={closeSettings}
        settings={settings}
        onUpdateSettings={updateSettings}
        publicKey={currentUser?.publicKey || ''}
        metalId={currentUser?.metalId}
        onDeleteAccount={deleteAccount}
        onExportData={handleExportData}
      />

      <NewConversationModal
        isOpen={isNewConversationOpen}
        onClose={closeNewConversation}
        contacts={contacts}
        currentMetalId={currentUser?.metalId}
        onStartConversation={(contactId) => {
          startConversation(contactId);
          closeNewConversation();
        }}
        onAddContactByMetalId={addContactByMetalId}
        onFindNearbyUsers={findNearbyUsers}
      />
    </>
  );
}

export default App;
