// Metal App Store - Main application state
import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../types';
import type { Message, Conversation, Contact, AppSettings } from '../types';
import { identityService } from '../auth/identity';
import type { UserIdentity } from '../auth/identity';
import { encryptedStorage } from '../storage/encrypted-db';
import { generateId } from '../crypto/utils';
import { metalIdService, formatMetalId } from '../services/metal-id';
import type { UserPresence } from '../services/metal-id';

interface AppState {
  // Auth state
  isAuthenticated: boolean;
  hasExistingIdentity: boolean;
  currentUser: UserIdentity | null;
  authError: string | null;

  // Chat state
  conversations: Conversation[];
  contacts: Contact[];
  messages: Record<string, Message[]>; // conversationId -> messages
  selectedConversationId: string | null;
  
  // Presence state
  presence: Map<string, UserPresence>;
  typingUsers: Map<string, string[]>; // conversationId -> metalIds

  // UI state
  isSettingsOpen: boolean;
  isNewConversationOpen: boolean;
  settings: AppSettings;

  // Actions
  checkExistingIdentity: () => Promise<void>;
  login: (password: string) => Promise<void>;
  createIdentity: (displayName: string, password: string, apiKey: string) => Promise<void>;
  logout: () => Promise<void>;
  
  selectConversation: (id: string | null) => void;
  sendMessage: (content: string, expiresIn?: number) => Promise<void>;
  setTyping: (isTyping: boolean) => void;
  
  addContactByMetalId: (metalId: string) => Promise<Contact>;
  findUserByMetalId: (metalId: string) => Promise<Contact | null>;
  findNearbyUsers: () => Promise<Contact[]>;
  addContact: (publicKey: string, displayName: string, metalId?: string) => Promise<void>;
  startConversation: (contactId: string) => Promise<string>;
  
  openSettings: () => void;
  closeSettings: () => void;
  updateSettings: (settings: Partial<AppSettings>) => Promise<void>;
  
  openNewConversation: () => void;
  closeNewConversation: () => void;
  
  loadData: () => Promise<void>;
  deleteAccount: () => Promise<void>;
  
  updatePresence: (presence: Map<string, UserPresence>) => void;
}

