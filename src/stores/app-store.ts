// Metal App Store - Main application state
import { create } from 'zustand';
import { DEFAULT_SETTINGS } from '../types';
import type { Message, Conversation, Contact, AppSettings } from '../types';
import { identityService } from '../auth/identity';
import type { UserIdentity } from '../auth/identity';
import { encryptedStorage } from '../storage/encrypted-db';
import { generateId, base64ToBytes } from '../crypto/utils';
import { metalIdService } from '../services/metal-id';
import type { UserPresence } from '../services/metal-id';
import { parseMetalLink, createMetalLink, formatMetalIdDisplay } from '../services/metal-link';
import { messagingService } from '../services/messaging';

interface AppState {
  // Auth state
  isAuthenticated: boolean;
  hasExistingIdentity: boolean;
  isCheckingIdentity: boolean;
  currentUser: UserIdentity | null;
  authError: string | null;
  myMetalLink: string | null;  // Shareable link

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
  receiveMessage: (message: Message) => void;
  handleTypingIndicator: (metalId: string, isTyping: boolean) => void;
  
  addContactByMetalLink: (metalLink: string) => Promise<Contact>;
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
  isCheckingIdentity: true,
  myMetalLink: null,
  
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
    set({ isCheckingIdentity: true });
    try {
      const hasIdentity = await identityService.hasIdentity();
      set({ hasExistingIdentity: hasIdentity, isCheckingIdentity: false });
    } catch {
      set({ isCheckingIdentity: false });
    }
  },

  // Login with password
  login: async (password: string) => {
    try {
      set({ authError: null });
      const user = await identityService.unlock(password);
      
      // Generate shareable Metal Link
      const metalLink = createMetalLink(user.metalId, user.publicKey, user.displayName);
      
      set({ isAuthenticated: true, currentUser: user, myMetalLink: metalLink });
      await get().loadData();
      
      // Start presence updates
      metalIdService.startPresence(user.metalId, get().updatePresence);
      
      // Initialize messaging service
      const keyPair = identityService.getKeyPair();
      messagingService.initialize(
        user.metalId,
        keyPair.privateKey,
        get().receiveMessage,
        get().handleTypingIndicator
      );
      
      // Add all contact public keys to messaging service
      const { contacts } = get();
      for (const contact of contacts) {
        messagingService.addContactKey(contact.metalId, contact.publicKey);
      }
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
      
      // Generate shareable Metal Link
      const metalLink = createMetalLink(user.metalId, user.publicKey, displayName);
      
      set({ 
        isAuthenticated: true, 
        currentUser: user,
        hasExistingIdentity: true,
        myMetalLink: metalLink
      });
      
      // Start presence updates
      metalIdService.startPresence(user.metalId, get().updatePresence);
      
      // Initialize messaging service
      const keyPair = identityService.getKeyPair();
      messagingService.initialize(
        user.metalId,
        keyPair.privateKey,
        get().receiveMessage,
        get().handleTypingIndicator
      );
    } catch (error) {
      set({ authError: error instanceof Error ? error.message : 'Failed to create identity' });
      throw error;
    }
  },

  // Logout
  logout: async () => {
    metalIdService.stopPresence();
    messagingService.destroy();
    await identityService.lock();
    set({
      isAuthenticated: false,
      currentUser: null,
      myMetalLink: null,
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
    const { selectedConversationId, currentUser, messages, conversations, contacts } = get();
    if (!selectedConversationId || !currentUser) return;

    // Find the contact for this conversation
    const conversation = conversations.find(c => c.id === selectedConversationId);
    if (!conversation) return;
    
    const contactId = conversation.participantIds.find(id => id !== currentUser.id);
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    const message: Message = {
      id: generateId(),
      conversationId: selectedConversationId,
      senderId: currentUser.id,
      senderMetalId: currentUser.metalId,
      content,
      timestamp: Date.now(),
      type: 'text',
      status: 'sending',
      isEncrypted: true,
      expiresAt: expiresIn ? Date.now() + expiresIn * 1000 : undefined
    };

    // Add to state optimistically
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

    // Send via messaging service
    try {
      await messagingService.sendMessage(
        contact.metalId,
        contact.publicKey,
        content,
        selectedConversationId
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

      // Save to local storage
      await encryptedStorage.saveMessage(
        message.id,
        message.conversationId,
        { ...message, status: 'sent' },
        message.timestamp
      );
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
      console.error('Failed to send message:', error);
    }
  },

  // Receive message from messaging service
  receiveMessage: (message: Message) => {
    const { messages, conversations, contacts } = get();
    
    // Find or create conversation
    let conversation = conversations.find(c => c.id === message.conversationId);
    
    if (!conversation) {
      // Find the contact by Metal ID
      const contact = contacts.find(c => c.metalId === message.senderMetalId);
      if (contact) {
        // Create a new conversation
        conversation = {
          id: message.conversationId,
          participantIds: [contact.id, message.senderId],
          unreadCount: 1,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isGroup: false,
          lastMessage: message
        };
        set({ conversations: [...conversations, conversation] });
      }
    } else {
      // Update existing conversation
      const updatedConversations = conversations.map((conv: Conversation) => {
        if (conv.id === message.conversationId) {
          return {
            ...conv,
            lastMessage: message,
            updatedAt: Date.now(),
            unreadCount: conv.unreadCount + 1
          };
        }
        return conv;
      });
      set({ conversations: updatedConversations });
    }

    // Add message to state
    const conversationMessages = messages[message.conversationId] || [];
    set({
      messages: {
        ...messages,
        [message.conversationId]: [...conversationMessages, message]
      }
    });

    // Save to local storage
    encryptedStorage.saveMessage(
      message.id,
      message.conversationId,
      message,
      message.timestamp
    ).catch(console.error);

    // Play notification sound if enabled
    // TODO: Add sound notification
  },

  // Handle typing indicator from messaging service
  handleTypingIndicator: (metalId: string, isTyping: boolean) => {
    const { contacts, conversations, typingUsers } = get();
    
    // Find the contact and their conversation
    const contact = contacts.find(c => c.metalId === metalId);
    if (!contact) return;
    
    const conversation = conversations.find(c => 
      c.participantIds.includes(contact.id) && !c.isGroup
    );
    if (!conversation) return;

    const currentTyping = typingUsers.get(conversation.id) || [];
    
    if (isTyping && !currentTyping.includes(metalId)) {
      typingUsers.set(conversation.id, [...currentTyping, metalId]);
    } else if (!isTyping) {
      typingUsers.set(conversation.id, currentTyping.filter(id => id !== metalId));
    }
    
    set({ typingUsers: new Map(typingUsers) });
  },

  // Set typing status
  setTyping: (isTyping: boolean) => {
    const { selectedConversationId, conversations, contacts, currentUser } = get();
    if (!selectedConversationId || !currentUser) return;
    
    // Find the contact in this conversation
    const conversation = conversations.find(c => c.id === selectedConversationId);
    if (!conversation) return;
    
    const contactId = conversation.participantIds.find(id => id !== currentUser.id);
    const contact = contacts.find(c => c.id === contactId);
    if (!contact) return;

    // Send typing indicator via messaging service
    messagingService.sendTypingIndicator(contact.metalId, isTyping).catch(() => {});
  },

  // Add contact by Metal Link (contains all info, no server needed!)
  addContactByMetalLink: async (metalLink: string) => {
    const parsed = parseMetalLink(metalLink);
    if (!parsed) {
      throw new Error('Invalid Metal Link format');
    }

    const { contacts, currentUser } = get();
    
    // Don't add yourself
    if (currentUser && parsed.metalId === currentUser.metalId) {
      throw new Error('Cannot add yourself as a contact');
    }

    // Check if contact already exists
    const existing = contacts.find(c => c.metalId === parsed.metalId);
    if (existing) {
      return existing;
    }

    const contact: Contact = {
      id: generateId(),
      metalId: parsed.metalId,
      displayName: parsed.displayName,
      publicKey: parsed.publicKey,
      addedAt: Date.now()
    };

    // Add to messaging service
    messagingService.addContactKey(contact.metalId, contact.publicKey);

    await encryptedStorage.saveContact(contact.id, contact);
    set({ contacts: [...get().contacts, contact] });
    return contact;
  },

  // Add contact by Metal ID (requires server lookup)
  addContactByMetalId: async (metalId: string) => {
    const user = await metalIdService.findUserByMetalId(metalId);
    if (!user) {
      throw new Error(`User with Metal ID ${formatMetalIdDisplay(metalId)} not found. Try using their full Metal Link instead.`);
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