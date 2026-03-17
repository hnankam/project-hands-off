/**
 * Workspace Export Utilities
 *
 * Exports workspace files/folders as a ZIP archive for download.
 */

import { zipSync } from 'fflate';

export interface WorkspaceFileForExport {
  id: string;
  file_name: string;
  file_type: string;
  storage_url: string;
  folder: string | null;
}

/**
 * Fetches file content as Uint8Array for inclusion in zip.
 * Handles data URIs (fetches from API) and external URLs (fetches directly).
 */
async function getFileContent(
  file: WorkspaceFileForExport,
  baseURL: string,
  credentials: RequestCredentials = 'include'
): Promise<Uint8Array> {
  if (file.storage_url.startsWith('data:')) {
    const response = await fetch(`${baseURL}/api/workspace/files/${file.id}/content`, {
      credentials,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch content for ${file.file_name}`);
    }
    const data = await response.json();
    const content = data.content ?? '';
    return new TextEncoder().encode(typeof content === 'string' ? content : JSON.stringify(content));
  }

  const response = await fetch(file.storage_url, { credentials });
  if (!response.ok) {
    throw new Error(`Failed to fetch ${file.file_name}: ${response.status}`);
  }
  const blob = await response.blob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

/**
 * Builds the zip path for a file, preserving folder structure.
 * Root files go at top level; folder files go in folder/subfolder/...
 */
function getZipPath(file: WorkspaceFileForExport, folderPrefix: string | null): string {
  const normalizedFolder = file.folder && file.folder !== 'root' ? file.folder : null;
  if (!normalizedFolder) {
    return file.file_name;
  }
  // If exporting a specific folder, strip the prefix to get relative path
  if (folderPrefix) {
    if (normalizedFolder === folderPrefix) {
      return file.file_name;
    }
    if (normalizedFolder.startsWith(folderPrefix + '/')) {
      const relative = normalizedFolder.slice(folderPrefix.length + 1);
      return `${relative}/${file.file_name}`;
    }
    return `${normalizedFolder}/${file.file_name}`;
  }
  return `${normalizedFolder}/${file.file_name}`;
}

/**
 * Triggers a file download in the browser
 */
function downloadBlob(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Exports workspace files as a ZIP archive.
 *
 * @param files - Array of workspace files to include
 * @param baseURL - API base URL for fetching file content
 * @param options - Optional: folderPath to export only that folder (and subfolders), zipName for custom filename
 */
export async function exportWorkspaceAsZip(
  files: WorkspaceFileForExport[],
  baseURL: string,
  options?: {
    folderPath?: string | null;
    zipName?: string;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<void> {
  const { folderPath = null, zipName, onProgress } = options ?? {};

  // Filter files: if folderPath provided, include only files in that folder or its subfolders
  const filesToExport = folderPath
    ? files.filter(
        f =>
          (f.folder && f.folder === folderPath) ||
          (f.folder && f.folder.startsWith(folderPath + '/'))
      )
    : files.filter(f => f.file_name !== '.folder');

  if (filesToExport.length === 0) {
    throw new Error(
      folderPath ? 'No files in this folder to export.' : 'No files in workspace to export.'
    );
  }

  const total = filesToExport.length;
  const zipEntries: Record<string, Uint8Array> = {};

  for (let i = 0; i < filesToExport.length; i++) {
    const file = filesToExport[i];
    onProgress?.(i + 1, total);
    const content = await getFileContent(file, baseURL);
    const path = getZipPath(file, folderPath);
    zipEntries[path] = content;
  }

  const zipped = zipSync(zipEntries, { level: 1 });
  const blob = new Blob([zipped], { type: 'application/zip' });
  const safeName =
    zipName ??
    (folderPath ? `${folderPath.replace(/[/\\]/g, '-')}.zip` : 'workspace-export.zip');
  downloadBlob(safeName, blob);
}