export const useAppStore = create<AppState>()((set, get) => ({
  // Initial state
  isAuthenticated: false,
  hasExistingIdentity: false,
  currentUser: null,
  authError: null,
  
  conversations: [],
  contacts: [],
  messages: {},
  selectedConversationId: null,
  
  presence: new Map(),
  typingUsers: new Map(),
  
  isSettingsOpen: false,
  isNewConversationOpen: false,
  settings: DEFAULT_SETTINGS,

  // Check if user has existing identity
  checkExistingIdentity: async () => {
    const hasIdentity = await identityService.hasIdentity();
    set({ hasExistingIdentity: hasIdentity });
  },

  // Login with password
  login: async (password: string) => {
    try {
      set({ authError: null });
      const user = await identityService.unlock(password);
      set({ isAuthenticated: true, currentUser: user });
      await get().loadData();
      
      // Start presence updates
      metalIdService.startPresence(user.metalId, get().updatePresence);
    } catch (error) {
      set({ authError: error instanceof Error ? error.message : 'Login failed' });
      throw error;
    }
  },

  // Create new identity
  createIdentity: async (displayName: string, password: string, apiKey: string) => {
    try {
      set({ authError: null });
      const user = await identityService.createIdentity(displayName, password, apiKey);
      set({ 
        isAuthenticated: true, 
        currentUser: user,
        hasExistingIdentity: true 
      });
      
      // Start presence updates
      metalIdService.startPresence(user.metalId, get().updatePresence);
    } catch (error) {
      set({ authError: error instanceof Error ? error.message : 'Failed to create identity' });
      throw error;
    }
  },

  // Logout
  logout: async () => {
    metalIdService.stopPresence();
    await identityService.lock();
    set({
      isAuthenticated: false,
      currentUser: null,
      conversations: [],
      contacts: [],
      messages: {},
      selectedConversationId: null,
      presence: new Map(),
      typingUsers: new Map()
    });
  },

  // Select conversation
  selectConversation: (id: string | null) => {
    set({ selectedConversationId: id });
  },

  // Send message
  sendMessage: async (content: string, expiresIn?: number) => {
    const { selectedConversationId, currentUser, messages, conversations } = get();
    if (!selectedConversationId || !currentUser) return;

    const message: Message = {
      id: generateId(),
      conversationId: selectedConversationId,
      senderId: currentUser.id,
      content,
      timestamp: Date.now(),
      type: 'text',
      status: 'sending',
      isEncrypted: true,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined
    };

    // Add to state
    const conversationMessages = messages[selectedConversationId] || [];
    set({
      messages: {
        ...messages,
        [selectedConversationId]: [...conversationMessages, message]
      }
    });

    // Update conversation
    const updatedConversations = conversations.map((conv: Conversation) => {
      if (conv.id === selectedConversationId) {
        return {
          ...conv,
          lastMessage: message,
          updatedAt: Date.now()
        };
      }
      return conv;
    });
    set({ conversations: updatedConversations });

    // Save to storage
    try {
      await encryptedStorage.saveMessage(
        message.id,
        message.conversationId,
        message,
        message.timestamp
      );

      // Update status to sent
      const currentMessages = get().messages[selectedConversationId] || [];
      set({
        messages: {
          ...get().messages,
          [selectedConversationId]: currentMessages.map((m: Message) =>
            m.id === message.id ? { ...m, status: 'sent' as const } : m
          )
        }
      });
    } catch (error) {
      // Update status to failed
      const currentMessages = get().messages[selectedConversationId] || [];
      set({
        messages: {
          ...get().messages,
          [selectedConversationId]: currentMessages.map((m: Message) =>
            m.id === message.id ? { ...m, status: 'failed' as const } : m
          )
        }
      });
    }
  },

  // Set typing status
  setTyping: (isTyping: boolean) => {
    const { selectedConversationId } = get();
    if (selectedConversationId) {
      metalIdService.setTyping(selectedConversationId, isTyping);
    }
  },

  // Add contact by Metal ID
  addContactByMetalId: async (metalId: string) => {
    const user = await metalIdService.findUserByMetalId(metalId);
    if (!user) {
      throw new Error(`User with Metal ID ${formatMetalId(metalId)} not found`);
    }

    // Check if contact already exists
    const { contacts } = get();
    const existing = contacts.find(c => c.metalId === user.metalId);
    if (existing) {
      return existing;
    }

    const contact: Contact = {
      id: generateId(),
      metalId: user.metalId,
      displayName: user.displayName,
      publicKey: user.publicKey,
      addedAt: Date.now(),
      lastSeen: user.lastSeen,
      isOnline: user.isOnline
    };

    await encryptedStorage.saveContact(contact.id, contact);
    set({ contacts: [...get().contacts, contact] });
    return contact;
  },

  // Find user by Metal ID (without adding)
  findUserByMetalId: async (metalId: string) => {
    const user = await metalIdService.findUserByMetalId(metalId);
    if (!user) return null;
    
    return {
      id: '',
      metalId: user.metalId,
      displayName: user.displayName,
      publicKey: user.publicKey,
      addedAt: 0,
      lastSeen: user.lastSeen,
      isOnline: user.isOnline
    } as Contact;
  },

  // Find nearby users
  findNearbyUsers: async () => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const users = await metalIdService.findNearbyUsers(
            position.coords.latitude,
            position.coords.longitude,
            50 // 50km radius
          );

          const contacts: Contact[] = users.map(user => ({
            id: '',
            metalId: user.metalId,
            displayName: user.displayName,
            publicKey: user.publicKey,
            addedAt: 0,
            lastSeen: user.lastSeen,
            isOnline: user.isOnline
          }));

          resolve(contacts);
        },
        (error) => {
          reject(new Error(`Location error: ${error.message}`));
        }
      );
    });
  },

  // Add contact (legacy method with Metal ID support)
  addContact: async (publicKey: string, displayName: string, metalId?: string) => {
    const contact: Contact = {
      id: generateId(),
      metalId: metalId || 'UNKNW',
      displayName,
      publicKey,
      addedAt: Date.now()
    };

    await encryptedStorage.saveContact(contact.id, contact);
    set({ contacts: [...get().contacts, contact] });
  },

  // Start conversation with contact
  startConversation: async (contactId: string) => {
    const { conversations, currentUser } = get();
    if (!currentUser) throw new Error('Not authenticated');

    // Check if conversation exists
    const existing = conversations.find(
      (conv: Conversation) => conv.participantIds.includes(contactId) && 
              conv.participantIds.includes(currentUser.id) &&
              !conv.isGroup
    );

    if (existing) {
      set({ selectedConversationId: existing.id });
      return existing.id;
    }

    // Create new conversation
    const conversation: Conversation = {
      id: generateId(),
      participantIds: [currentUser.id, contactId],
      unreadCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isGroup: false
    };

    set({
      conversations: [...conversations, conversation],
      selectedConversationId: conversation.id,
      messages: { ...get().messages, [conversation.id]: [] }
    });

    return conversation.id;
  },

  // Settings
  openSettings: () => set({ isSettingsOpen: true }),
  closeSettings: () => set({ isSettingsOpen: false }),
  
  updateSettings: async (newSettings: Partial<AppSettings>) => {
    const settings = { ...get().settings, ...newSettings };
    set({ settings });
    await encryptedStorage.saveSetting('app_settings', settings);
  },

  // New conversation modal
  openNewConversation: () => set({ isNewConversationOpen: true }),
  closeNewConversation: () => set({ isNewConversationOpen: false }),

  // Load data from storage
  loadData: async () => {
    try {
      // Load contacts
      const contacts = await encryptedStorage.getAllContacts<Contact>();
      
      // Load settings
      const settings = await encryptedStorage.getSetting<AppSettings>('app_settings');
      
      set({
        contacts,
        settings: settings || DEFAULT_SETTINGS
      });

      // TODO: Load conversations and messages
    } catch (error) {
      console.error('Failed to load data:', error);
    }
  },

  // Delete account
  deleteAccount: async () => {
    await identityService.deleteIdentity();
    set({
      isAuthenticated: false,
      hasExistingIdentity: false,
      currentUser: null,
      conversations: [],
      contacts: [],
      messages: {},
      selectedConversationId: null,
      settings: DEFAULT_SETTINGS,
      presence: new Map(),
      typingUsers: new Map()
    });
  },

  // Update presence from Metal network
  updatePresence: (newPresence: Map<string, UserPresence>) => {
    const { contacts, conversations } = get();
    
    // Update contacts with presence info
    const updatedContacts = contacts.map(contact => {
      const presence = newPresence.get(contact.metalId);
      if (presence) {
        return {
          ...contact,
          isOnline: presence.isOnline,
          isTyping: presence.isTyping,
          lastSeen: presence.lastSeen
        };
      }
      return contact;
    });

    // Build typing users map per conversation
    const typingUsers = new Map<string, string[]>();
    newPresence.forEach((presence, metalId) => {
      if (presence.isTyping && presence.currentConversationId) {
        const existing = typingUsers.get(presence.currentConversationId) || [];
        typingUsers.set(presence.currentConversationId, [...existing, metalId]);
      }
    });

    set({ 
      presence: newPresence, 
      contacts: updatedContacts,
      typingUsers 
    });
  }
}));

export default useAppStore;