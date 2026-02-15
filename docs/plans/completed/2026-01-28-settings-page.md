# Settings Page Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a Settings view with user profile management, contact export, and danger zone features.

**Architecture:** Three-section settings page (Profile, Export, Danger Zone) with backend persistence via new `user_settings` table. Frontend follows existing view pattern (like ArchivedView). Profile stores name, email, phone, avatar URL, website, and LinkedIn URL.

**Tech Stack:** React + TanStack Query (frontend), Fastify + SQLite (backend), TypeBox schemas

---

## Task 1: Backend - Create user_settings table

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/services/database.ts`

**Step 1: Add user_settings table creation**

Add after the existing table creation (around line 168, after the indexes):

```typescript
    CREATE TABLE IF NOT EXISTS user_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      name TEXT,
      email TEXT,
      phone TEXT,
      avatar_url TEXT,
      website TEXT,
      linkedin_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Insert default row if not exists
    INSERT OR IGNORE INTO user_settings (id) VALUES (1);
```

**Step 2: Run backend to verify migration**

Run: `cd "/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude" && npm run dev`
Expected: Server starts without errors, database migrates

**Step 3: Commit**

```bash
git add backend/src/services/database.ts
git commit -m "$(cat <<'EOF'
feat(backend): add user_settings table for profile storage

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Backend - Create settings API routes

**Files:**
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/settings.ts`
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/schemas/settings.ts`
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/server.ts`

**Step 1: Create settings schema**

Create `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/schemas/settings.ts`:

```typescript
import { Type, Static } from '@sinclair/typebox';

export const UserSettingsSchema = Type.Object({
  name: Type.Union([Type.String(), Type.Null()]),
  email: Type.Union([Type.String(), Type.Null()]),
  phone: Type.Union([Type.String(), Type.Null()]),
  avatarUrl: Type.Union([Type.String(), Type.Null()]),
  website: Type.Union([Type.String(), Type.Null()]),
  linkedinUrl: Type.Union([Type.String(), Type.Null()]),
});

export type UserSettings = Static<typeof UserSettingsSchema>;

export const UpdateUserSettingsSchema = Type.Partial(UserSettingsSchema);

export type UpdateUserSettings = Static<typeof UpdateUserSettingsSchema>;
```

**Step 2: Create settings routes**

Create `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/settings.ts`:

```typescript
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { getDatabase } from '../services/database.js';
import {
  UserSettingsSchema,
  UpdateUserSettingsSchema,
  UpdateUserSettings
} from '../schemas/settings.js';

interface SettingsRow {
  id: number;
  name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  website: string | null;
  linkedin_url: string | null;
  created_at: string;
  updated_at: string;
}

