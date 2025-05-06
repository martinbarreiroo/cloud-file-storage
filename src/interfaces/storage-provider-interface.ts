export interface FileMetadata {
  id: string;
  filename: string;
  contentType: string;
  size: number;
  userId: string;
  path: string;
  provider: string;
  url?: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface StorageProvider {
  // Provider identification
  getProviderName(): string;
  isAvailable(): Promise<boolean>;

  uploadFile(
    file: Buffer,
    filename: string,
    contentType: string,
    userId: string,
    description?: string,
  ): Promise<FileMetadata>;
}
