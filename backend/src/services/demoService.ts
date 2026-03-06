import { randomUUID } from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import { getAuthDatabase } from './authDatabase.js';
import { getUserDatabase, closeUserDatabase } from './userDatabase.js';

export const DEMO_CONTACT_COUNT = 20;
export const DEMO_SESSION_DURATION_MS = 2 * 60 * 60 * 1000; // 2 hours

interface DemoContact {
  firstName: string;
  lastName: string;
  company: string;
  title: string;
  notes: string;
  birthday: string | null;
  emails: Array<{ email: string; type: string }>;
  phones: Array<{ phone: string; phoneDisplay: string; type: string }>;
  address: { street: string; city: string; state: string; postalCode: string; country: string; type: string };
  categories: string[];
  linkedin?: {
    headline: string;
    about: string;
    jobTitle: string;
    companyName: string;
    industry: string;
    location: string;
    skills: string[];
    positions: Array<{ title: string; company: string; startDate: string; endDate?: string }>;
  };
}

const DEMO_CONTACTS: DemoContact[] = [
  {
    firstName: 'Sarah', lastName: 'Chen', company: 'Greenfield Realty', title: 'Real Estate Broker',
    notes: 'Top broker in the Bay Area. Helped us find our office space in 2024.',
    birthday: '1985-03-15',
    emails: [{ email: 'sarah@greenfieldrealty.com', type: 'work' }, { email: 'sarah.chen.sf@gmail.com', type: 'home' }],
    phones: [{ phone: '+14155551001', phoneDisplay: '(415) 555-1001', type: 'work' }],
    address: { street: '450 Pacific Ave', city: 'San Francisco', state: 'CA', postalCode: '94133', country: 'United States', type: 'work' },
    categories: ['Business', 'VIP'],
    linkedin: {
      headline: 'Real Estate Broker | Helping families find their dream homes in the Bay Area',
      about: 'With over 15 years in Bay Area real estate, I specialize in residential properties across San Francisco and the Peninsula. My passion is matching people with neighborhoods that fit their lifestyle.',
      jobTitle: 'Real Estate Broker', companyName: 'Greenfield Realty', industry: 'Real Estate', location: 'San Francisco, CA',
      skills: ['Real Estate', 'Negotiation', 'Market Analysis', 'Property Valuation'],
      positions: [{ title: 'Real Estate Broker', company: 'Greenfield Realty', startDate: '2018-01' }, { title: 'Associate Broker', company: 'Compass', startDate: '2012-06', endDate: '2017-12' }],
    },
  },
  {
    firstName: 'Marcus', lastName: 'Johnson', company: 'St. James Medical', title: 'Cardiologist',
    notes: 'Referred by Dr. Patel. Excellent cardiologist, very thorough.',
    birthday: '1978-11-22',
    emails: [{ email: 'mjohnson@stjamesmedical.org', type: 'work' }],
    phones: [{ phone: '+12125551002', phoneDisplay: '(212) 555-1002', type: 'work' }],
    address: { street: '221 E 70th St', city: 'New York', state: 'NY', postalCode: '10021', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: {
      headline: 'Interventional Cardiologist | Board Certified | Advancing Heart Health',
      about: 'Board-certified interventional cardiologist with a focus on minimally invasive procedures. I believe in patient-centered care and staying at the forefront of cardiac research.',
      jobTitle: 'Cardiologist', companyName: 'St. James Medical Center', industry: 'Healthcare', location: 'New York, NY',
      skills: ['Cardiology', 'Interventional Procedures', 'Patient Care', 'Clinical Research', 'Echocardiography'],
      positions: [{ title: 'Attending Cardiologist', company: 'St. James Medical Center', startDate: '2015-08' }],
    },
  },
  {
    firstName: 'Elena', lastName: 'Rodriguez', company: 'Rodriguez & Partners', title: 'Immigration Attorney',
    notes: 'Handles all our H-1B cases. Very responsive and knowledgeable.',
    birthday: null,
    emails: [{ email: 'elena@rodriguezlaw.com', type: 'work' }, { email: 'erodriguez.esq@gmail.com', type: 'home' }],
    phones: [{ phone: '+13055551003', phoneDisplay: '(305) 555-1003', type: 'work' }],
    address: { street: '1200 Brickell Ave, Suite 800', city: 'Miami', state: 'FL', postalCode: '33131', country: 'United States', type: 'work' },
    categories: ['Business', 'VIP'],
    linkedin: {
      headline: 'Immigration Attorney | Founding Partner at Rodriguez & Partners',
      about: 'Passionate about helping individuals and businesses navigate U.S. immigration law. Our firm specializes in employment-based visas, family immigration, and naturalization.',
      jobTitle: 'Founding Partner', companyName: 'Rodriguez & Partners', industry: 'Legal Services', location: 'Miami, FL',
      skills: ['Immigration Law', 'Employment Visas', 'Business Immigration', 'Litigation'],
      positions: [{ title: 'Founding Partner', company: 'Rodriguez & Partners', startDate: '2016-03' }, { title: 'Associate', company: 'Baker McKenzie', startDate: '2010-09', endDate: '2016-02' }],
    },
  },
  {
    firstName: 'David', lastName: 'Kim', company: 'Kimchi & Co', title: 'Head Chef / Owner',
    notes: 'Amazing Korean fusion restaurant. Great for client dinners.',
    birthday: '1982-07-04',
    emails: [{ email: 'david@kimchiandco.com', type: 'work' }],
    phones: [{ phone: '+12135551004', phoneDisplay: '(213) 555-1004', type: 'work' }],
    address: { street: '834 S Spring St', city: 'Los Angeles', state: 'CA', postalCode: '90014', country: 'United States', type: 'work' },
    categories: ['Personal'],
  },
  {
    firstName: 'Priya', lastName: 'Sharma', company: 'NovaTech Solutions', title: 'VP of Engineering',
    notes: 'Met at React Conf 2024. Interested in potential partnership on dev tools.',
    birthday: '1990-01-12',
    emails: [{ email: 'priya.sharma@novatech.io', type: 'work' }, { email: 'priya.sharma.dev@gmail.com', type: 'home' }],
    phones: [{ phone: '+14085551005', phoneDisplay: '(408) 555-1005', type: 'work' }],
    address: { street: '2100 Geng Rd, Suite 210', city: 'Palo Alto', state: 'CA', postalCode: '94303', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: {
      headline: 'VP of Engineering at NovaTech | Building the future of developer tools',
      about: 'Engineering leader with a track record of scaling teams from 10 to 100+. Currently leading platform engineering at NovaTech Solutions, where we are building next-generation developer productivity tools.',
      jobTitle: 'VP of Engineering', companyName: 'NovaTech Solutions', industry: 'Technology', location: 'Palo Alto, CA',
      skills: ['Engineering Management', 'System Design', 'React', 'TypeScript', 'Cloud Architecture'],
      positions: [{ title: 'VP of Engineering', company: 'NovaTech Solutions', startDate: '2022-01' }, { title: 'Senior Engineering Manager', company: 'Stripe', startDate: '2018-06', endDate: '2021-12' }],
    },
  },
  {
    firstName: 'James', lastName: "O'Brien", company: "O'Brien Construction", title: 'General Contractor',
    notes: 'Handled our office renovation. Quality work, on time and budget.',
    birthday: null,
    emails: [{ email: 'james@obrienconstruction.com', type: 'work' }],
    phones: [{ phone: '+17735551006', phoneDisplay: '(773) 555-1006', type: 'work' }],
    address: { street: '1550 N Damen Ave', city: 'Chicago', state: 'IL', postalCode: '60622', country: 'United States', type: 'work' },
    categories: ['Business'],
  },
  {
    firstName: 'Aisha', lastName: 'Patel', company: 'Meridian Wealth', title: 'Financial Advisor',
    notes: 'CFP. Manages company retirement accounts and personal investments.',
    birthday: '1988-09-30',
    emails: [{ email: 'aisha.patel@meridianwealth.com', type: 'work' }],
    phones: [{ phone: '+16175551007', phoneDisplay: '(617) 555-1007', type: 'work' }],
    address: { street: '100 Federal St, 29th Floor', city: 'Boston', state: 'MA', postalCode: '02110', country: 'United States', type: 'work' },
    categories: ['Business', 'VIP'],
    linkedin: {
      headline: 'Certified Financial Planner | Helping professionals build lasting wealth',
      about: 'I help high-earning professionals and small business owners create comprehensive financial plans. From retirement planning to tax optimization, my approach is holistic and personalized.',
      jobTitle: 'Senior Financial Advisor', companyName: 'Meridian Wealth Management', industry: 'Financial Services', location: 'Boston, MA',
      skills: ['Financial Planning', 'Investment Management', 'Tax Planning', 'Retirement Planning'],
      positions: [{ title: 'Senior Financial Advisor', company: 'Meridian Wealth Management', startDate: '2019-04' }],
    },
  },
  {
    firstName: 'Tom', lastName: 'Andersson', company: 'Pixel & Ink Studio', title: 'Creative Director',
    notes: 'Designed our brand identity. Swedish design sensibility, very detail-oriented.',
    birthday: '1986-05-18',
    emails: [{ email: 'tom@pixelandink.studio', type: 'work' }],
    phones: [{ phone: '+15035551008', phoneDisplay: '(503) 555-1008', type: 'work' }],
    address: { street: '720 NW Davis St, Suite 300', city: 'Portland', state: 'OR', postalCode: '97209', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: {
      headline: 'Creative Director | Brand Identity | UI/UX Design',
      about: 'I lead a boutique design studio focused on brand identity and digital product design. We believe great design is invisible — it just works.',
      jobTitle: 'Creative Director', companyName: 'Pixel & Ink Studio', industry: 'Design', location: 'Portland, OR',
      skills: ['Brand Identity', 'UI/UX Design', 'Typography', 'Figma', 'Art Direction'],
      positions: [{ title: 'Creative Director & Founder', company: 'Pixel & Ink Studio', startDate: '2017-01' }],
    },
  },
  {
    firstName: 'Lisa', lastName: 'Nakamura', company: 'Westfield Academy', title: 'School Principal',
    notes: 'Principal at kids\' school. Very involved in community outreach.',
    birthday: '1975-12-03',
    emails: [{ email: 'lnakamura@westfieldacademy.edu', type: 'work' }],
    phones: [{ phone: '+15105551009', phoneDisplay: '(510) 555-1009', type: 'work' }],
    address: { street: '1800 Mountain Blvd', city: 'Oakland', state: 'CA', postalCode: '94611', country: 'United States', type: 'work' },
    categories: ['Personal'],
  },
  {
    firstName: 'Carlos', lastName: 'Mendez', company: 'Mendez Estate Wines', title: 'Vineyard Owner',
    notes: 'Produces excellent Pinot Noir. Hosts annual harvest event in October.',
    birthday: '1970-08-14',
    emails: [{ email: 'carlos@mendezestatewines.com', type: 'work' }],
    phones: [{ phone: '+17075551010', phoneDisplay: '(707) 555-1010', type: 'work' }],
    address: { street: '4200 Silverado Trail', city: 'Napa', state: 'CA', postalCode: '94558', country: 'United States', type: 'work' },
    categories: ['Personal', 'VIP'],
    linkedin: {
      headline: 'Vineyard Owner & Winemaker | Third-generation viticulturist',
      about: 'Carrying on a family tradition of winemaking in Napa Valley. We produce small-lot, estate-grown Pinot Noir and Chardonnay with a focus on sustainability and terroir expression.',
      jobTitle: 'Owner & Winemaker', companyName: 'Mendez Estate Wines', industry: 'Wine & Spirits', location: 'Napa Valley, CA',
      skills: ['Viticulture', 'Winemaking', 'Sustainable Agriculture', 'Business Management'],
      positions: [{ title: 'Owner & Winemaker', company: 'Mendez Estate Wines', startDate: '2005-01' }],
    },
  },
  {
    firstName: 'Rachel', lastName: 'Green', company: 'BrightPath Media', title: 'Marketing Director',
    notes: 'Runs our digital ad campaigns. Data-driven approach, great results.',
    birthday: '1991-04-22',
    emails: [{ email: 'rachel@brightpathmedia.com', type: 'work' }, { email: 'rachelg.marketing@gmail.com', type: 'home' }],
    phones: [{ phone: '+15125551011', phoneDisplay: '(512) 555-1011', type: 'work' }],
    address: { street: '500 W 2nd St, Suite 1900', city: 'Austin', state: 'TX', postalCode: '78701', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: {
      headline: 'Marketing Director | Growth Strategy | B2B SaaS',
      about: 'I help B2B SaaS companies scale from $1M to $50M ARR through data-driven marketing strategies. Specializing in content marketing, paid acquisition, and marketing operations.',
      jobTitle: 'Marketing Director', companyName: 'BrightPath Media', industry: 'Marketing & Advertising', location: 'Austin, TX',
      skills: ['Digital Marketing', 'Growth Strategy', 'Content Marketing', 'Marketing Analytics', 'B2B SaaS'],
      positions: [{ title: 'Marketing Director', company: 'BrightPath Media', startDate: '2021-06' }, { title: 'Senior Marketing Manager', company: 'HubSpot', startDate: '2017-03', endDate: '2021-05' }],
    },
  },
  {
    firstName: 'Omar', lastName: 'Hassan', company: 'Atlas Infrastructure', title: 'Civil Engineer',
    notes: 'Consulting on the new parking structure project. PE licensed in 3 states.',
    birthday: null,
    emails: [{ email: 'ohassan@atlasinfra.com', type: 'work' }],
    phones: [{ phone: '+12025551012', phoneDisplay: '(202) 555-1012', type: 'work' }],
    address: { street: '1750 K St NW, Suite 400', city: 'Washington', state: 'DC', postalCode: '20006', country: 'United States', type: 'work' },
    categories: ['Business'],
  },
  {
    firstName: 'Sophie', lastName: 'Laurent', company: 'Laurent Contemporary', title: 'Gallery Owner',
    notes: 'Curates amazing contemporary art exhibitions. Hosted our company event.',
    birthday: '1983-06-28',
    emails: [{ email: 'sophie@laurentcontemporary.com', type: 'work' }],
    phones: [{ phone: '+13125551013', phoneDisplay: '(312) 555-1013', type: 'work' }],
    address: { street: '300 W Superior St', city: 'Chicago', state: 'IL', postalCode: '60654', country: 'United States', type: 'work' },
    categories: ['Personal'],
  },
  {
    firstName: 'Michael', lastName: 'Torres', company: 'CorePower Athletics', title: 'Fitness Studio Owner',
    notes: 'Runs a great HIIT and yoga studio. Offers corporate wellness programs.',
    birthday: '1987-02-10',
    emails: [{ email: 'michael@corepowerathletics.com', type: 'work' }],
    phones: [{ phone: '+13035551014', phoneDisplay: '(303) 555-1014', type: 'work' }],
    address: { street: '1600 Wynkoop St', city: 'Denver', state: 'CO', postalCode: '80202', country: 'United States', type: 'work' },
    categories: ['Personal'],
  },
  {
    firstName: 'Hannah', lastName: 'Berg', company: 'Riverside Animal Care', title: 'Veterinarian',
    notes: 'Our family vet. Excellent with anxious pets. Open on Saturdays.',
    birthday: null,
    emails: [{ email: 'hberg@riversidevetcare.com', type: 'work' }],
    phones: [{ phone: '+16195551015', phoneDisplay: '(619) 555-1015', type: 'work' }],
    address: { street: '3800 Park Blvd', city: 'San Diego', state: 'CA', postalCode: '92103', country: 'United States', type: 'work' },
    categories: ['Personal'],
  },
  {
    firstName: 'Raj', lastName: 'Kapoor', company: 'CloudScale Inc', title: 'Product Manager',
    notes: 'Former colleague from my time at Google. Now leading PM at CloudScale.',
    birthday: '1992-10-05',
    emails: [{ email: 'raj.kapoor@cloudscale.io', type: 'work' }, { email: 'raj.k.pm@gmail.com', type: 'home' }],
    phones: [{ phone: '+12065551016', phoneDisplay: '(206) 555-1016', type: 'work' }],
    address: { street: '400 Broad St', city: 'Seattle', state: 'WA', postalCode: '98109', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: {
      headline: 'Product Manager at CloudScale | Ex-Google | Building for scale',
      about: 'Product manager passionate about developer platforms and cloud infrastructure. Previously at Google Cloud, now building the next generation of auto-scaling solutions at CloudScale.',
      jobTitle: 'Senior Product Manager', companyName: 'CloudScale Inc', industry: 'Cloud Computing', location: 'Seattle, WA',
      skills: ['Product Management', 'Cloud Infrastructure', 'Agile', 'Data-Driven Decision Making'],
      positions: [{ title: 'Senior Product Manager', company: 'CloudScale Inc', startDate: '2023-01' }, { title: 'Product Manager', company: 'Google Cloud', startDate: '2019-08', endDate: '2022-12' }],
    },
  },
  {
    firstName: 'Emma', lastName: 'Williams', company: 'The Morning Chronicle', title: 'Journalist',
    notes: 'Tech beat reporter. Has covered our product launches favorably.',
    birthday: null,
    emails: [{ email: 'ewilliams@morningchronicle.com', type: 'work' }],
    phones: [{ phone: '+14155551017', phoneDisplay: '(415) 555-1017', type: 'work' }],
    address: { street: '901 Mission St', city: 'San Francisco', state: 'CA', postalCode: '94103', country: 'United States', type: 'work' },
    categories: ['Business'],
  },
  {
    firstName: 'Daniel', lastName: 'Okafor', company: 'Okafor Design Studio', title: 'Architect',
    notes: 'Award-winning architect. Designed the new community center downtown.',
    birthday: '1980-03-25',
    emails: [{ email: 'daniel@okafordesign.com', type: 'work' }],
    phones: [{ phone: '+14045551018', phoneDisplay: '(404) 555-1018', type: 'work' }],
    address: { street: '675 Ponce de Leon Ave NE', city: 'Atlanta', state: 'GA', postalCode: '30308', country: 'United States', type: 'work' },
    categories: ['Business'],
  },
  {
    firstName: 'Julia', lastName: 'Rossi', company: 'La Dolce Vita Bakery', title: 'Pastry Chef',
    notes: 'Makes the best cannoli in town. Caters our office birthday celebrations.',
    birthday: '1989-12-20',
    emails: [{ email: 'julia@ladolcevitabakery.com', type: 'work' }],
    phones: [{ phone: '+17185551019', phoneDisplay: '(718) 555-1019', type: 'work' }],
    address: { street: '155 Atlantic Ave', city: 'Brooklyn', state: 'NY', postalCode: '11201', country: 'United States', type: 'work' },
    categories: ['Personal'],
  },
  {
    firstName: 'Ben', lastName: 'Calloway', company: 'Echo Sound Studios', title: 'Music Producer',
    notes: 'Produced the audio for our product launch video. Very creative.',
    birthday: '1984-07-31',
    emails: [{ email: 'ben@echosoundstudios.com', type: 'work' }],
    phones: [{ phone: '+16155551020', phoneDisplay: '(615) 555-1020', type: 'work' }],
    address: { street: '1005 16th Ave S', city: 'Nashville', state: 'TN', postalCode: '37212', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: {
      headline: 'Music Producer & Sound Engineer | Grammy-nominated | Nashville',
      about: 'Award-winning music producer and sound engineer with 15+ years in the Nashville music scene. Specializing in indie rock, folk, and podcast production. My studio is a creative haven for artists.',
      jobTitle: 'Owner & Lead Producer', companyName: 'Echo Sound Studios', industry: 'Music', location: 'Nashville, TN',
      skills: ['Music Production', 'Sound Engineering', 'Pro Tools', 'Mixing & Mastering'],
      positions: [{ title: 'Owner & Lead Producer', company: 'Echo Sound Studios', startDate: '2014-01' }],
    },
  },
];

/**
 * Creates a temporary demo user with seeded contact data.
 * Returns the userId and sessionId for cookie management.
 */
export function createDemoUser(): { userId: number; sessionId: string } {
  const authDb = getAuthDatabase();
  const uuid = randomUUID();
  const googleId = `demo-${uuid}`;
  const email = `demo-${uuid}@demo.yello.app`;
  const sessionId = randomUUID();

  const expiresAt = new Date(Date.now() + DEMO_SESSION_DURATION_MS).toISOString();

  // Insert demo user
  const result = authDb.prepare(
    'INSERT INTO users (google_id, email, name, is_demo) VALUES (?, ?, ?, 1)'
  ).run(googleId, email, 'Demo User');

  const userId = result.lastInsertRowid as number;

  // Create session
  authDb.prepare(
    'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)'
  ).run(sessionId, userId, expiresAt);

  // Initialize user database and seed contacts
  const userDb = getUserDatabase(userId);
  seedDemoContacts(userDb);

  return { userId, sessionId };
}

/**
 * Seeds the given user database with demo contacts, emails, phones,
 * addresses, categories, LinkedIn enrichment, and FTS entries.
 */
function seedDemoContacts(db: DatabaseType): void {
  const insertContact = db.prepare(`
    INSERT INTO contacts (first_name, last_name, display_name, company, title, notes, birthday)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertEmail = db.prepare(`
    INSERT INTO contact_emails (contact_id, email, type, is_primary)
    VALUES (?, ?, ?, ?)
  `);

  const insertPhone = db.prepare(`
    INSERT INTO contact_phones (contact_id, phone, phone_display, type, is_primary)
    VALUES (?, ?, ?, ?, 1)
  `);

  const insertAddress = db.prepare(`
    INSERT INTO contact_addresses (contact_id, street, city, state, postal_code, country, type)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertCategory = db.prepare(`
    INSERT INTO contact_categories (contact_id, category)
    VALUES (?, ?)
  `);

  const insertLinkedin = db.prepare(`
    INSERT INTO linkedin_enrichment (contact_id, headline, about, job_title, company_name, industry, location, skills, positions, enriched_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertFts = db.prepare(`
    INSERT INTO contacts_unified_fts (rowid, searchable_text)
    VALUES (?, ?)
  `);

  const seed = db.transaction(() => {
    for (const contact of DEMO_CONTACTS) {
      const displayName = `${contact.firstName} ${contact.lastName}`;

      const result = insertContact.run(
        contact.firstName, contact.lastName, displayName,
        contact.company, contact.title, contact.notes, contact.birthday
      );
      const contactId = result.lastInsertRowid as number;

      // Emails
      for (let i = 0; i < contact.emails.length; i++) {
        insertEmail.run(contactId, contact.emails[i].email, contact.emails[i].type, i === 0 ? 1 : 0);
      }

      // Phones
      for (const phone of contact.phones) {
        insertPhone.run(contactId, phone.phone, phone.phoneDisplay, phone.type);
      }

      // Address
      const addr = contact.address;
      insertAddress.run(contactId, addr.street, addr.city, addr.state, addr.postalCode, addr.country, addr.type);

      // Categories
      for (const category of contact.categories) {
        insertCategory.run(contactId, category);
      }

      // LinkedIn enrichment
      if (contact.linkedin) {
        const li = contact.linkedin;
        insertLinkedin.run(
          contactId,
          li.headline,
          li.about,
          li.jobTitle,
          li.companyName,
          li.industry,
          li.location,
          JSON.stringify(li.skills),
          JSON.stringify(li.positions),
          new Date().toISOString()
        );
      }

      // Unified FTS entry
      const emailText = contact.emails.map(e => e.email).join(' ');
      const searchableText = `${displayName} ${contact.company} ${contact.title} ${emailText}`;
      insertFts.run(contactId, searchableText);
    }
  });

  seed();
}

/**
 * Cleans up expired demo users: deletes their user data directories,
 * database connections, and auth.db rows.
 */
export function cleanupExpiredDemoUsers(): void {
  const authDb = getAuthDatabase();

  // Find demo users whose ALL sessions have expired
  const expiredDemoUsers = authDb.prepare(`
    SELECT u.id FROM users u
    WHERE u.is_demo = 1
    AND NOT EXISTS (
      SELECT 1 FROM sessions s
      WHERE s.user_id = u.id
      AND s.expires_at > datetime('now')
    )
  `).all() as Array<{ id: number }>;

  for (const { id } of expiredDemoUsers) {
    // Close DB connection if cached
    closeUserDatabase(id);

    // Delete user data directory
    const userDataPath = process.env.USER_DATA_PATH || './data/users';
    const userDir = path.join(userDataPath, String(id));
    if (fs.existsSync(userDir)) {
      fs.rmSync(userDir, { recursive: true, force: true });
    }

    // Delete from auth.db (cascades to sessions via FK)
    authDb.prepare('DELETE FROM users WHERE id = ?').run(id);
  }
}
