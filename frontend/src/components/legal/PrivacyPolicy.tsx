import { Link } from 'react-router-dom';
import { ContactEmail, Fill, LegalPage, type LegalSection } from './LegalPage';
import { LEGAL } from './legalDetails';

/*
 * Every factual statement here is traced to the code in docs/legal-review.md.
 * When a data practice changes (a new provider, scope, cookie or retention
 * rule), update this page and that file in the same change.
 */

const sections: LegalSection[] = [
  {
    id: 'who-we-are',
    title: 'Who we are',
    body: (
      <>
        <p>
          Yello is a personal contact manager. It is operated by <Fill value={LEGAL.entityName} />,{' '}
          <Fill value={LEGAL.entityAddress} /> ({'“'}Yello{'”'}, {'“'}we{'”'}, {'“'}us{'”'}). This policy
          explains what information Yello collects, how we use it, who we share it with and the choices
          you have. It covers the website, the web app and the Yello desktop app.
        </p>
        <p>
          For the information about your own account, we are the controller. For the contacts you bring
          into Yello, you decide what goes in your book and what happens to it, and we process that
          information on your behalf to run the service (see{' '}
          <a href="#people-in-your-book">The people in your book</a>).
        </p>
      </>
    ),
  },
  {
    id: 'what-we-collect',
    title: 'Information we collect',
    body: (
      <>
        <h3>Your account</h3>
        <p>
          You sign in with Google. We receive and store your Google account ID, name, email address and
          profile picture. We also keep a record of your sign-in sessions and when your account was
          created.
        </p>

        <h3>The contacts you bring in</h3>
        <p>
          Your book holds whatever you add or import: names, phone numbers, email addresses, postal
          addresses, companies and job titles, birthdays, notes, social profile links, groups, photos
          and similar details. You can add contacts by hand, upload vCard files, upload a LinkedIn
          Connections export, or import from Google Contacts and iCloud. We keep the original files of
          some imports so an import can be checked or undone (see{' '}
          <a href="#retention">How long we keep information</a>).
        </p>

        <h3>Services you connect</h3>
        <ul>
          <li>
            <strong>Google Contacts.</strong> With your permission we read your Google contacts and the
            {' “'}other contacts{'”'} Google keeps from your email (names, email addresses, phone numbers,
            addresses, organisations, birthdays, notes, links and photos). If you turn on two-way sync,
            we also create, change and delete contacts in your Google account to keep it matched to
            Yello.
          </li>
          <li>
            <strong>iCloud Contacts.</strong> You give us your Apple ID email and an app-specific
            password, which we use to read your iCloud contacts and, if you turn on two-way sync, to
            create, change and delete them. We store the password encrypted and never see your main
            Apple ID password.
          </li>
          <li>
            <strong>Gmail.</strong> If you connect Gmail, we read the headers of messages you have
            exchanged with your contacts (sender, recipients, subject and date) and the short preview
            snippet Gmail provides. We do not read or store full message bodies or attachments. We store
            the subject, date, direction and snippet against the matching contact so you can see your
            email history with them. To suggest people you write to often, we may also scan the headers
            of your recent messages; that scan is counted in memory and not stored.
          </li>
          <li>
            <strong>LinkedIn enrichment.</strong> If you add your own Apify API key, Yello sends the
            LinkedIn profile links of contacts you choose to Apify, a third-party service run under your
            Apify account, and stores the public profile details it returns (such as headline, current
            role, company, location, education, skills and photo).
          </li>
        </ul>

        <h3>Information created as you use Yello</h3>
        <p>
          Yello works out map coordinates for addresses, finds likely duplicates, keeps an archive of
          contacts you remove, and records imports, sync activity, backups and earlier versions of
          contacts that sync has changed.
        </p>

        <h3>Technical information</h3>
        <p>
          Like most web services, our servers log requests, including your IP address, the page or API
          address requested, the time and the response. Logs can also contain identifiers from your
          book, such as a contact{'’'}s email address, when we record what a background task did. We use
          logs to keep Yello running, secure and debuggable.
        </p>

        <h3>What we do not collect</h3>
        <p>
          We do not use advertising or analytics trackers, we do not take payments, and the desktop app
          sends no telemetry or crash reports.
        </p>
      </>
    ),
  },
  {
    id: 'how-we-use',
    title: 'How we use information',
    body: (
      <>
        <p>We use information only to provide and protect Yello for you:</p>
        <ul>
          <li>to sign you in and keep your session;</li>
          <li>to store, search, organise, merge, clean up, map and export your contacts;</li>
          <li>to import from and sync with the services you connect, when you ask us to;</li>
          <li>to show email history and suggestions from Gmail, when you connect it;</li>
          <li>to publish your own contact card, if you turn it on;</li>
          <li>to make backups that let you undo imports and sync changes;</li>
          <li>to keep Yello secure, prevent abuse and fix problems; and</li>
          <li>to meet our legal obligations and enforce our <Link to="/terms">Terms</Link>.</li>
        </ul>
        <p>
          We do not sell your information, use it for advertising, build profiles of you or your
          contacts for anyone else, or use your contacts or email data to train AI models.
        </p>
        <h3>Legal bases (EEA and UK)</h3>
        <p>
          Where data protection law requires a legal basis, we rely on <strong>contract</strong> to
          provide the service you signed up for, on your <strong>consent</strong> when you connect
          Google, Gmail, iCloud or Apify (which you can withdraw at any time by disconnecting), on our{' '}
          <strong>legitimate interests</strong> in keeping Yello secure and working, and on{' '}
          <strong>legal obligation</strong> where the law requires us to keep or disclose information.
        </p>
      </>
    ),
  },
  {
    id: 'google-data',
    title: 'Google user data',
    body: (
      <>
        <p>Yello asks Google for these permissions, each only when you use the feature that needs it:</p>
        <div className="legal__table-wrap">
          <table className="legal__table">
            <thead>
              <tr>
                <th scope="col">Permission</th>
                <th scope="col">When</th>
                <th scope="col">What Yello does with it</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Basic profile and email</td>
                <td>Sign-in</td>
                <td>Creates and identifies your account.</td>
              </tr>
              <tr>
                <td>Other contacts (read only)</td>
                <td>Sign-in</td>
                <td>Reads the people Google saved from your email, to offer them for import and to find photos for contacts.</td>
              </tr>
              <tr>
                <td>Contacts (read only)</td>
                <td>Importing from Google</td>
                <td>Reads your Google contacts so you can import them.</td>
              </tr>
              <tr>
                <td>Contacts (read and write)</td>
                <td>Turning on two-way sync</td>
                <td>Keeps your Google contacts matched to Yello, including creating, changing and deleting contacts.</td>
              </tr>
              <tr>
                <td>Gmail (read only)</td>
                <td>Connecting Gmail</td>
                <td>Reads message headers and snippets to show your email history with each contact.</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Yello{'’'}s use and transfer of information received from Google APIs adheres to the{' '}
          <a href="https://developers.google.com/terms/api-services-user-data-policy" target="_blank" rel="noreferrer">
            Google API Services User Data Policy
          </a>
          , including the Limited Use requirements. In particular, we use Google user data only to
          provide the features you see in Yello; we do not transfer it to others except as needed to run
          those features, for security, or to comply with the law; we do not use it for advertising; and
          no person reads it unless you ask us to (for example, for support), it is needed for security
          or legal reasons, or it has been aggregated and anonymised for running the service.
        </p>
        <p>
          We store Google access tokens encrypted. You can remove Yello{'’'}s access at any time from
          your{' '}
          <a href="https://myaccount.google.com/permissions" target="_blank" rel="noreferrer">
            Google Account permissions
          </a>
          ; features that need it will stop working until you reconnect.
        </p>
      </>
    ),
  },
  {
    id: 'people-in-your-book',
    title: 'The people in your book',
    body: (
      <>
        <p>
          Your book contains information about other people. Yello stores it for you, as a tool, and does
          not use it for any other purpose, combine it with other users{'’'} books, or contact the people
          in it. Each user{'’'}s book is kept in its own separate database.
        </p>
        <p>
          You are responsible for having the right to keep and use the information you put in Yello.
          If you are in someone{'’'}s book and want to ask about your information, please contact the
          person who added you. You can also write to us at <ContactEmail />, and we will help where we
          can.
        </p>
      </>
    ),
  },
  {
    id: 'sharing',
    title: 'Who we share information with',
    body: (
      <>
        <p>
          We share information only with the service providers that help run Yello, with services you
          connect yourself, and where the law requires it.
        </p>
        <div className="legal__table-wrap">
          <table className="legal__table">
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Purpose</th>
                <th scope="col">Information involved</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Railway</td>
                <td>Hosting, storage and server logs</td>
                <td>Everything Yello stores, on servers in <Fill value={LEGAL.hostingRegion} /></td>
              </tr>
              <tr>
                <td>Google</td>
                <td>Sign-in, Google Contacts and Gmail</td>
                <td>Your Google account and the data described above</td>
              </tr>
              <tr>
                <td>Apple (iCloud)</td>
                <td>iCloud Contacts import and sync</td>
                <td>Your iCloud contacts, sent and received using your app-specific password</td>
              </tr>
              <tr>
                <td>HERE Technologies</td>
                <td>Turning addresses into map locations</td>
                <td>Postal addresses from your book, without names or other details</td>
              </tr>
              <tr>
                <td>Gravatar (Automattic)</td>
                <td>Finding profile photos</td>
                <td>A one-way hash of your email address and of your contacts{'’'} email addresses</td>
              </tr>
              <tr>
                <td>Apify (your own account)</td>
                <td>LinkedIn enrichment, only if you add your key</td>
                <td>The LinkedIn profile links of contacts you choose</td>
              </tr>
              <tr>
                <td>OpenStreetMap</td>
                <td>Map tiles on the Map page</td>
                <td>Your IP address and the map area you view</td>
              </tr>
              <tr>
                <td>Google Fonts, Font Awesome</td>
                <td>Fonts and icons in the web app</td>
                <td>Your IP address and browser details</td>
              </tr>
              <tr>
                <td>goqr.me (api.qrserver.com)</td>
                <td>QR code for your public card</td>
                <td>Your public card{'’'}s link</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p>
          Services you connect, such as Google, Apple and Apify, handle information under their own
          privacy policies. We may also disclose information if we believe in good faith that the law
          requires it, to protect the rights, safety or property of our users, the public or Yello, or
          as part of a merger, acquisition or sale of assets, in which case this policy will continue to
          apply to your information or you will be told before it changes.
        </p>
      </>
    ),
  },
  {
    id: 'public-card',
    title: 'Your public card',
    body: (
      <p>
        You can share your own contact card at a public link. It is off until you turn it on. When it is
        on, only your name and photo show until you switch on more fields one at a time, and anyone with
        the link can see what you have switched on. Notes are never shown. You can turn the card off at
        any time.
      </p>
    ),
  },
  {
    id: 'cookies',
    title: 'Cookies and local storage',
    body: (
      <>
        <p>
          Yello uses only cookies that are strictly necessary to run it: a session cookie that keeps you
          signed in (for up to 30 days, or 2 hours for the demo), and short-lived cookies, lasting about
          10 minutes, that protect sign-in and connection flows. We do not use advertising or analytics
          cookies.
        </p>
        <p>
          The app also saves a few preferences in your browser{'’'}s local storage, such as how you like
          to view a list, whether you dismissed a banner, and an import that is still running. These
          stay on your device.
        </p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep information',
    body: (
      <>
        <p>We keep your information for as long as you have a Yello account. Specifically:</p>
        <ul>
          <li>
            <strong>Your book</strong>, including contacts you archive, stays until you delete it or your
            account.
          </li>
          <li>
            <strong>Backups and earlier versions.</strong> Before Yello changes or deletes contacts in
            Google or iCloud, it saves a backup and the earlier version of each changed contact, so you
            can restore them. Yello also keeps a compressed copy of the original cards from your first
            imports. These are kept with your account and deleted with it.
          </li>
          <li>
            <strong>Imports.</strong> A summary of each import is kept with your account. An uploaded file
            is deleted once its import succeeds; if an import fails, the file is kept so the import can be
            retried or investigated.
          </li>
          <li>
            <strong>Connections.</strong> When you disconnect iCloud or remove an Apify key, we delete the
            stored credentials.
          </li>
          <li>
            <strong>Server logs</strong> are kept for <Fill value={LEGAL.logRetention} />.
          </li>
          <li>
            <strong>Demo accounts</strong> expire after 2 hours and are deleted after that.
          </li>
        </ul>
        <p>
          When you ask us to delete your account, we delete your account, your book, its photos,
          backups and stored credentials within <Fill value={LEGAL.deletionDays} /> days, except where the law requires
          us to keep something longer.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        Yello is served only over encrypted connections (HTTPS). Each user{'’'}s book is stored in its own
        database file, and photos are served only to their signed-in owner. Passwords and access tokens
        for connected services are encrypted at rest. Access to production systems is limited to the
        people who operate Yello. No service is perfectly secure, so we cannot guarantee that information
        will never be accessed without permission; if a breach affects your information, we will tell you
        as the law requires.
      </p>
    ),
  },
  {
    id: 'your-rights',
    title: 'Your choices and rights',
    body: (
      <>
        <p>You are in control of your book:</p>
        <ul>
          <li>
            <strong>Export:</strong> download your whole book, or your archive, as vCard at any time.
          </li>
          <li>
            <strong>Correct or delete:</strong> edit or delete any contact, or delete all contacts at once.
          </li>
          <li>
            <strong>Disconnect:</strong> remove iCloud, Apify or Google access whenever you like.
          </li>
          <li>
            <strong>Delete your account:</strong> email <ContactEmail /> from the address you sign in with.
          </li>
        </ul>
        <p>
          Depending on where you live, you may also have the right to access, correct, delete or receive
          a copy of your personal information, to object to or restrict how we use it, to withdraw
          consent, and to complain to your data protection authority. Residents of California and other
          US states with privacy laws have similar rights; we do not sell or share personal information
          for cross-context behavioural advertising, and we will not treat you differently for using your
          rights. To make a request, email <ContactEmail />. We may need to confirm your identity first,
          and we will answer within the time the law allows.
        </p>
      </>
    ),
  },
  {
    id: 'transfers',
    title: 'International transfers',
    body: (
      <p>
        Yello and some of its providers operate in <Fill value={LEGAL.hostingRegion} /> and other countries,
        which may have different data protection laws from where you live. Where the law requires it, we
        protect transfers with appropriate safeguards such as the European Commission{'’'}s Standard
        Contractual Clauses.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: (
      <p>
        Yello is not for anyone under {LEGAL.minimumAge}. We do not knowingly collect information from
        children under that age. If you believe a child has created an account, contact us and we will
        delete it.
      </p>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        We may update this policy as Yello changes. We will post the new version here with a new date,
        and if a change is significant we will tell you in the app or by email before it takes effect.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions or requests about privacy go to <ContactEmail />, or by post to{' '}
        <Fill value={LEGAL.entityName} />, <Fill value={LEGAL.entityAddress} />.
      </p>
    ),
  },
];

export function PrivacyPolicy() {
  return (
    <LegalPage
      title="Privacy Policy"
      summary={
        <>
          <p>The short version:</p>
          <ul>
            <li>Your book is yours. We store it to run Yello for you and use it for nothing else.</li>
            <li>We never sell your data, show you ads or use your contacts or email to train AI.</li>
            <li>Google, iCloud, Gmail and LinkedIn enrichment are only used when you connect them.</li>
            <li>You can export everything as vCard at any time, and ask us to delete your account.</li>
          </ul>
        </>
      }
      sections={sections}
    />
  );
}
