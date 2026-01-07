// Metal Squid Cloud API Client
// Encrypted cloud storage for message synchronization

const API_BASE_URL = 'https://aouqcwbdoyrccjcrhzzi.supabase.co/functions/v1/cloudbliss-api';

export interface SquidFile {
  id: string;
  name: string;
  size: number;
  type: string;
  created_at: string;
  encryption_key?: string;
}

export interface SquidFolder {
  id: string;
  name: string;
  created_at: string;
}

export interface FilesResponse {
  files: SquidFile[];
  folders: SquidFolder[];
  total_files: number;
  total_folders: number;
  success: boolean;
}

export interface FileMetadataResponse {
  file: SquidFile & {
    chunks: string[];
  };
  success: boolean;
}

export interface UploadResponse {
  file: SquidFile;
  success: boolean;
}

export interface StorageResponse {
  used: number;
  quota: number;
  success: boolean;
}

export interface ApiError {
  success: false;
  error: string;
  code: string;
}

class SquidCloudClient {
  private apiKey: string | null = null;

  /**
   * Set the API key for authentication
   */
  setApiKey(key: string): void {
    this.apiKey = key;
  }

  /**
   * Get the current API key
   */
  getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Check if client is authenticated
   */
  isAuthenticated(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Make an authenticated request
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    if (!this.apiKey) {
      throw new Error('API key not set. Call setApiKey() first.');
    }

    const url = `${API_BASE_URL}${endpoint}`;
    const headers = new Headers(options.headers);
    headers.set('X-SquidCloud-Key', this.apiKey);

    const response = await fetch(url, {
      ...options,
      headers
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || `Request failed: ${response.status}`);
    }

    return data as T;
  }

  /**
   * List all files and folders
   */
  async listFiles(): Promise<FilesResponse> {
    return this.request<FilesResponse>('/files');
  }

  /**
   * Get file metadata
   */
  async getFileMetadata(fileId: string): Promise<FileMetadataResponse> {
    return this.request<FileMetadataResponse>(`/files/${fileId}/metadata`);
  }

  /**
   * Download file content
   */
  async downloadFile(fileId: string): Promise<Blob> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const response = await fetch(`${API_BASE_URL}/files/${fileId}/download`, {
      headers: {
        'X-SquidCloud-Key': this.apiKey
      }
    });

    if (!response.ok) {
      throw new Error(`Download failed: ${response.status}`);
    }

    return response.blob();
  }

  /**
   * Upload a file
   */
  async uploadFile(
    file: Blob,
    name: string,
    folderId?: string
  ): Promise<UploadResponse> {
    if (!this.apiKey) {
      throw new Error('API key not set');
    }

    const formData = new FormData();
    formData.append('file', file, name);
    formData.append('name', name);
    if (folderId) {
      formData.append('folderId', folderId);
    }

    const response = await fetch(`${API_BASE_URL}/files/upload`, {
      method: 'POST',
      headers: {
        'X-SquidCloud-Key': this.apiKey
      },
      body: formData
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.error || 'Upload failed');
    }

    return data as UploadResponse;
  }

  /**
   * Upload encrypted data as a file
   */
  async uploadEncryptedData(
    data: Uint8Array,
    name: string,
    contentType: string = 'application/octet-stream'
  ): Promise<UploadResponse> {
    const blob = new Blob([data], { type: contentType });
    return this.uploadFile(blob, name);
  }

  /**
   * Download and return as Uint8Array
   */
  async downloadAsBytes(fileId: string): Promise<Uint8Array> {
    const blob = await this.downloadFile(fileId);
    const buffer = await blob.arrayBuffer();
    return new Uint8Array(buffer);
  }

  /**
   * Delete a file
   */
  async deleteFile(fileId: string): Promise<{ success: boolean; message: string }> {
    return this.request(`/files/${fileId}`, { method: 'DELETE' });
  }

  /**
   * Get storage statistics
   */
  async getStorageStats(): Promise<StorageResponse> {
    return this.request<StorageResponse>('/storage');
  }

  /**
   * List API keys
   */
  async listKeys(): Promise<{ keys: unknown[]; success: boolean }> {
    return this.request('/keys');
  }
}

// Singleton instance
export const squidCloud = new SquidCloudClient();

export default squidCloud;
