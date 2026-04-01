import { describe, it, expect } from 'vitest';
import { buildICloudClient, testICloudConnection } from '../icloudService.js';

describe('icloudService', () => {
  it('buildICloudClient returns a DAVClient configured for iCloud', () => {
    const client = buildICloudClient('test@icloud.com', 'xxxx-xxxx-xxxx-xxxx');
    expect(client).toBeDefined();
    expect(client.serverUrl).toBe('https://contacts.icloud.com');
  });

  it('testICloudConnection rejects with invalid credentials', async () => {
    const result = await testICloudConnection('fake@icloud.com', 'not-a-real-password');
    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });
});
