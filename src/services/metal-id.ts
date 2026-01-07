// Metal ID Service - Unique 5-digit alphanumeric identifier system
import { squidCloud } from '../api/squid-cloud';

// Characters for Metal ID (avoid confusing characters like 0/O, 1/I/l)
const ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ID_LENGTH = 5;

export interface MetalUser {
  metalId: string;
  displayName: string;
  publicKey: string;
  createdAt: number;
  lastSeen?: number;
  isOnline?: boolean;
  location?: {
    latitude: number;
    longitude: number;
    accuracy: number;
  };
}

export interface UserPresence {
  metalId: string;
  isOnline: boolean;
  isTyping: boolean;
  lastSeen: number;
  currentConversationId?: string;
}

/**
 * Generate a random 5-character Metal ID
 */
export function generateMetalId(): string {
  const array = new Uint8Array(ID_LENGTH);
  crypto.getRandomValues(array);
  let id = '';
  for (let i = 0; i < ID_LENGTH; i++) {
    id += ID_CHARS[array[i] % ID_CHARS.length];
  }
  return id;
}

/**
 * Validate Metal ID format
 */
export function isValidMetalId(id: string): boolean {
  if (!id || id.length !== ID_LENGTH) return false;
  const upperCase = id.toUpperCase();
  return [...upperCase].every(char => ID_CHARS.includes(char));
}

/**
 * Format Metal ID for display (e.g., "ABC12" -> "ABC-12")
 */
export function formatMetalId(id: string): string {
  if (!id || id.length !== ID_LENGTH) return id;
  return `${id.slice(0, 3)}-${id.slice(3)}`;
}

/**
 * Parse Metal ID from display format
 */
export function parseMetalId(formatted: string): string {
  return formatted.replace(/-/g, '').toUpperCase();
}

class MetalIdService {
  private presenceInterval: ReturnType<typeof setInterval> | null = null;
  private typingTimeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private onPresenceUpdate: ((presence: Map<string, UserPresence>) => void) | null = null;
  private localPresence: UserPresence | null = null;
  private knownUsers: Map<string, MetalUser> = new Map();

  /**
   * Register user in the Metal network
   */
  async registerUser(user: MetalUser): Promise<void> {
    if (!squidCloud.isAuthenticated()) {
      console.warn('Squid Cloud not authenticated, skipping registration');
      return;
    }

    const userData = JSON.stringify({
      ...user,
      lastSeen: Date.now(),
      isOnline: true
    });

    try {
      // Store user data as a file in Squid Cloud
      const data = new TextEncoder().encode(userData);
      await squidCloud.uploadEncryptedData(
        data,
        `users/${user.metalId}.json`,
        'application/json'
      );
    } catch (error) {
      console.error('Failed to register user:', error);
    }
  }

  /**
   * Find user by Metal ID
   */
  async findUserByMetalId(metalId: string): Promise<MetalUser | null> {
    const normalizedId = parseMetalId(metalId);
    
    if (!isValidMetalId(normalizedId)) {
      throw new Error('Invalid Metal ID format');
    }

    // Check local cache first
    if (this.knownUsers.has(normalizedId)) {
      return this.knownUsers.get(normalizedId) || null;
    }

    if (!squidCloud.isAuthenticated()) {
      throw new Error('Not connected to Metal network');
    }

    try {
      // Try to find user file in Squid Cloud
      const files = await squidCloud.listFiles();
      const userFile = files.files.find(f => f.name === `users/${normalizedId}.json`);
      
      if (!userFile) {
        return null;
      }

      const data = await squidCloud.downloadAsBytes(userFile.id);
      const userData = JSON.parse(new TextDecoder().decode(data)) as MetalUser;
      
      // Cache the user
      this.knownUsers.set(normalizedId, userData);
      
      return userData;
    } catch (error) {
      console.error('Failed to find user:', error);
      return null;
    }
  }

  /**
   * Search users by display name (partial match)
   */
  async searchUsers(query: string): Promise<MetalUser[]> {
    if (!squidCloud.isAuthenticated()) {
      return [];
    }

    try {
      const files = await squidCloud.listFiles();
      const userFiles = files.files.filter(f => f.name.startsWith('users/') && f.name.endsWith('.json'));
      
      const users: MetalUser[] = [];
      
      for (const file of userFiles.slice(0, 50)) { // Limit to 50 users
        try {
          const data = await squidCloud.downloadAsBytes(file.id);
          const user = JSON.parse(new TextDecoder().decode(data)) as MetalUser;
          
          if (user.displayName.toLowerCase().includes(query.toLowerCase()) ||
              user.metalId.toLowerCase().includes(query.toLowerCase())) {
            users.push(user);
            this.knownUsers.set(user.metalId, user);
          }
        } catch {
          // Skip invalid files
        }
      }
      
      return users;
    } catch (error) {
      console.error('Failed to search users:', error);
      return [];
    }
  }