export default async function settingsRoutes(
  fastify: FastifyInstance,
  _opts: FastifyPluginOptions
): Promise<void> {
  // GET /api/settings - Get user settings
  fastify.get('/', {
    schema: {
      response: {
        200: UserSettingsSchema
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();
    const settings = db.prepare(`
      SELECT name, email, phone, avatar_url, website, linkedin_url
      FROM user_settings
      WHERE id = 1
    `).get() as SettingsRow | undefined;

    return {
      name: settings?.name ?? null,
      email: settings?.email ?? null,
      phone: settings?.phone ?? null,
      avatarUrl: settings?.avatar_url ?? null,
      website: settings?.website ?? null,
      linkedinUrl: settings?.linkedin_url ?? null,
    };
  });

  // PUT /api/settings - Update user settings
  fastify.put<{ Body: UpdateUserSettings }>('/', {
    schema: {
      body: UpdateUserSettingsSchema,
      response: {
        200: UserSettingsSchema
      }
    }
  }, async (request, _reply) => {
    const updates = request.body;
    const db = getDatabase();

    const fields: string[] = [];
    const values: (string | null)[] = [];

    if (updates.name !== undefined) {
      fields.push('name = ?');
      values.push(updates.name);
    }
    if (updates.email !== undefined) {
      fields.push('email = ?');
      values.push(updates.email);
    }
    if (updates.phone !== undefined) {
      fields.push('phone = ?');
      values.push(updates.phone);
    }
    if (updates.avatarUrl !== undefined) {
      fields.push('avatar_url = ?');
      values.push(updates.avatarUrl);
    }
    if (updates.website !== undefined) {
      fields.push('website = ?');
      values.push(updates.website);
    }
    if (updates.linkedinUrl !== undefined) {
      fields.push('linkedin_url = ?');
      values.push(updates.linkedinUrl);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      const sql = `UPDATE user_settings SET ${fields.join(', ')} WHERE id = 1`;
      db.prepare(sql).run(...values);
    }

    const settings = db.prepare(`
      SELECT name, email, phone, avatar_url, website, linkedin_url
      FROM user_settings
      WHERE id = 1
    `).get() as SettingsRow;

    return {
      name: settings.name,
      email: settings.email,
      phone: settings.phone,
      avatarUrl: settings.avatar_url,
      website: settings.website,
      linkedinUrl: settings.linkedin_url,
    };
  });
}
```

**Step 3: Register routes in server.ts**

Add import at top of server.ts:
```typescript
import settingsRoutes from './routes/settings.js';
```

Add route registration (after other routes):
```typescript
  fastify.register(settingsRoutes, { prefix: '/api/settings' });
```

**Step 4: Test API with curl**

Run: `curl http://localhost:3000/api/settings`
Expected: `{"name":null,"email":null,"phone":null,"avatarUrl":null,"website":null,"linkedinUrl":null}`

Run: `curl -X PUT http://localhost:3000/api/settings -H "Content-Type: application/json" -d '{"name":"Test User"}'`
Expected: `{"name":"Test User","email":null,...}`

**Step 5: Commit**

```bash
git add backend/src/schemas/settings.ts backend/src/routes/settings.ts backend/src/server.ts
git commit -m "$(cat <<'EOF'
feat(backend): add settings API endpoints

- GET /api/settings returns user profile
- PUT /api/settings updates user profile

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Frontend - Create settings types and API hooks

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/api/types.ts`
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/api/settingsHooks.ts`

**Step 1: Add settings types**

Add at end of types.ts:

```typescript
// Settings types
export interface UserSettings {
  name: string | null;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  website: string | null;
  linkedinUrl: string | null;
}

export interface UpdateUserSettingsRequest {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  avatarUrl?: string | null;
  website?: string | null;
  linkedinUrl?: string | null;
}
```

**Step 2: Create settings hooks**

Create `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/api/settingsHooks.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from './client';
import type { UserSettings, UpdateUserSettingsRequest } from './types';

export function useUserSettings() {
  return useQuery({
    queryKey: ['userSettings'],
    queryFn: () => fetchApi<UserSettings>('/api/settings'),
  });
}

export function useUpdateUserSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: UpdateUserSettingsRequest) =>
      fetchApi<UserSettings>('/api/settings', {
        method: 'PUT',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userSettings'] });
    },
  });
}

export function exportAllContacts(): void {
  window.open('/api/contacts/export/vcf', '_blank');
}
```

**Step 3: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/settingsHooks.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add settings types and API hooks

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Backend - Add contacts export endpoint

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/contacts.ts`

**Step 1: Add export VCF endpoint**

Add at end of contacts.ts (before the closing `}`):

```typescript
  // GET /api/contacts/export/vcf - Export all contacts as VCF
  fastify.get('/export/vcf', async (_request, reply) => {
    const db = getDatabase();

    const contacts = db.prepare(`
      SELECT raw_vcard FROM contacts WHERE raw_vcard IS NOT NULL
    `).all() as Array<{ raw_vcard: string }>;

    const vcfContent = contacts.map(c => c.raw_vcard).join('\n');

    reply.header('Content-Type', 'text/vcard');
    reply.header('Content-Disposition', 'attachment; filename="contacts.vcf"');
    return vcfContent;
  });
```

**Step 2: Test export**

Run: `curl http://localhost:3000/api/contacts/export/vcf -o test.vcf`
Expected: File downloads with VCF content

**Step 3: Commit**

```bash
git add backend/src/routes/contacts.ts
git commit -m "$(cat <<'EOF'
feat(backend): add contacts VCF export endpoint

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Backend - Add delete all contacts endpoint

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/backend/src/routes/contacts.ts`

**Step 1: Add delete all endpoint**

Add in contacts.ts:

