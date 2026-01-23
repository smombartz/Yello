import type { ContactsResponse, ContactDetail, ImportResponse } from '../types';

const API_BASE = '';

export const api = {
  async getContacts(params: { page?: number; limit?: number; search?: string }): Promise<ContactsResponse> {
    const searchParams = new URLSearchParams();
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.limit) searchParams.set('limit', params.limit.toString());
    if (params.search) searchParams.set('search', params.search);

    const response = await fetch(`${API_BASE}/api/contacts?${searchParams}`);
    if (!response.ok) throw new Error('Failed to fetch contacts');
    return response.json();
  },

  async getContact(id: number): Promise<ContactDetail> {
    const response = await fetch(`${API_BASE}/api/contacts/${id}`);
    if (!response.ok) throw new Error('Failed to fetch contact');
    return response.json();
  },

  async importVcf(file: File): Promise<ImportResponse> {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_BASE}/api/import`, {
      method: 'POST',
      body: formData
    });
    if (!response.ok) throw new Error('Failed to import file');
    return response.json();
  },

  async getCount(): Promise<{ total: number }> {
    const response = await fetch(`${API_BASE}/api/contacts/count`);
    if (!response.ok) throw new Error('Failed to fetch count');
    return response.json();
  }
};
