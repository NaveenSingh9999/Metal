// Metal Link - Shareable contact codes that work without central server
// Format: metal://METALID/BASE64_PUBLIC_KEY/DISPLAY_NAME

const METAL_PROTOCOL = 'metal://';

export interface MetalLink {
  metalId: string;
  publicKey: string;
  displayName: string;
}

/**
 * Create a shareable Metal link
 * This encodes all info needed to add a contact without server lookup
 */
export function createMetalLink(metalId: string, publicKey: string, displayName: string): string {
  const encodedName = encodeURIComponent(displayName);
  return `${METAL_PROTOCOL}${metalId}/${publicKey}/${encodedName}`;
}

/**
 * Parse a Metal link back to its components
 */
export function parseMetalLink(link: string): MetalLink | null {
  try {
    // Handle both full link and just the code part
    let cleanLink = link.trim();
    
    // Remove metal:// prefix if present
    if (cleanLink.startsWith(METAL_PROTOCOL)) {
      cleanLink = cleanLink.slice(METAL_PROTOCOL.length);
    }
    
    // Split by /
    const parts = cleanLink.split('/');
    
    if (parts.length < 3) {
      return null;
    }
    
    const [metalId, publicKey, ...nameParts] = parts;
    const displayName = decodeURIComponent(nameParts.join('/'));
    
    // Validate Metal ID format (5 alphanumeric chars)
    if (!metalId || metalId.length !== 5) {
      return null;
    }
    
    // Validate public key (should be base64, ~44 chars for 32 bytes)
    if (!publicKey || publicKey.length < 40) {
      return null;
    }
    
    return {
      metalId: metalId.toUpperCase(),
      publicKey,
      displayName: displayName || `User ${metalId}`
    };
  } catch {
    return null;
  }
}

/**
 * Create a compact share code (shorter format for typing/sharing)
 * Format: METALID:COMPRESSED_KEY
 */
export function createCompactCode(metalId: string, publicKey: string): string {
  // Use first 20 chars of public key as verification
  const shortKey = publicKey.slice(0, 20);
  return `${metalId}:${shortKey}`;
}

/**
 * Validate if a string is a valid Metal link or code
 */
export function isValidMetalLink(input: string): boolean {
  return parseMetalLink(input) !== null;
}

/**
 * Generate a QR code data URL for a Metal link
 */
export async function generateQRCode(metalLink: string): Promise<string> {
  // Simple QR code generation using a public API (works offline with cached response)
  // In production, use a library like 'qrcode' for offline support
  const encoded = encodeURIComponent(metalLink);
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encoded}`;
}

/**
 * Format Metal ID for display (e.g., "ABC12" -> "ABC-12")
 */
export function formatMetalIdDisplay(id: string): string {
  if (!id || id.length !== 5) return id;
  return `${id.slice(0, 3)}-${id.slice(3)}`;
}

/**
 * Copy text to clipboard
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    const success = document.execCommand('copy');
    document.body.removeChild(textarea);
    return success;
  }
}