```typescript
  // DELETE /api/contacts/all - Delete all contacts (danger zone)
  fastify.delete('/all', {
    schema: {
      response: {
        200: {
          type: 'object',
          properties: {
            deletedCount: { type: 'number' }
          }
        }
      }
    }
  }, async (_request, _reply) => {
    const db = getDatabase();

    const countResult = db.prepare('SELECT COUNT(*) as count FROM contacts').get() as { count: number };
    const count = countResult.count;

    db.prepare('DELETE FROM contacts').run();
    db.prepare('DELETE FROM contacts_unified_fts').run();

    return { deletedCount: count };
  });
```

**Step 2: Commit**

```bash
git add backend/src/routes/contacts.ts
git commit -m "$(cat <<'EOF'
feat(backend): add delete all contacts endpoint

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Frontend - Add delete all contacts hook

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/api/settingsHooks.ts`

**Step 1: Add delete mutation**

Add to settingsHooks.ts:

```typescript
export function useDeleteAllContacts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      fetchApi<{ deletedCount: number }>('/api/contacts/all', {
        method: 'DELETE',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contacts'] });
      queryClient.invalidateQueries({ queryKey: ['contactCount'] });
    },
  });
}
```

**Step 2: Commit**

```bash
git add frontend/src/api/settingsHooks.ts
git commit -m "$(cat <<'EOF'
feat(frontend): add delete all contacts hook

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Frontend - Create SettingsView component

**Files:**
- Create: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/components/SettingsView.tsx`

**Step 1: Create the component**

