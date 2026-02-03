import { SocialLinksWithinContact } from './SocialLinksWithinContact';

export function SocialLinksCleanup() {
  return (
    <div className="social-links-cleanup">
      <div className="social-links-description">
        <p>
          Social links (LinkedIn, Twitter, etc.) sometimes get stored in the generic URLs table
          instead of the Social Profiles table. This cleanup migrates them to the correct location.
        </p>
      </div>
      <SocialLinksWithinContact />
    </div>
  );
}