  /**
   * Find nearby users (within radius in km)
   */
  async findNearbyUsers(
    latitude: number,
    longitude: number,
    radiusKm: number = 50
  ): Promise<MetalUser[]> {
    if (!squidCloud.isAuthenticated()) {
      return [];
    }

    try {
      const files = await squidCloud.listFiles();
      const userFiles = files.files.filter(f => f.name.startsWith('users/') && f.name.endsWith('.json'));
      
      const nearbyUsers: MetalUser[] = [];
      
      for (const file of userFiles) {
        try {
          const data = await squidCloud.downloadAsBytes(file.id);
          const user = JSON.parse(new TextDecoder().decode(data)) as MetalUser;
          
          if (user.location) {
            const distance = this.calculateDistance(
              latitude, longitude,
              user.location.latitude, user.location.longitude
            );
            
            if (distance <= radiusKm) {
              nearbyUsers.push(user);
              this.knownUsers.set(user.metalId, user);
            }
          }
        } catch {
          // Skip invalid files
        }
      }
      
      return nearbyUsers.sort((a, b) => {
        const distA = this.calculateDistance(latitude, longitude, a.location!.latitude, a.location!.longitude);
        const distB = this.calculateDistance(latitude, longitude, b.location!.latitude, b.location!.longitude);
        return distA - distB;
      });
    } catch (error) {
      console.error('Failed to find nearby users:', error);
      return [];
    }
  }

  /**
   * Calculate distance between two coordinates in km (Haversine formula)
   */
  private calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371; // Earth's radius in km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  private toRad(deg: number): number {
    return deg * (Math.PI / 180);
  }

  /**
   * Start presence updates
   */
  startPresence(
    metalId: string,
    onUpdate: (presence: Map<string, UserPresence>) => void
  ): void {
    this.onPresenceUpdate = onUpdate;
    this.localPresence = {
      metalId,
      isOnline: true,
      isTyping: false,
      lastSeen: Date.now()
    };

    // Update presence every 30 seconds
    this.presenceInterval = setInterval(() => {
      this.updatePresence();
    }, 30000);

    // Initial update
    this.updatePresence();
  }

  /**
   * Stop presence updates
   */
  stopPresence(): void {
    if (this.presenceInterval) {
      clearInterval(this.presenceInterval);
      this.presenceInterval = null;
    }

    // Mark as offline
    if (this.localPresence) {
      this.localPresence.isOnline = false;
      this.localPresence.lastSeen = Date.now();
      this.updatePresence();
    }
  }

  /**
   * Set typing status
   */
  setTyping(conversationId: string, isTyping: boolean): void {
    if (!this.localPresence) return;

    this.localPresence.isTyping = isTyping;
    this.localPresence.currentConversationId = isTyping ? conversationId : undefined;

    // Clear typing after 5 seconds
    if (isTyping) {
      const existingTimeout = this.typingTimeouts.get(conversationId);
      if (existingTimeout) {
        clearTimeout(existingTimeout);
      }

      const timeout = setTimeout(() => {
        this.setTyping(conversationId, false);
        this.typingTimeouts.delete(conversationId);
      }, 5000);

      this.typingTimeouts.set(conversationId, timeout);
    }

    this.updatePresence();
  }

  /**
   * Update presence in cloud
   */
  private async updatePresence(): Promise<void> {
    if (!this.localPresence || !squidCloud.isAuthenticated()) return;

    try {
      const presenceData = JSON.stringify({
        ...this.localPresence,
        lastSeen: Date.now()
      });

      const data = new TextEncoder().encode(presenceData);
      await squidCloud.uploadEncryptedData(
        data,
        `presence/${this.localPresence.metalId}.json`,
        'application/json'
      );

      // Fetch other users' presence
      await this.fetchPresenceUpdates();
    } catch (error) {
      console.error('Failed to update presence:', error);
    }
  }

  /**
   * Fetch presence updates from cloud
   */
  private async fetchPresenceUpdates(): Promise<void> {
    if (!squidCloud.isAuthenticated()) return;

    try {
      const files = await squidCloud.listFiles();
      const presenceFiles = files.files.filter(
        f => f.name.startsWith('presence/') && f.name.endsWith('.json')
      );

      const presenceMap = new Map<string, UserPresence>();

      for (const file of presenceFiles) {
        try {
          const data = await squidCloud.downloadAsBytes(file.id);
          const presence = JSON.parse(new TextDecoder().decode(data)) as UserPresence;
          
          // Consider offline if last seen > 2 minutes ago
          const isOnline = Date.now() - presence.lastSeen < 120000;
          presence.isOnline = isOnline;
          
          presenceMap.set(presence.metalId, presence);
        } catch {
          // Skip invalid files
        }
      }

      if (this.onPresenceUpdate) {
        this.onPresenceUpdate(presenceMap);
      }
    } catch (error) {
      console.error('Failed to fetch presence:', error);
    }
  }

  /**
   * Get cached user
   */
  getCachedUser(metalId: string): MetalUser | null {
    return this.knownUsers.get(metalId) || null;
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.knownUsers.clear();
  }
}

export const metalIdService = new MetalIdService();
export default metalIdService;
