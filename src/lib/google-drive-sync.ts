/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { getGoogleAccessToken } from './google-auth';
import { clearDeleted, loadDeleted, loadIdeas, mergeIdeas, replaceIdeas, type Idea } from './ideas';

const BACKUP_FILE_NAME = 'afkari-backup.json';
const CACHED_FILE_ID_KEY = 'afkari.drive.fileId';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files';

export interface DriveSyncResult {
  success: boolean;
  message: string;
  restoredCount: number;
  uploadedCount: number;
  fileId?: string;
  timestamp?: number;
}

let lastSyncTimestamp: number | null = null;
export const getLastDriveSyncTime = (): number | null => lastSyncTimestamp;

/**
 * Locate existing backup file in user's Google Drive.
 * Uses cached file ID first, then searches with `spaces=drive` per drive.file scope requirements.
 */
async function findBackupFile(accessToken: string): Promise<{ id: string; modifiedTime?: string } | null> {
  // 1. Check cached file ID from previous creation
  const cachedId = localStorage.getItem(CACHED_FILE_ID_KEY);
  if (cachedId) {
    try {
      const checkRes = await fetch(`${DRIVE_API_URL}/${cachedId}?fields=id,name,trashed,modifiedTime`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (checkRes.ok) {
        const fileInfo = await checkRes.json();
        if (fileInfo.id && !fileInfo.trashed) {
          return { id: fileInfo.id, modifiedTime: fileInfo.modifiedTime };
        }
      } else if (checkRes.status === 404) {
        localStorage.removeItem(CACHED_FILE_ID_KEY);
      }
    } catch {
      // Fall through to query
    }
  }

  // 2. Query files created by this app (spaces=drive required for drive.file scope)
  try {
    const query = encodeURIComponent(`name = '${BACKUP_FILE_NAME}' and trashed = false`);
    const response = await fetch(`${DRIVE_API_URL}?spaces=drive&q=${query}&fields=files(id,name,modifiedTime)`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      const data = await response.json();
      const files = data.files || [];
      if (files.length > 0) {
        localStorage.setItem(CACHED_FILE_ID_KEY, files[0].id);
        return files[0];
      }
    } else {
      const errBody = await response.json().catch(() => ({}));
      console.warn('Google Drive search note:', response.status, errBody?.error?.message || response.statusText);
    }
  } catch (err) {
    console.warn('Google Drive search failed, will create file if needed:', err);
  }

  return null;
}

/**
 * Download backup content from Google Drive
 */
async function downloadBackupContent(fileId: string, accessToken: string): Promise<Idea[]> {
  const response = await fetch(`${DRIVE_API_URL}/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!response.ok) {
    throw new Error('تعذّر تنزيل ملف المقالات من Google Drive');
  }

  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/**
 * Upload new backup file to Google Drive using multipart upload
 */
async function createBackupFile(ideas: Idea[], accessToken: string): Promise<string> {
  const metadata = {
    name: BACKUP_FILE_NAME,
    mimeType: 'application/json',
    description: 'Thought Loom Articles & Ideas - مقالات وأفكار تطبيق أفكاري',
  };

  const boundary = '-------afkari_drive_boundary_' + Date.now();
  const delimiter = `\r\n--${boundary}\r\n`;
  const closeDelimiter = `\r\n--${boundary}--`;

  const body =
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(metadata) +
    delimiter +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    JSON.stringify(ideas, null, 2) +
    closeDelimiter;

  const response = await fetch(`${DRIVE_UPLOAD_URL}?uploadType=multipart`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody?.error?.message || `خطأ (${response.status})`;
    throw new Error(`تعذّر إنشاء ملف النسخة الاحتياطية على Google Drive: ${message}`);
  }

  const data = await response.json();
  if (data?.id) {
    localStorage.setItem(CACHED_FILE_ID_KEY, data.id);
  }
  return data.id;
}

/**
 * Update existing backup file content on Google Drive
 */
async function updateBackupFile(fileId: string, ideas: Idea[], accessToken: string): Promise<void> {
  const response = await fetch(`${DRIVE_UPLOAD_URL}/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
    },
    body: JSON.stringify(ideas, null, 2),
  });

  if (!response.ok) {
    const errBody = await response.json().catch(() => ({}));
    const message = errBody?.error?.message || `خطأ (${response.status})`;
    throw new Error(`تعذّر تحديث الملف على Google Drive: ${message}`);
  }
}

/**
 * Performs full two-way sync: merges Drive articles with local storage and pushes merged result
 */
export async function syncWithGoogleDrive(): Promise<DriveSyncResult> {
  const token = await getGoogleAccessToken();
  if (!token) {
    return {
      success: false,
      message: 'سجّل الدخول بحساب Google أولاً لتفعيل المزامنة.',
      restoredCount: 0,
      uploadedCount: 0,
    };
  }

  if (!navigator.onLine) {
    return {
      success: false,
      message: 'لا يوجد اتصال بالإنترنت حالياً.',
      restoredCount: 0,
      uploadedCount: 0,
    };
  }

  try {
    const local = loadIdeas();
    const deleted = loadDeleted();
    let merged = local;
    let restoredCount = 0;
    let fileId: string;

    const existingFile = await findBackupFile(token);

    if (existingFile) {
      fileId = existingFile.id;
      const remote = await downloadBackupContent(fileId, token);
      const localIds = new Set(local.map((i) => i.id));
      merged = mergeIdeas(local, remote, deleted);
      replaceIdeas(merged);
      restoredCount = merged.filter((i) => !localIds.has(i.id)).length;
      await updateBackupFile(fileId, merged, token);
    } else {
      fileId = await createBackupFile(local, token);
    }

    if (deleted.length) {
      clearDeleted(deleted);
    }

    lastSyncTimestamp = Date.now();
    window.dispatchEvent(new Event('afkari:ideas-changed'));

    return {
      success: true,
      message: restoredCount > 0 
        ? `تمت المزامنة بنجاح واستعادة ${restoredCount} فكرة من Google Drive ✓` 
        : `أفكارك ومقالاتك محفوظة ومحدثة على Google Drive ✓`,
      restoredCount,
      uploadedCount: merged.length,
      fileId,
      timestamp: lastSyncTimestamp,
    };
  } catch (error: any) {
    console.warn('Google Drive sync notice:', error?.message);
    return {
      success: false,
      message: error?.message || 'تعذّرت المزامنة مع Google Drive حالياً.',
      restoredCount: 0,
      uploadedCount: 0,
    };
  }
}

/**
 * Delete backup from Google Drive with mandatory user confirmation
 */
export async function deleteBackupFromGoogleDrive(
  confirmMessage: string = 'هل أنت متأكد من حذف نسخة Google Drive الاحتياطية؟ هذا الإجراء لا يمكن التراجع عنه.'
): Promise<boolean> {
  const token = await getGoogleAccessToken();
  if (!token) {
    throw new Error('غير مسجل الدخول');
  }

  const confirmed = window.confirm(confirmMessage);
  if (!confirmed) return false;

  const file = await findBackupFile(token);
  if (!file) return true;

  const res = await fetch(`${DRIVE_API_URL}/${file.id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok && res.status !== 404) {
    throw new Error('تعذّر حذف الملف من Google Drive');
  }

  localStorage.removeItem(CACHED_FILE_ID_KEY);
  return true;
}
