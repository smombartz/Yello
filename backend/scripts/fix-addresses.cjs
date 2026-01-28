const ICAL = require('ical.js');
const Database = require('better-sqlite3');

const db = new Database('./data/contacts.db');

// Get all contacts with raw_vcard
const dbContacts = db.prepare('SELECT id, display_name, raw_vcard FROM contacts WHERE raw_vcard IS NOT NULL').all();
console.log('Contacts with raw_vcard:', dbContacts.length);

function extractType(params) {
  if (!params || typeof params !== 'object') return null;
  const typeVal = params.type || params.TYPE;
  if (Array.isArray(typeVal)) return typeVal[0]?.toLowerCase() || null;
  if (typeof typeVal === 'string') return typeVal.toLowerCase();
  return null;
}

function parseAddresses(rawVcard) {
  try {
    const jcal = ICAL.parse(rawVcard);
    const comp = new ICAL.Component(jcal);
    const addresses = [];

    for (const adrProp of comp.getAllProperties('adr')) {
      const adrValue = adrProp.getFirstValue();
      if (adrValue && adrValue.length > 0) {
        addresses.push({
          street: adrValue[2] || null,
          city: adrValue[3] || null,
          state: adrValue[4] || null,
          postalCode: adrValue[5] || null,
          country: adrValue[6] || null,
          type: extractType(adrProp.toJSON()[1])
        });
      }
    }
    return addresses;
  } catch (e) {
    return [];
  }
}

let updated = 0;
let addressesAdded = 0;

const deleteAddresses = db.prepare('DELETE FROM contact_addresses WHERE contact_id = ?');
const insertAddress = db.prepare(`
  INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);

const updateAll = db.transaction(() => {
  for (const contact of dbContacts) {
    const addresses = parseAddresses(contact.raw_vcard);
    if (addresses.length > 0) {
      // Check if any address has actual data
      const hasData = addresses.some(a => a.street || a.city || a.state || a.postalCode || a.country);
      if (hasData) {
        // Delete existing addresses for this contact
        deleteAddresses.run(contact.id);

        for (const addr of addresses) {
          if (addr.street || addr.city || addr.state || addr.postalCode || addr.country) {
            insertAddress.run(
              contact.id,
              addr.street,
              addr.city,
              addr.state,
              addr.postalCode,
              addr.country,
              addr.type
            );
            addressesAdded++;
          }
        }
        updated++;
      }
    }
  }
});

updateAll();

console.log('Contacts updated:', updated);
console.log('Addresses added:', addressesAdded);

// Verify
const count = db.prepare('SELECT COUNT(*) as cnt FROM contact_addresses WHERE street IS NOT NULL OR city IS NOT NULL').get();
console.log('Addresses with data now:', count.cnt);

// Sample
const sample = db.prepare(`
  SELECT c.display_name, a.street, a.city, a.state, a.country
  FROM contacts c
  JOIN contact_addresses a ON c.id = a.contact_id
  WHERE a.city IS NOT NULL
  LIMIT 5
`).all();
console.log('Sample addresses:', sample);

db.close();
