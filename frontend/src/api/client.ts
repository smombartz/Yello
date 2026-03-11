const API_BASE = import.meta.env.PROD ? '' : 'http://localhost:3456';

export async function fetchApi<T>(endpoint: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    ...options?.headers as Record<string, string>,
  };

  // Only set Content-Type for requests with a body
  if (options?.body) {
    headers['Content-Type'] = 'application/json';
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies for auth
    headers,
  });

  if (!response.ok) {
    let errorMessage = `API error: ${response.status}`;
    try {
      const body = await response.json();
      if (body.error) errorMessage = body.error;
    } catch { /* keep default message */ }
    throw new Error(errorMessage);
  }

  return response.json();
}

export async function uploadFile(endpoint: string, file: File): Promise<unknown> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE}${endpoint}`, {
    method: 'POST',
    credentials: 'include', // Include cookies for auth
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload error: ${response.status}`);
  }

  return response.json();
}

export function uploadFileWithProgress(
  endpoint: string,
  file: File,
  onProgress: (percent: number) => void
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const formData = new FormData();
    formData.append('file', file);

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          resolve(JSON.parse(xhr.responseText));
        } catch {
          reject(new Error('Invalid response from server'));
        }
      } else {
        let msg = `Upload failed (${xhr.status})`;
        try {
          const body = JSON.parse(xhr.responseText);
          if (body.error) msg = body.error;
          else if (body.message) msg = body.message;
        } catch { /* keep default */ }
        if (xhr.status === 408) msg = 'Import timed out — the file may be too large to process. Try splitting it into smaller files.';
        if (xhr.status === 413) msg = 'File exceeds the 100 MB size limit.';
        if (xhr.status === 429) msg = 'Too many import requests. Wait a minute and try again.';
        if (xhr.status === 403) msg = 'Import is disabled for demo accounts.';
        reject(new Error(msg));
      }
    });

    xhr.addEventListener('error', () => reject(new Error('Network error — check your connection and try again.')));
    xhr.addEventListener('abort', () => reject(new Error('Upload cancelled.')));

    xhr.withCredentials = true;
    xhr.open('POST', `${API_BASE}${endpoint}`);
    xhr.send(formData);
  });
}

// Get the auth login URL
export function getGoogleLoginUrl(): string {
  return `${API_BASE}/api/auth/google`;
}

// Start a demo session
export async function startDemo(): Promise<{ success: boolean; isDemo: boolean }> {
  const response = await fetch(`${API_BASE}/api/auth/demo`, {
    method: 'POST',
    credentials: 'include',
  });
  if (!response.ok) {
    throw new Error('Failed to start demo');
  }
  return response.json();
}
