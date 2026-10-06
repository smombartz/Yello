/**
 * The demo book's fabricated people (backend/src/services/demoService.ts),
 * with map coordinates added for the landing page. Every name, address and
 * number here is invented, which is what makes it safe on a public page.
 * Never swap in real contacts. Some domains may belong to real businesses,
 * so the sample app never lets a visitor email, call or open them.
 */

interface RawSampleContact {
  id: number;
  firstName: string;
  lastName: string;
  title: string;
  company: string;
  notes: string;
  birthday: string;
  emails: { email: string; type: string }[];
  phones: { phone: string; phoneDisplay: string; type: string }[];
  address: { street: string; city: string; state: string; postalCode: string; country: string; type: string };
  categories: string[];
  linkedin: {
    headline: string;
    about: string;
    jobTitle: string;
    companyName: string;
    industry: string;
    location: string;
    skills: string[];
    positions: { title: string; company: string; startDate: string; endDate?: string }[];
  } | null;
  lat: number;
  lon: number;
}

export interface SampleContact extends RawSampleContact {
  name: string;
  /** Primary email, phone and city, as the contact list shows them */
  email: string;
  phone: string;
  city: string;
}

const RAW_BOOK: RawSampleContact[] = [
  {
    id: 1,
    firstName: 'Sarah',
    lastName: 'Chen',
    title: 'Real Estate Broker',
    company: 'Greenfield Realty',
    notes: 'Top broker in the Bay Area. Helped us find our office space in 2024.',
    birthday: '1985-03-15',
    emails: [{ email: 'sarah@greenfieldrealty.com', type: 'work' }, { email: 'sarah.chen.sf@gmail.com', type: 'home' }],
    phones: [{ phone: '+14155551001', phoneDisplay: '(415) 555-1001', type: 'work' }],
    address: { street: '450 Pacific Ave', city: 'San Francisco', state: 'CA', postalCode: '94133', country: 'United States', type: 'work' },
    categories: ['Business', 'VIP'],
    linkedin: { headline: 'Real Estate Broker | Helping families find their dream homes in the Bay Area', about: 'With over 15 years in Bay Area real estate, I specialize in residential properties across San Francisco and the Peninsula. My passion is matching people with neighborhoods that fit their lifestyle.', jobTitle: 'Real Estate Broker', companyName: 'Greenfield Realty', industry: 'Real Estate', location: 'San Francisco, CA', skills: ['Real Estate', 'Negotiation', 'Market Analysis', 'Property Valuation'], positions: [{ title: 'Real Estate Broker', company: 'Greenfield Realty', startDate: '2018-01' }, { title: 'Associate Broker', company: 'Compass', startDate: '2012-06', endDate: '2017-12' }] },
    lat: 37.7749,
    lon: -122.4194,
  },
  {
    id: 2,
    firstName: 'Marcus',
    lastName: 'Johnson',
    title: 'Cardiologist',
    company: 'St. James Medical',
    notes: 'Referred by Dr. Patel. Excellent cardiologist, very thorough.',
    birthday: '1978-11-22',
    emails: [{ email: 'mjohnson@stjamesmedical.org', type: 'work' }],
    phones: [{ phone: '+12125551002', phoneDisplay: '(212) 555-1002', type: 'work' }],
    address: { street: '221 E 70th St', city: 'New York', state: 'NY', postalCode: '10021', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: { headline: 'Interventional Cardiologist | Board Certified | Advancing Heart Health', about: 'Board-certified interventional cardiologist with a focus on minimally invasive procedures. I believe in patient-centered care and staying at the forefront of cardiac research.', jobTitle: 'Cardiologist', companyName: 'St. James Medical Center', industry: 'Healthcare', location: 'New York, NY', skills: ['Cardiology', 'Interventional Procedures', 'Patient Care', 'Clinical Research', 'Echocardiography'], positions: [{ title: 'Attending Cardiologist', company: 'St. James Medical Center', startDate: '2015-08' }] },
    lat: 40.7681,
    lon: -73.9592,
  },
  {
    id: 3,
    firstName: 'Elena',
    lastName: 'Rodriguez',
    title: 'Immigration Attorney',
    company: 'Rodriguez & Partners',
    notes: 'Handles all our H-1B cases. Very responsive and knowledgeable.',
    birthday: '1981-08-19',
    emails: [{ email: 'elena@rodriguezlaw.com', type: 'work' }, { email: 'erodriguez.esq@gmail.com', type: 'home' }],
    phones: [{ phone: '+13055551003', phoneDisplay: '(305) 555-1003', type: 'work' }],
    address: { street: '1200 Brickell Ave, Suite 800', city: 'Miami', state: 'FL', postalCode: '33131', country: 'United States', type: 'work' },
    categories: ['Business', 'VIP'],
    linkedin: { headline: 'Immigration Attorney | Founding Partner at Rodriguez & Partners', about: 'Passionate about helping individuals and businesses navigate U.S. immigration law. Our firm specializes in employment-based visas, family immigration, and naturalization.', jobTitle: 'Founding Partner', companyName: 'Rodriguez & Partners', industry: 'Legal Services', location: 'Miami, FL', skills: ['Immigration Law', 'Employment Visas', 'Business Immigration', 'Litigation'], positions: [{ title: 'Founding Partner', company: 'Rodriguez & Partners', startDate: '2016-03' }, { title: 'Associate', company: 'Baker McKenzie', startDate: '2010-09', endDate: '2016-02' }] },
    lat: 25.7617,
    lon: -80.1918,
  },
  {
    id: 4,
    firstName: 'David',
    lastName: 'Kim',
    title: 'Head Chef / Owner',
    company: 'Kimchi & Co',
    notes: 'Amazing Korean fusion restaurant. Great for client dinners.',
    birthday: '1982-07-04',
    emails: [{ email: 'david@kimchiandco.com', type: 'work' }],
    phones: [{ phone: '+12135551004', phoneDisplay: '(213) 555-1004', type: 'work' }],
    address: { street: '834 S Spring St', city: 'Los Angeles', state: 'CA', postalCode: '90014', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: null,
    lat: 34.0522,
    lon: -118.2437,
  },
  {
    id: 5,
    firstName: 'Priya',
    lastName: 'Sharma',
    title: 'VP of Engineering',
    company: 'NovaTech Solutions',
    notes: 'Met at React Conf 2024. Interested in potential partnership on dev tools.',
    birthday: '1990-01-12',
    emails: [{ email: 'priya.sharma@novatech.io', type: 'work' }, { email: 'priya.sharma.dev@gmail.com', type: 'home' }],
    phones: [{ phone: '+14085551005', phoneDisplay: '(408) 555-1005', type: 'work' }],
    address: { street: '2100 Geng Rd, Suite 210', city: 'Palo Alto', state: 'CA', postalCode: '94303', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: { headline: 'VP of Engineering at NovaTech | Building the future of developer tools', about: 'Engineering leader with a track record of scaling teams from 10 to 100+. Currently leading platform engineering at NovaTech Solutions, where we are building next-generation developer productivity tools.', jobTitle: 'VP of Engineering', companyName: 'NovaTech Solutions', industry: 'Technology', location: 'Palo Alto, CA', skills: ['Engineering Management', 'System Design', 'React', 'TypeScript', 'Cloud Architecture'], positions: [{ title: 'VP of Engineering', company: 'NovaTech Solutions', startDate: '2022-01' }, { title: 'Senior Engineering Manager', company: 'Stripe', startDate: '2018-06', endDate: '2021-12' }] },
    lat: 37.4419,
    lon: -122.143,
  },
  {
    id: 6,
    firstName: 'James',
    lastName: "O'Brien",
    title: 'General Contractor',
    company: "O'Brien Construction",
    notes: 'Handled our office renovation. Quality work, on time and budget.',
    birthday: '1976-04-08',
    emails: [{ email: 'james@obrienconstruction.com', type: 'work' }],
    phones: [{ phone: '+17735551006', phoneDisplay: '(773) 555-1006', type: 'work' }],
    address: { street: '1550 N Damen Ave', city: 'Chicago', state: 'IL', postalCode: '60622', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: null,
    lat: 41.9101,
    lon: -87.6776,
  },
  {
    id: 7,
    firstName: 'Aisha',
    lastName: 'Patel',
    title: 'Financial Advisor',
    company: 'Meridian Wealth',
    notes: 'CFP. Manages company retirement accounts and personal investments.',
    birthday: '1988-09-30',
    emails: [{ email: 'aisha.patel@meridianwealth.com', type: 'work' }],
    phones: [{ phone: '+16175551007', phoneDisplay: '(617) 555-1007', type: 'work' }],
    address: { street: '100 Federal St, 29th Floor', city: 'Boston', state: 'MA', postalCode: '02110', country: 'United States', type: 'work' },
    categories: ['Business', 'VIP'],
    linkedin: { headline: 'Certified Financial Planner | Helping professionals build lasting wealth', about: 'I help high-earning professionals and small business owners create comprehensive financial plans. From retirement planning to tax optimization, my approach is holistic and personalized.', jobTitle: 'Senior Financial Advisor', companyName: 'Meridian Wealth Management', industry: 'Financial Services', location: 'Boston, MA', skills: ['Financial Planning', 'Investment Management', 'Tax Planning', 'Retirement Planning'], positions: [{ title: 'Senior Financial Advisor', company: 'Meridian Wealth Management', startDate: '2019-04' }] },
    lat: 42.3601,
    lon: -71.0589,
  },
  {
    id: 8,
    firstName: 'Tom',
    lastName: 'Andersson',
    title: 'Creative Director',
    company: 'Pixel & Ink Studio',
    notes: 'Designed our brand identity. Swedish design sensibility, very detail-oriented.',
    birthday: '1986-05-18',
    emails: [{ email: 'tom@pixelandink.studio', type: 'work' }],
    phones: [{ phone: '+15035551008', phoneDisplay: '(503) 555-1008', type: 'work' }],
    address: { street: '720 NW Davis St, Suite 300', city: 'Portland', state: 'OR', postalCode: '97209', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: { headline: 'Creative Director | Brand Identity | UI/UX Design', about: 'I lead a boutique design studio focused on brand identity and digital product design. We believe great design is invisible — it just works.', jobTitle: 'Creative Director', companyName: 'Pixel & Ink Studio', industry: 'Design', location: 'Portland, OR', skills: ['Brand Identity', 'UI/UX Design', 'Typography', 'Figma', 'Art Direction'], positions: [{ title: 'Creative Director & Founder', company: 'Pixel & Ink Studio', startDate: '2017-01' }] },
    lat: 45.5245,
    lon: -122.6793,
  },
  {
    id: 9,
    firstName: 'Lisa',
    lastName: 'Nakamura',
    title: 'School Principal',
    company: 'Westfield Academy',
    notes: "Principal at kids' school. Very involved in community outreach.",
    birthday: '1975-12-03',
    emails: [{ email: 'lnakamura@westfieldacademy.edu', type: 'work' }],
    phones: [{ phone: '+15105551009', phoneDisplay: '(510) 555-1009', type: 'work' }],
    address: { street: '1800 Mountain Blvd', city: 'Oakland', state: 'CA', postalCode: '94611', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: null,
    lat: 37.8044,
    lon: -122.2712,
  },
  {
    id: 10,
    firstName: 'Carlos',
    lastName: 'Mendez',
    title: 'Vineyard Owner',
    company: 'Mendez Estate Wines',
    notes: 'Produces excellent Pinot Noir. Hosts annual harvest event in October.',
    birthday: '1970-08-14',
    emails: [{ email: 'carlos@mendezestatewines.com', type: 'work' }],
    phones: [{ phone: '+17075551010', phoneDisplay: '(707) 555-1010', type: 'work' }],
    address: { street: '4200 Silverado Trail', city: 'Napa', state: 'CA', postalCode: '94558', country: 'United States', type: 'work' },
    categories: ['Personal', 'VIP'],
    linkedin: { headline: 'Vineyard Owner & Winemaker | Third-generation viticulturist', about: 'Carrying on a family tradition of winemaking in Napa Valley. We produce small-lot, estate-grown Pinot Noir and Chardonnay with a focus on sustainability and terroir expression.', jobTitle: 'Owner & Winemaker', companyName: 'Mendez Estate Wines', industry: 'Wine & Spirits', location: 'Napa Valley, CA', skills: ['Viticulture', 'Winemaking', 'Sustainable Agriculture', 'Business Management'], positions: [{ title: 'Owner & Winemaker', company: 'Mendez Estate Wines', startDate: '2005-01' }] },
    lat: 38.2975,
    lon: -122.2869,
  },
  {
    id: 11,
    firstName: 'Rachel',
    lastName: 'Green',
    title: 'Marketing Director',
    company: 'BrightPath Media',
    notes: 'Runs our digital ad campaigns. Data-driven approach, great results.',
    birthday: '1991-04-22',
    emails: [{ email: 'rachel@brightpathmedia.com', type: 'work' }, { email: 'rachelg.marketing@gmail.com', type: 'home' }],
    phones: [{ phone: '+15125551011', phoneDisplay: '(512) 555-1011', type: 'work' }],
    address: { street: '500 W 2nd St, Suite 1900', city: 'Austin', state: 'TX', postalCode: '78701', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: { headline: 'Marketing Director | Growth Strategy | B2B SaaS', about: 'I help B2B SaaS companies scale from $1M to $50M ARR through data-driven marketing strategies. Specializing in content marketing, paid acquisition, and marketing operations.', jobTitle: 'Marketing Director', companyName: 'BrightPath Media', industry: 'Marketing & Advertising', location: 'Austin, TX', skills: ['Digital Marketing', 'Growth Strategy', 'Content Marketing', 'Marketing Analytics', 'B2B SaaS'], positions: [{ title: 'Marketing Director', company: 'BrightPath Media', startDate: '2021-06' }, { title: 'Senior Marketing Manager', company: 'HubSpot', startDate: '2017-03', endDate: '2021-05' }] },
    lat: 30.2672,
    lon: -97.7431,
  },
  {
    id: 12,
    firstName: 'Omar',
    lastName: 'Hassan',
    title: 'Civil Engineer',
    company: 'Atlas Infrastructure',
    notes: 'Consulting on the new parking structure project. PE licensed in 3 states.',
    birthday: '1979-06-14',
    emails: [{ email: 'ohassan@atlasinfra.com', type: 'work' }],
    phones: [{ phone: '+12025551012', phoneDisplay: '(202) 555-1012', type: 'work' }],
    address: { street: '1750 K St NW, Suite 400', city: 'Washington', state: 'DC', postalCode: '20006', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: null,
    lat: 38.9072,
    lon: -77.0369,
  },
  {
    id: 13,
    firstName: 'Sophie',
    lastName: 'Laurent',
    title: 'Gallery Owner',
    company: 'Laurent Contemporary',
    notes: 'Curates amazing contemporary art exhibitions. Hosted our company event.',
    birthday: '1983-06-28',
    emails: [{ email: 'sophie@laurentcontemporary.com', type: 'work' }],
    phones: [{ phone: '+13125551013', phoneDisplay: '(312) 555-1013', type: 'work' }],
    address: { street: '300 W Superior St', city: 'Chicago', state: 'IL', postalCode: '60654', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: null,
    lat: 41.8957,
    lon: -87.6363,
  },
  {
    id: 14,
    firstName: 'Michael',
    lastName: 'Torres',
    title: 'Fitness Studio Owner',
    company: 'CorePower Athletics',
    notes: 'Runs a great HIIT and yoga studio. Offers corporate wellness programs.',
    birthday: '1987-02-10',
    emails: [{ email: 'michael@corepowerathletics.com', type: 'work' }],
    phones: [{ phone: '+13035551014', phoneDisplay: '(303) 555-1014', type: 'work' }],
    address: { street: '1600 Wynkoop St', city: 'Denver', state: 'CO', postalCode: '80202', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: null,
    lat: 39.7525,
    lon: -105.0001,
  },
  {
    id: 15,
    firstName: 'Hannah',
    lastName: 'Berg',
    title: 'Veterinarian',
    company: 'Riverside Animal Care',
    notes: 'Our family vet. Excellent with anxious pets. Open on Saturdays.',
    birthday: '1986-10-27',
    emails: [{ email: 'hberg@riversidevetcare.com', type: 'work' }],
    phones: [{ phone: '+16195551015', phoneDisplay: '(619) 555-1015', type: 'work' }],
    address: { street: '3800 Park Blvd', city: 'San Diego', state: 'CA', postalCode: '92103', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: null,
    lat: 32.7157,
    lon: -117.1611,
  },
  {
    id: 16,
    firstName: 'Raj',
    lastName: 'Kapoor',
    title: 'Product Manager',
    company: 'CloudScale Inc',
    notes: 'Former colleague from my time at Google. Now leading PM at CloudScale.',
    birthday: '1992-10-05',
    emails: [{ email: 'raj.kapoor@cloudscale.io', type: 'work' }, { email: 'raj.k.pm@gmail.com', type: 'home' }],
    phones: [{ phone: '+12065551016', phoneDisplay: '(206) 555-1016', type: 'work' }],
    address: { street: '400 Broad St', city: 'Seattle', state: 'WA', postalCode: '98109', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: { headline: 'Product Manager at CloudScale | Ex-Google | Building for scale', about: 'Product manager passionate about developer platforms and cloud infrastructure. Previously at Google Cloud, now building the next generation of auto-scaling solutions at CloudScale.', jobTitle: 'Senior Product Manager', companyName: 'CloudScale Inc', industry: 'Cloud Computing', location: 'Seattle, WA', skills: ['Product Management', 'Cloud Infrastructure', 'Agile', 'Data-Driven Decision Making'], positions: [{ title: 'Senior Product Manager', company: 'CloudScale Inc', startDate: '2023-01' }, { title: 'Product Manager', company: 'Google Cloud', startDate: '2019-08', endDate: '2022-12' }] },
    lat: 47.6062,
    lon: -122.3321,
  },
  {
    id: 17,
    firstName: 'Emma',
    lastName: 'Williams',
    title: 'Journalist',
    company: 'The Morning Chronicle',
    notes: 'Tech beat reporter. Has covered our product launches favorably.',
    birthday: '1993-02-17',
    emails: [{ email: 'ewilliams@morningchronicle.com', type: 'work' }],
    phones: [{ phone: '+14155551017', phoneDisplay: '(415) 555-1017', type: 'work' }],
    address: { street: '901 Mission St', city: 'San Francisco', state: 'CA', postalCode: '94103', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: null,
    lat: 37.7793,
    lon: -122.4093,
  },
  {
    id: 18,
    firstName: 'Daniel',
    lastName: 'Okafor',
    title: 'Architect',
    company: 'Okafor Design Studio',
    notes: 'Award-winning architect. Designed the new community center downtown.',
    birthday: '1980-03-25',
    emails: [{ email: 'daniel@okafordesign.com', type: 'work' }],
    phones: [{ phone: '+14045551018', phoneDisplay: '(404) 555-1018', type: 'work' }],
    address: { street: '675 Ponce de Leon Ave NE', city: 'Atlanta', state: 'GA', postalCode: '30308', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: null,
    lat: 33.749,
    lon: -84.388,
  },
  {
    id: 19,
    firstName: 'Julia',
    lastName: 'Rossi',
    title: 'Pastry Chef',
    company: 'La Dolce Vita Bakery',
    notes: 'Makes the best cannoli in town. Caters our office birthday celebrations.',
    birthday: '1989-12-20',
    emails: [{ email: 'julia@ladolcevitabakery.com', type: 'work' }],
    phones: [{ phone: '+17185551019', phoneDisplay: '(718) 555-1019', type: 'work' }],
    address: { street: '155 Atlantic Ave', city: 'Brooklyn', state: 'NY', postalCode: '11201', country: 'United States', type: 'work' },
    categories: ['Personal'],
    linkedin: null,
    lat: 40.6782,
    lon: -73.9442,
  },
  {
    id: 20,
    firstName: 'Ben',
    lastName: 'Calloway',
    title: 'Music Producer',
    company: 'Echo Sound Studios',
    notes: 'Produced the audio for our product launch video. Very creative.',
    birthday: '1984-07-31',
    emails: [{ email: 'ben@echosoundstudios.com', type: 'work' }],
    phones: [{ phone: '+16155551020', phoneDisplay: '(615) 555-1020', type: 'work' }],
    address: { street: '1005 16th Ave S', city: 'Nashville', state: 'TN', postalCode: '37212', country: 'United States', type: 'work' },
    categories: ['Business'],
    linkedin: { headline: 'Music Producer & Sound Engineer | Grammy-nominated | Nashville', about: 'Award-winning music producer and sound engineer with 15+ years in the Nashville music scene. Specializing in indie rock, folk, and podcast production. My studio is a creative haven for artists.', jobTitle: 'Owner & Lead Producer', companyName: 'Echo Sound Studios', industry: 'Music', location: 'Nashville, TN', skills: ['Music Production', 'Sound Engineering', 'Pro Tools', 'Mixing & Mastering'], positions: [{ title: 'Owner & Lead Producer', company: 'Echo Sound Studios', startDate: '2014-01' }] },
    lat: 36.1627,
    lon: -86.7816,
  },
];

export const SAMPLE_BOOK: SampleContact[] = RAW_BOOK.map((contact) => ({
  ...contact,
  name: `${contact.firstName} ${contact.lastName}`,
  email: contact.emails[0].email,
  phone: contact.phones[0].phoneDisplay,
  city: contact.address.city,
}));

export interface UpcomingBirthday {
  contact: SampleContact;
  date: Date;
  turns: number;
  inDays: number;
}

/** The next `count` birthdays from `today`, the way the Dashboard lists them. */
export function upcomingBirthdays(today: Date, count: number): UpcomingBirthday[] {
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  return SAMPLE_BOOK.map((contact) => {
    const [year, month, day] = contact.birthday.split('-').map(Number);
    let date = new Date(start.getFullYear(), month - 1, day);
    if (date < start) date = new Date(start.getFullYear() + 1, month - 1, day);
    const inDays = Math.round((date.getTime() - start.getTime()) / 86_400_000);
    return { contact, date, turns: date.getFullYear() - year, inDays };
  })
    .sort((a, b) => a.inDays - b.inDays)
    .slice(0, count);
}

export function matchesQuery(contact: SampleContact, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [contact.name, contact.title, contact.company, contact.city, contact.email]
    .some((field) => field.toLowerCase().includes(q));
}

/** Groups (vCard CATEGORIES) with member counts, largest first. */
export const SAMPLE_GROUPS: { name: string; count: number }[] = (() => {
  const counts = new Map<string, number>();
  for (const contact of SAMPLE_BOOK) {
    for (const category of contact.categories) counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return [...counts].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
})();

/** Cities by number of people, as the Dashboard's Top Cities card ranks them. */
export const SAMPLE_TOP_CITIES: { city: string; count: number }[] = (() => {
  const counts = new Map<string, number>();
  for (const contact of SAMPLE_BOOK) counts.set(contact.city, (counts.get(contact.city) ?? 0) + 1);
  return [...counts]
    .map(([city, count]) => ({ city, count }))
    .sort((a, b) => b.count - a.count || a.city.localeCompare(b.city));
})();