```typescript
import { useState, useCallback, useEffect } from 'react';
import {
  useUserSettings,
  useUpdateUserSettings,
  useDeleteAllContacts,
  exportAllContacts
} from '../api/settingsHooks';

interface SettingsViewProps {
  onBack: () => void;
}

interface ToastState {
  message: string;
  type: 'success' | 'error';
  timeout: ReturnType<typeof setTimeout>;
}

export function SettingsView({ onBack: _onBack }: SettingsViewProps) {
  const { data: settings, isLoading } = useUserSettings();
  const updateMutation = useUpdateUserSettings();
  const deleteMutation = useDeleteAllContacts();

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    avatarUrl: '',
    website: '',
    linkedinUrl: '',
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');
  const [toast, setToast] = useState<ToastState | null>(null);

  // Sync form with loaded settings
  useEffect(() => {
    if (settings) {
      setFormData({
        name: settings.name ?? '',
        email: settings.email ?? '',
        phone: settings.phone ?? '',
        avatarUrl: settings.avatarUrl ?? '',
        website: settings.website ?? '',
        linkedinUrl: settings.linkedinUrl ?? '',
      });
    }
  }, [settings]);

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const showToast = useCallback((message: string, type: 'success' | 'error') => {
    if (toast?.timeout) {
      clearTimeout(toast.timeout);
    }
    const timeout = setTimeout(() => setToast(null), 5000);
    setToast({ message, type, timeout });
  }, [toast]);

  const handleInputChange = useCallback((field: keyof typeof formData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  const handleSaveProfile = useCallback(() => {
    updateMutation.mutate({
      name: formData.name || null,
      email: formData.email || null,
      phone: formData.phone || null,
      avatarUrl: formData.avatarUrl || null,
      website: formData.website || null,
      linkedinUrl: formData.linkedinUrl || null,
    }, {
      onSuccess: () => {
        showToast('Profile saved successfully', 'success');
      },
      onError: () => {
        showToast('Failed to save profile', 'error');
      }
    });
  }, [formData, updateMutation, showToast]);

  const handleExport = useCallback(() => {
    exportAllContacts();
    showToast('Export started - check your downloads', 'success');
  }, [showToast]);

  const handleDeleteAll = useCallback(() => {
    if (deleteConfirmText !== 'DELETE') return;

    deleteMutation.mutate(undefined, {
      onSuccess: (result) => {
        showToast(`Deleted ${result.deletedCount} contacts`, 'success');
        setShowDeleteConfirm(false);
        setDeleteConfirmText('');
      },
      onError: () => {
        showToast('Failed to delete contacts', 'error');
      }
    });
  }, [deleteConfirmText, deleteMutation, showToast]);

  if (isLoading) {
    return (
      <div className="settings-view">
        <div className="settings-loading">
          <span className="material-symbols-outlined spinning">sync</span>
          <p>Loading settings...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="settings-view">
      <div className="settings-header">
        <h1>Settings</h1>
      </div>

      <div className="settings-content">
        {/* Profile Section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="material-symbols-outlined">person</span>
            <h2>Profile</h2>
          </div>
          <div className="settings-section-content">
            <div className="settings-form">
              <div className="form-group">
                <label htmlFor="name">Name</label>
                <input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange('name', e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="form-group">
                <label htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleInputChange('email', e.target.value)}
                  placeholder="your@email.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  placeholder="+1 234 567 8900"
                />
              </div>
              <div className="form-group">
                <label htmlFor="website">Website</label>
                <input
                  id="website"
                  type="url"
                  value={formData.website}
                  onChange={(e) => handleInputChange('website', e.target.value)}
                  placeholder="https://yourwebsite.com"
                />
              </div>
              <div className="form-group">
                <label htmlFor="linkedin">LinkedIn</label>
                <input
                  id="linkedin"
                  type="url"
                  value={formData.linkedinUrl}
                  onChange={(e) => handleInputChange('linkedinUrl', e.target.value)}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>
              <div className="form-group">
                <label htmlFor="avatar">Avatar URL</label>
                <input
                  id="avatar"
                  type="url"
                  value={formData.avatarUrl}
                  onChange={(e) => handleInputChange('avatarUrl', e.target.value)}
                  placeholder="https://example.com/avatar.jpg"
                />
              </div>
              <button
                className="save-button"
                onClick={handleSaveProfile}
                disabled={updateMutation.isPending}
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Profile'}
              </button>
            </div>
          </div>
        </section>

        {/* Export Section */}
        <section className="settings-section">
          <div className="settings-section-header">
            <span className="material-symbols-outlined">download</span>
            <h2>Export Data</h2>
          </div>
          <div className="settings-section-content">
            <p className="settings-description">
              Download all your contacts as a VCF file that can be imported into other applications.
            </p>
            <button className="export-button" onClick={handleExport}>
              <span className="material-symbols-outlined">download</span>
              Export All Contacts (VCF)
            </button>
          </div>
        </section>

        {/* Danger Zone Section */}
        <section className="settings-section danger-zone">
          <div className="settings-section-header">
            <span className="material-symbols-outlined">warning</span>
            <h2>Danger Zone</h2>
          </div>
          <div className="settings-section-content">
            <div className="danger-item">
              <div className="danger-info">
                <h3>Delete All Contacts</h3>
                <p>Permanently delete all contacts from the database. This action cannot be undone.</p>
              </div>
              <button
                className="danger-button"
                onClick={() => setShowDeleteConfirm(true)}
              >
                Delete All Contacts
              </button>
            </div>
          </div>
        </section>
      </div>

      {toast && (
        <div className={`undo-toast ${toast.type === 'error' ? 'error' : ''}`}>
          <span className="material-symbols-outlined">
            {toast.type === 'success' ? 'check_circle' : 'error'}
          </span>
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>
      )}

      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content confirm-dialog danger" onClick={(e) => e.stopPropagation()}>
            <h3>Delete All Contacts?</h3>
            <p>
              This will permanently delete <strong>all contacts</strong> from the database.
              This action cannot be undone.
            </p>
            <p className="confirm-instruction">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirmText}
              onChange={(e) => setDeleteConfirmText(e.target.value)}
              placeholder="Type DELETE"
              className="confirm-input"
            />
            <div className="confirm-actions">
              <button
                className="cancel-button"
                onClick={() => {
                  setShowDeleteConfirm(false);
                  setDeleteConfirmText('');
                }}
              >
                Cancel
              </button>
              <button
                className="confirm-button danger"
                onClick={handleDeleteAll}
                disabled={deleteConfirmText !== 'DELETE' || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? 'Deleting...' : 'Delete All Contacts'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add frontend/src/components/SettingsView.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): add SettingsView component

Includes profile form, export button, and danger zone with delete confirmation

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend - Add settings CSS styles

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/index.css`

**Step 1: Add settings styles**

