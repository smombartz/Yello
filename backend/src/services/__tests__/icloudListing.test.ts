import { describe, it, expect } from 'vitest';
import type { DAVAddressBook, DAVClient } from 'tsdav';
import { listAddressBookCards } from '../icloudService.js';

const BOOK = { url: 'https://p01-contacts.icloud.com/1/carddavhome/card/' } as DAVAddressBook;
const card = (n: number) => ({ href: `/1/carddavhome/card/${n}.vcf`, status: 200, props: { getetag: `"${n}"` } });
const self = { href: '/1/carddavhome/card/', status: 200, props: {} };
/** RFC 6352: a cut-short listing carries a 507 for the collection itself. */
const truncated = { href: '/1/carddavhome/card/', status: 507, props: {} };

function client(answers: { propfind?: unknown[] | Error; pages?: Array<{ responses: unknown[]; token: string }> }) {
  const tokens: string[] = [];
  const fake = {
    propfind: async () => {
      if (answers.propfind instanceof Error) throw answers.propfind;
      return answers.propfind ?? [];
    },
    syncCollection: async ({ syncToken }: { syncToken: string }) => {
      tokens.push(syncToken);
      const page = answers.pages![tokens.length - 1];
      return page.responses.map(r => ({ ...(r as object), raw: { multistatus: { syncToken: page.token } } }));
    }
  };
  return { fake: fake as unknown as DAVClient, tokens };
}

describe('listAddressBookCards', () => {
  it('lists with PROPFIND when iCloud answers in full', async () => {
    const { fake, tokens } = client({ propfind: [self, card(1), card(2)] });
    expect(await listAddressBookCards(fake, BOOK)).toEqual([
      { url: `${BOOK.url}1.vcf`, etag: '"1"' },
      { url: `${BOOK.url}2.vcf`, etag: '"2"' }
    ]);
    expect(tokens).toEqual([]);
  });

  it('pages through sync-collection when the PROPFIND listing is cut short', async () => {
    const { fake, tokens } = client({
      propfind: [self, card(1), truncated],
      pages: [
        { responses: [card(1), card(2), truncated], token: 'T1' },
        { responses: [card(3), truncated], token: 'T2' },
        { responses: [card(4)], token: 'T3' }
      ]
    });
    const refs = await listAddressBookCards(fake, BOOK);
    expect(refs.map(r => r.url)).toEqual([1, 2, 3, 4].map(n => `${BOOK.url}${n}.vcf`));
    expect(tokens).toEqual(['', 'T1', 'T2']);
  });

  it('falls back to sync-collection when PROPFIND fails outright', async () => {
    const { fake } = client({ propfind: new Error('507'), pages: [{ responses: [card(7)], token: 'T' }] });
    expect((await listAddressBookCards(fake, BOOK)).map(r => r.etag)).toEqual(['"7"']);
  });
});
