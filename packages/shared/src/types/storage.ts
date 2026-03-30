/** Storage folder and upload types */

export interface StorageFolder {
  id: string
  tenantId: string
  parentId: string | null
  name: string
  slug: string
  position: number
  createdBy: string
  createdAt: Date
  updatedAt: Date
}

export interface StorageFolderTree extends StorageFolder {
  children: StorageFolderTree[]
  fileCount?: number
}

export interface Upload {
  id: string
  tenantId: string
  documentId: string | null
  folderId: string | null
  fileKey: string
  filename: string
  contentType: string
  sizeBytes: number
  uploadedBy: string
  createdAt: Date
}

export interface BulkMovePayload {
  fileIds: string[]
  folderIds: string[]
  targetFolderId: string | null // null = move to root
}

export interface BulkDeletePayload {
  fileIds: string[]
  folderIds: string[]
}