Add at end of index.css:

```css
/* Settings View */
.settings-view {
  padding: 2rem;
  max-width: 800px;
  margin: 0 auto;
}

.settings-header {
  margin-bottom: 2rem;
}

.settings-header h1 {
  margin: 0;
  font-size: 1.75rem;
  font-weight: 600;
}

.settings-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 4rem 2rem;
  color: var(--text-secondary);
}

.settings-content {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
}

.settings-section {
  background: var(--card-background);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  overflow: hidden;
}

.settings-section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  background: var(--background-secondary);
  border-bottom: 1px solid var(--border-color);
}

.settings-section-header .material-symbols-outlined {
  font-size: 1.25rem;
  color: var(--text-secondary);
}

.settings-section-header h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}

.settings-section-content {
  padding: 1.5rem;
}

.settings-description {
  margin: 0 0 1rem;
  color: var(--text-secondary);
  font-size: 0.875rem;
}

.settings-form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.settings-form .form-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.settings-form label {
  font-size: 0.875rem;
  font-weight: 500;
  color: var(--text-secondary);
}

.settings-form input {
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9375rem;
  background: var(--background);
  color: var(--text-primary);
}

.settings-form input:focus {
  outline: none;
  border-color: var(--primary-color);
  box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
}

.save-button {
  align-self: flex-start;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: var(--primary-color);
  color: white;
  border: none;
  border-radius: 6px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: background-color 0.15s;
  margin-top: 0.5rem;
}

.save-button:hover:not(:disabled) {
  background: var(--primary-hover);
}

.save-button:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.settings-section .export-button {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  background: var(--background);
  color: var(--text-primary);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9375rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.settings-section .export-button:hover {
  background: var(--background-secondary);
  border-color: var(--border-hover);
}

/* Danger Zone */
.settings-section.danger-zone {
  border-color: #fecaca;
}

.settings-section.danger-zone .settings-section-header {
  background: #fef2f2;
  border-bottom-color: #fecaca;
}

.settings-section.danger-zone .settings-section-header .material-symbols-outlined {
  color: #dc2626;
}

.settings-section.danger-zone .settings-section-header h2 {
  color: #dc2626;
}

.danger-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
}

.danger-info h3 {
  margin: 0 0 0.25rem;
  font-size: 0.9375rem;
  font-weight: 600;
}

.danger-info p {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-secondary);
}

.danger-button {
  flex-shrink: 0;
  padding: 0.5rem 1rem;
  background: white;
  color: #dc2626;
  border: 1px solid #dc2626;
  border-radius: 6px;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
}

.danger-button:hover {
  background: #dc2626;
  color: white;
}

/* Danger confirmation modal */
.confirm-dialog.danger h3 {
  color: #dc2626;
}

.confirm-instruction {
  margin: 1rem 0 0.5rem;
  font-size: 0.875rem;
}

.confirm-input {
  width: 100%;
  padding: 0.625rem 0.875rem;
  border: 1px solid var(--border-color);
  border-radius: 6px;
  font-size: 0.9375rem;
  margin-bottom: 1rem;
}

.confirm-input:focus {
  outline: none;
  border-color: #dc2626;
}

.confirm-button.danger {
  background: #dc2626;
  border-color: #dc2626;
}

.confirm-button.danger:hover:not(:disabled) {
  background: #b91c1c;
}

.confirm-button.danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.undo-toast.error {
  background: #fef2f2;
  border-color: #fecaca;
  color: #dc2626;
}
```

**Step 2: Commit**

