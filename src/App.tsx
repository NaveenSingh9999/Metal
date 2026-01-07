// Metal - Secure Decentralized Messenger
import { useEffect } from 'react';
import { useAppStore } from './stores';
import { LoginScreen } from './components/Auth';
import { ChatView } from './components/Chat';
import { SettingsModal } from './components/Settings';
import { NewConversationModal } from './components/Modals';

function App() {
  const {
    isAuthenticated,
    hasExistingIdentity,
    currentUser,
    authError,
    conversations,
    contacts,
    messages,
    selectedConversationId,
    isSettingsOpen,
    isNewConversationOpen,
    settings,
    checkExistingIdentity,
    login,
    createIdentity,
    logout,
    selectConversation,
    sendMessage,
    addContact,
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
  }, [checkExistingIdentity]);

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
        selectedConversationId={selectedConversationId}
        onSelectConversation={selectConversation}
        onSendMessage={sendMessage}
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
        onDeleteAccount={deleteAccount}
        onExportData={handleExportData}
      />

      <NewConversationModal
        isOpen={isNewConversationOpen}
        onClose={closeNewConversation}
        contacts={contacts}
        onStartConversation={(contactId) => {
          startConversation(contactId);
          closeNewConversation();
        }}
        onAddContact={addContact}
      />
    </>
  );
}

export default App;
