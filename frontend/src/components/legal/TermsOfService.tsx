import { Link } from 'react-router-dom';
import { ContactEmail, Fill, LegalPage, type LegalSection } from './LegalPage';
import { LEGAL } from './legalDetails';

/* Drafting notes and open questions for counsel live in docs/legal-review.md. */

const sections: LegalSection[] = [
  {
    id: 'agreement',
    title: 'The agreement',
    body: (
      <>
        <p>
          These Terms are an agreement between you and <Fill value={LEGAL.entityName} /> ({'“'}Yello{'”'},
          {' “'}we{'”'}, {'“'}us{'”'}) and cover your use of the Yello website, web app and desktop app
          (together, the {'“'}Service{'”'}). By creating an account, starting the demo or otherwise
          using the Service, you agree to these Terms and to our{' '}
          <Link to="/privacy">Privacy Policy</Link>. If you do not agree, do not use the Service.
        </p>
        <p>
          If you use Yello on behalf of an organisation, you confirm that you can bind it to these
          Terms, and {'“'}you{'”'} includes that organisation.
        </p>
      </>
    ),
  },
  {
    id: 'accounts',
    title: 'Your account',
    body: (
      <>
        <p>
          You must be at least {LEGAL.minimumAge} years old, and old enough to agree to these Terms where
          you live, to use Yello. You sign in with a Google account, and you are responsible for keeping
          that account secure and for everything that happens under your Yello account. Tell us at{' '}
          <ContactEmail /> if you think someone else has used it.
        </p>
        <p>
          The demo gives anyone a temporary account filled with invented sample contacts. It lasts 2
          hours and is then deleted. Do not put real information into the demo.
        </p>
      </>
    ),
  },
  {
    id: 'service',
    title: 'The Service',
    body: (
      <>
        <p>
          Yello is a personal contact manager: it stores your contacts, helps you import, merge, clean
          up, map and export them, and can sync with services you connect. Yello is under active
          development. We may add, change or remove features, and some features may be labelled as
          early or experimental.
        </p>
        <p>
          Yello is free to use today. If we introduce paid plans, we will tell you in advance, and you
          will not be charged unless you choose a paid plan.
        </p>
        <p>
          The desktop app is a window onto the web Service. We grant you a personal, non-exclusive,
          non-transferable, revocable licence to install and use it to access the Service under these
          Terms.
        </p>
      </>
    ),
  },
  {
    id: 'your-content',
    title: 'Your content and the people in it',
    body: (
      <>
        <p>
          {'“'}Your content{'”'} means the contacts, notes, photos, files and other information you put
          into Yello or bring in from services you connect. You keep all of your rights in it. You give
          us a limited licence to host, copy, process, transmit and display your content only as needed
          to run, secure and improve the Service for you, to follow your instructions (such as syncing to
          Google or iCloud or publishing your public card), and to comply with the law. This licence ends
          when your content is deleted from the Service, apart from copies in backups that are deleted on
          their normal schedule.
        </p>
        <p>
          Your book holds information about other people. You are responsible for your content and
          promise that you have the right to store and use it in Yello, and that doing so does not break
          any law, contract or anyone{'’'}s rights. Yello is designed for keeping your own contacts. If
          you use it for business purposes, you are responsible for meeting the data protection laws
          that apply to you, including giving notices to and handling requests from the people in your
          book.
        </p>
        <p>
          You can export your book as vCard at any time. You are responsible for keeping your own copies
          of anything important to you.
        </p>
      </>
    ),
  },
  {
    id: 'connected-services',
    title: 'Connected services',
    body: (
      <>
        <p>
          Yello can connect to services run by others, such as Google (sign-in, Contacts and Gmail),
          Apple iCloud and Apify. When you connect one, you authorise Yello to access it on your behalf
          as described when you connect it and in our Privacy Policy. Those services are governed by
          their own terms and privacy policies, are not under our control, and may change, limit or stop
          their access at any time, which can affect Yello features.
        </p>
        <p>
          <strong>LinkedIn enrichment</strong> runs through Apify under your own Apify account and API
          key, and you pay Apify directly for it. Collecting information from LinkedIn may be restricted
          by LinkedIn{'’'}s terms and by law where you or the people concerned live. You are solely
          responsible for deciding whether you may use enrichment, for the profiles you choose to enrich,
          and for your use of Apify. We may limit or remove the feature at any time.
        </p>
      </>
    ),
  },
  {
    id: 'sync',
    title: 'Two-way sync and switching to Yello',
    body: (
      <>
        <p>
          If you turn on two-way sync, Yello will make changes in the Google and iCloud accounts you
          connect so they match your book. In particular:
        </p>
        <ul>
          <li>
            edits, merges and deletions you make in Yello, including emptying your archive or deleting
            all contacts, are carried over to the connected account and can delete contacts there;
          </li>
          <li>
            when you switch to Yello as your source of truth, Yello applies the plan you reviewed, which
            can create, change and delete contacts in the connected account; and
          </li>
          <li>when the same contact changes in both places, Yello{'’'}s version may win.</li>
        </ul>
        <p>
          Yello saves a backup and earlier versions of changed contacts before making these changes, and
          asks you to confirm before it deletes anything remotely. Backups reduce the risk of loss but do
          not remove it. Before turning on sync or switching to Yello, you should keep your own export of
          each connected account. You are responsible for reviewing changes before you confirm them.
        </p>
      </>
    ),
  },
  {
    id: 'public-card',
    title: 'Your public card',
    body: (
      <p>
        If you turn on your public card, anyone with its link can see the fields you switch on. Only
        publish information about yourself, and only what you are happy for anyone to see. We may turn
        off a public card that breaks these Terms.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use Yello to break any law or anyone{'’'}s rights, including privacy and data protection rights;</li>
          <li>
            use Yello to send spam, harass, stalk, or track people, or to compile information for
            discrimination, surveillance or resale;
          </li>
          <li>upload content you have no right to use, or content that is unlawful or malicious;</li>
          <li>
            access or try to access another user{'’'}s data, probe or break our security, or get around
            rate limits or access controls;
          </li>
          <li>
            interfere with or overload the Service, or use automated means to access it other than the
            features Yello provides;
          </li>
          <li>
            copy, resell or offer the Service to others, or reverse engineer it, except where the law
            allows despite this limit; or
          </li>
          <li>help anyone else do any of these things.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'ours',
    title: 'Our rights',
    body: (
      <p>
        Yello, including its software, design, name and logo, belongs to us and our licensors and is
        protected by law. These Terms do not give you any right to it except the right to use the Service
        as described here. If you send us feedback or ideas, we may use them without any obligation to
        you.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Ending your use',
    body: (
      <>
        <p>
          You can stop using Yello at any time and ask us to delete your account by emailing{' '}
          <ContactEmail />. Export your book first: once your account is deleted it cannot be recovered.
          Deleting your Yello account does not delete anything in your connected Google or iCloud
          accounts.
        </p>
        <p>
          We may suspend or close your account if you seriously or repeatedly break these Terms, if the
          law requires it, or if your use puts the Service or other users at risk. Unless the reason makes
          it inappropriate, we will tell you first and give you a reasonable chance to export your book.
          We may also stop offering the Service; if we do, we will give you at least{' '}
          <Fill value={LEGAL.shutdownNoticeDays} /> days{'’'} notice to export your data.
        </p>
        <p>
          Sections that by their nature should survive the end of these Terms, including those on your
          content licence for backups, our rights, disclaimers, limitation of liability, indemnity and
          disputes, will survive.
        </p>
      </>
    ),
  },
  {
    id: 'disclaimers',
    title: 'Disclaimers',
    body: (
      <>
        <p className="legal__caps">
          The Service is provided {'“'}as is{'”'} and {'“'}as available{'”'}. To the fullest extent
          permitted by law, we disclaim all warranties, express or implied, including warranties of
          merchantability, fitness for a particular purpose, title and non-infringement.
        </p>
        <p>
          We do not promise that Yello will be uninterrupted, error-free or secure, that it will never
          lose data, that imports, merges, address lookups, enrichment or sync results will be accurate or
          complete, or that connected services will remain available. Suggestions such as duplicates,
          address corrections and enrichment are for you to check before you rely on them.
        </p>
      </>
    ),
  },
  {
    id: 'liability',
    title: 'Limitation of liability',
    body: (
      <>
        <p className="legal__caps">
          To the fullest extent permitted by law, neither we nor our suppliers will be liable for any
          indirect, incidental, special, consequential or punitive damages, or for any loss of data,
          contacts, profits, revenue, goodwill or business opportunity, arising out of or relating to
          the Service or these Terms, even if we have been told such damages are possible.
        </p>
        <p className="legal__caps">
          Our total liability for all claims arising out of or relating to the Service or these Terms is
          limited to the greater of the amount you paid us for the Service in the 12 months before the
          claim and <Fill value={LEGAL.liabilityCap} />.
        </p>
        <p>
          Nothing in these Terms limits liability that cannot be limited by law, such as liability for
          fraud, gross negligence or wilful misconduct, or for death or personal injury caused by
          negligence. If you are a consumer, you also keep any rights that the law where you live gives
          you and that cannot be waived by contract.
        </p>
      </>
    ),
  },
  {
    id: 'indemnity',
    title: 'Indemnity',
    body: (
      <p>
        To the extent permitted by law, you will defend and indemnify us against claims, losses and costs
        (including reasonable legal fees) brought by third parties that arise from your content, your use
        of connected services or enrichment, or your breach of these Terms or the law.
      </p>
    ),
  },
  {
    id: 'disputes',
    title: 'Governing law and disputes',
    body: (
      <>
        <p>
          These Terms are governed by <Fill value={LEGAL.governingLaw} />, without regard to its
          conflict-of-laws rules. Any dispute arising out of or relating to these Terms or the Service
          will be heard exclusively in <Fill value={LEGAL.venue} />, and you and we consent to their
          jurisdiction.
        </p>
        <p>
          If you are a consumer living in the European Union or the United Kingdom, you may also bring
          proceedings in the courts where you live, and you keep the protection of the mandatory laws of
          your country.
        </p>
        <p>Before starting proceedings, please contact us so we can try to resolve the issue informally.</p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'Changes to these Terms',
    body: (
      <p>
        We may update these Terms. We will post the new version here with a new date and, for a
        significant change, tell you in the app or by email at least <Fill value={LEGAL.termsNoticeDays} /> days before it
        takes effect. If you keep using Yello after a change takes effect, you accept the new Terms; if
        you do not agree, stop using Yello and ask us to delete your account.
      </p>
    ),
  },
  {
    id: 'general',
    title: 'General',
    body: (
      <p>
        These Terms and the Privacy Policy are the whole agreement between you and us about the Service.
        If any part is found unenforceable, the rest stays in effect. If we do not enforce a right, we
        have not waived it. You may not transfer these Terms without our consent; we may transfer them as
        part of a merger, acquisition or sale of assets. We are not responsible for delays or failures
        caused by events beyond our reasonable control, including outages of hosting or connected
        services.
      </p>
    ),
  },
  {
    id: 'contact',
    title: 'Contact us',
    body: (
      <p>
        Questions about these Terms go to <ContactEmail />, or by post to{' '}
        <Fill value={LEGAL.entityName} />, <Fill value={LEGAL.entityAddress} />.
      </p>
    ),
  },
];

export function TermsOfService() {
  return (
    <LegalPage
      title="Terms of Service"
      summary={
        <>
          <p>The short version:</p>
          <ul>
            <li>Your book is yours. You give us only the rights we need to run Yello for you.</li>
            <li>You are responsible for having the right to keep the people in your book.</li>
            <li>
              Two-way sync changes and deletes contacts in Google and iCloud. Keep your own export before
              you turn it on.
            </li>
            <li>Yello is provided as is, and our liability is limited.</li>
          </ul>
          <p>This summary is for convenience. The full Terms below are what apply.</p>
        </>
      }
      sections={sections}
    />
  );
}