```bash
git add frontend/src/index.css
git commit -m "$(cat <<'EOF'
feat(frontend): add settings view styles

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend - Wire up SettingsView to App and Sidebar

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/App.tsx`
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/components/Sidebar.tsx`

**Step 1: Update Sidebar props and add settings handler**

In Sidebar.tsx, update the interface:

```typescript
interface SidebarProps {
  onDeduplicateClick?: () => void;
  onCleanupClick?: () => void;
  onArchivedClick?: () => void;
  onGroupsClick?: () => void;
  onSettingsClick?: () => void;
  onBackToContacts?: () => void;
  currentView?: 'contacts' | 'deduplication' | 'cleanup' | 'archived' | 'groups' | 'settings';
}
```

Update the function signature:

```typescript
export function Sidebar({ onDeduplicateClick, onCleanupClick, onArchivedClick, onGroupsClick, onSettingsClick, onBackToContacts, currentView = 'contacts' }: SidebarProps) {
```

Update the Settings NavItem:

```typescript
<NavItem icon="settings" label="Settings" active={currentView === 'settings'} onClick={onSettingsClick} />
```

**Step 2: Update App.tsx**

Add import:
```typescript
import { SettingsView } from './components/SettingsView';
```

Update AppView type:
```typescript
type AppView = 'contacts' | 'deduplication' | 'cleanup' | 'archived' | 'groups' | 'settings';
```

Add handler:
```typescript
const handleSettingsClick = () => {
  setCurrentView('settings');
};
```

Add settings view render block (after groups, before the final contacts render):

```typescript
if (currentView === 'settings') {
  return (
    <div className="app-layout settings-layout">
      <Sidebar
        onDeduplicateClick={handleDeduplicateClick}
        onCleanupClick={handleCleanupClick}
        onArchivedClick={handleArchivedClick}
        onGroupsClick={handleGroupsClick}
        onSettingsClick={handleSettingsClick}
        onBackToContacts={handleBackToContacts}
        currentView="settings"
      />
      <main className="main-content">
        <SettingsView onBack={handleBackToContacts} />
      </main>
    </div>
  );
}
```

Add `onSettingsClick={handleSettingsClick}` to ALL Sidebar usages in the file.

**Step 3: Test in browser**

Run: Open http://localhost:5173, click Settings in sidebar
Expected: Settings page renders with profile form, export button, danger zone

**Step 4: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/Sidebar.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): wire up SettingsView to navigation

- Add settings to AppView type
- Add onSettingsClick handler to Sidebar
- Render SettingsView when settings view is active

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend - Update sidebar user display with settings data

**Files:**
- Modify: `/Users/trarara/Dropbox/+Projects/2601 Address Book Cleanup/ello-claude/frontend/src/components/Sidebar.tsx`

**Step 1: Fetch and display user settings**

Update Sidebar.tsx to fetch user settings:

```typescript
import { useUserSettings } from '../api/settingsHooks';

// Inside Sidebar function:
const { data: userSettings } = useUserSettings();

const displayName = userSettings?.name || 'User';
const displayEmail = userSettings?.email || 'Set up your profile';
const initials = displayName
  .split(' ')
  .map(n => n[0])
  .join('')
  .toUpperCase()
  .slice(0, 2) || 'U';
```

Update the sidebar-user section:

```typescript
<div className="sidebar-user">
  <div className="sidebar-user-avatar">
    {userSettings?.avatarUrl ? (
      <img src={userSettings.avatarUrl} alt={displayName} />
    ) : (
      initials
    )}
  </div>
  <div className="sidebar-user-info">
    <div className="sidebar-user-name">{displayName}</div>
    <div className="sidebar-user-email">{displayEmail}</div>
  </div>
</div>
```

**Step 2: Add avatar image styles**

Add to index.css:

```css
.sidebar-user-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
```

**Step 3: Test**

Run: Save a profile in settings, verify sidebar updates
Expected: Sidebar shows user name and email, avatar if URL provided

**Step 4: Commit**

```bash
git add frontend/src/components/Sidebar.tsx frontend/src/index.css
git commit -m "$(cat <<'EOF'
feat(frontend): display user settings in sidebar

Shows user name, email, and avatar from settings

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Final verification and test

**Step 1: Full test cycle**

1. Start app: `npm run dev`
2. Click Settings in sidebar
3. Fill profile: name, email, phone, website, linkedin
4. Click Save Profile - verify toast appears
5. Navigate away and back - verify data persists
6. Check sidebar - verify name/email updated
7. Click Export All Contacts - verify VCF downloads
8. Click Delete All Contacts - verify confirmation required
9. Type DELETE and confirm (on test data only)

**Step 2: Final commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat: complete settings page implementation

- User profile with name, email, phone, website, LinkedIn, avatar
- Export all contacts as VCF
- Danger zone with delete all contacts (requires typing DELETE)
- Sidebar shows user profile from settings

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```
