import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { usePublicProfile } from '../api/profileHooks';
import type { UserProfile, ProfilePhone } from '../api/types';

// SVG Icons as inline components for crisp rendering
function GlobeIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function WhatsAppIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

function LinkedInIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z" />
    </svg>
  );
}

function InstagramIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
    </svg>
  );
}

function QRCodeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
      <path d="M3 3h8v8H3V3zm2 2v4h4V5H5zm8-2h8v8h-8V3zm2 2v4h4V5h-4zM3 13h8v8H3v-8zm2 2v4h4v-4H5zm8-2h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm-4 4h2v2h-2v-2zm2 2h2v2h-2v-2zm2-2h2v2h-2v-2zm0 4h2v2h-2v-2z" />
    </svg>
  );
}

function MailIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <polyline points="22,6 12,13 2,6" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

// Avatar component with QR toggle capability
function ProfileAvatar({
  avatarUrl,
  name,
  showQR,
  qrCodeUrl,
  onToggleQR,
}: {
  avatarUrl: string | null;
  name: string;
  showQR: boolean;
  qrCodeUrl: string;
  onToggleQR: () => void;
}) {
  const [qrLoaded, setQrLoaded] = useState(false);

  // Preload QR code image
  useEffect(() => {
    const img = new Image();
    img.src = qrCodeUrl;
    img.onload = () => setQrLoaded(true);
  }, [qrCodeUrl]);

  const getInitials = (name: string): string => {
    const parts = name.split(' ').filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  const stringToColor = (str: string): string => {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash % 360);
    return `hsl(${hue}, 65%, 45%)`;
  };

  return (
    <div className="profile-avatar-container">
      <div
        className="profile-avatar"
        style={{
          backgroundImage: showQR && qrLoaded ? `url(${qrCodeUrl})` : avatarUrl ? `url(${avatarUrl})` : undefined,
          backgroundColor: !avatarUrl && !showQR ? stringToColor(name) : '#fff',
        }}
      >
        {!avatarUrl && !showQR && (
          <span className="avatar-initials">{getInitials(name)}</span>
        )}
      </div>
      <button
        type="button"
        className="qr-toggle-btn"
        onClick={onToggleQR}
        title={showQR ? 'Show photo' : 'Show QR code'}
        aria-label={showQR ? 'Show photo' : 'Show QR code'}
      >
        <QRCodeIcon />
      </button>
    </div>
  );
}

// Generate vCard with Base64 photo
async function generateVCard(profile: UserProfile): Promise<string> {
  const lines: string[] = [
    'BEGIN:VCARD',
    'VERSION:3.0',
  ];

  // Name
  const firstName = profile.firstName || '';
  const lastName = profile.lastName || '';
  lines.push(`N:${lastName};${firstName};;;`);
  lines.push(`FN:${firstName} ${lastName}`.trim());

  // Email (with preferred type)
  profile.emails.forEach((email, i) => {
    const type = email.type ? email.type.toUpperCase() : 'INTERNET';
    const pref = i === 0 ? ';TYPE=PREF' : '';
    lines.push(`EMAIL;TYPE=${type}${pref}:${email.email}`);
  });

  // Phone
  profile.phones.forEach((phone, i) => {
    const type = phone.type ? phone.type.toUpperCase() : 'CELL';
    const pref = i === 0 ? ';TYPE=PREF' : '';
    lines.push(`TEL;TYPE=${type}${pref}:${phone.phoneDisplay || phone.phone}`);
  });

  // Website
  if (profile.website) {
    lines.push(`URL:${profile.website}`);
  }

  // WhatsApp (as URL with custom label)
  if (profile.whatsapp) {
    const whatsappNumber = profile.whatsapp.replace(/\D/g, '');
    lines.push(`item1.URL:https://wa.me/${whatsappNumber}`);
    lines.push('item1.X-ABLabel:WhatsApp');
  }

  // Instagram
  if (profile.instagram) {
    lines.push(`item2.URL:https://instagram.com/${profile.instagram}`);
    lines.push('item2.X-ABLabel:Instagram');
  }

  // LinkedIn
  if (profile.linkedin) {
    lines.push(`item3.URL:${profile.linkedin}`);
    lines.push('item3.X-ABLabel:LinkedIn');
  }

  // Company and Title
  if (profile.company) {
    lines.push(`ORG:${profile.company}`);
  }
  if (profile.title) {
    lines.push(`TITLE:${profile.title}`);
  }

  // Photo (Base64 encoded)
  if (profile.avatarUrl) {
    try {
      const base64Photo = await fetchImageAsBase64(profile.avatarUrl);
      if (base64Photo) {
        // vCard 3.0 format for embedded photo
        lines.push(`PHOTO;ENCODING=b;TYPE=JPEG:${base64Photo}`);
      }
    } catch (error) {
      console.error('Failed to encode photo:', error);
    }
  }

  // Addresses
  profile.addresses.forEach((addr) => {
    const type = addr.type ? addr.type.toUpperCase() : 'HOME';
    const parts = [
      '', // PO Box
      '', // Extended address
      addr.street || '',
      addr.city || '',
      addr.state || '',
      addr.postalCode || '',
      addr.country || '',
    ];
    lines.push(`ADR;TYPE=${type}:${parts.join(';')}`);
  });

  lines.push('END:VCARD');

  return lines.join('\r\n');
}

// Fetch and convert image to Base64
async function fetchImageAsBase64(url: string): Promise<string | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;

    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const dataUrl = reader.result as string;
        // Extract just the base64 part (remove data:image/...;base64,)
        const base64 = dataUrl.split(',')[1];
        resolve(base64 || null);
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

// Download vCard
async function downloadVCard(profile: UserProfile) {
  const vcard = await generateVCard(profile);
  const blob = new Blob([vcard], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  const firstName = profile.firstName || 'Contact';
  const lastName = profile.lastName || '';
  const filename = `${firstName}${lastName ? '-' + lastName : ''}.vcf`;

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Get primary city for location display
function getPrimaryCity(profile: UserProfile): string | null {
  if (profile.addresses.length === 0) return null;
  const firstAddr = profile.addresses[0];
  return firstAddr.city || firstAddr.state || firstAddr.country || null;
}

// Format phone for display
function formatPhone(phone: ProfilePhone): string {
  return phone.phoneDisplay || phone.phone;
}

// Build WhatsApp link
function buildWhatsAppLink(whatsapp: string): string {
  const number = whatsapp.replace(/\D/g, '');
  return `https://wa.me/${number}`;
}

// Main Public Contact Card Component
export function PublicContactCard() {
  const { slug } = useParams<{ slug: string }>();
  const { data: profile, isLoading, error } = usePublicProfile(slug || null);
  const [showQR, setShowQR] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  // Generate QR code URL
  const pageUrl = typeof window !== 'undefined' ? window.location.href : '';
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(pageUrl)}`;

  const handleToggleQR = useCallback(() => {
    setShowQR((prev) => !prev);
  }, []);

  const handleDownloadVCard = useCallback(async () => {
    if (!profile) return;
    setIsDownloading(true);
    try {
      await downloadVCard(profile);
    } finally {
      setIsDownloading(false);
    }
  }, [profile]);

  if (isLoading) {
    return (
      <div className="public-card-page">
        <div className="public-card-loading">
          <div className="loading-spinner" />
          <p>Loading...</p>
        </div>
        <style>{publicCardStyles}</style>
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="public-card-page">
        <div className="public-card-error">
          <h1>Profile Not Found</h1>
          <p>This profile doesn't exist or is not public.</p>
        </div>
        <style>{publicCardStyles}</style>
      </div>
    );
  }

  const displayName = [profile.firstName, profile.lastName].filter(Boolean).join(' ') || 'Anonymous';
  const primaryCity = getPrimaryCity(profile);
  const primaryEmail = profile.emails[0]?.email;
  const primaryPhone = profile.phones[0];

  const hasSocialLinks = profile.website || profile.linkedin || profile.instagram || profile.whatsapp;

  return (
    <div className="public-card-page">
      <div className="public-card-wrapper">
        <div className="public-card">
          {/* Avatar with QR toggle */}
          <ProfileAvatar
            avatarUrl={profile.avatarUrl}
            name={displayName}
            showQR={showQR}
            qrCodeUrl={qrCodeUrl}
            onToggleQR={handleToggleQR}
          />

          {/* Name display */}
          <div className="profile-name">
            {profile.firstName && <span className="first-name">{profile.firstName}</span>}
            {profile.lastName && <span className="last-name">{profile.lastName}</span>}
          </div>

          {/* Tagline */}
          {profile.tagline && (
            <p className="profile-tagline">{profile.tagline}</p>
          )}

          {/* Location */}
          {primaryCity && (
            <p className="profile-location">{primaryCity}</p>
          )}

          {/* Contact Information */}
          <div className="contact-info">
            {primaryEmail && (
              <a href={`mailto:${primaryEmail}`} className="contact-item">
                <MailIcon />
                <span>{primaryEmail}</span>
              </a>
            )}
            {primaryPhone && (
              <a href={`tel:${primaryPhone.phone}`} className="contact-item">
                <PhoneIcon />
                <span>{formatPhone(primaryPhone)}</span>
              </a>
            )}
            {primaryCity && (
              <div className="contact-item location-item">
                <LocationIcon />
                <span>{primaryCity}</span>
              </div>
            )}
          </div>

          {/* Social Links */}
          {hasSocialLinks && (
            <div className="social-links">
              {profile.website && (
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link"
                  title="Website"
                >
                  <GlobeIcon />
                </a>
              )}
              {profile.whatsapp && (
                <a
                  href={buildWhatsAppLink(profile.whatsapp)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link whatsapp"
                  title="WhatsApp"
                >
                  <WhatsAppIcon />
                </a>
              )}
              {profile.linkedin && (
                <a
                  href={profile.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link linkedin"
                  title="LinkedIn"
                >
                  <LinkedInIcon />
                </a>
              )}
              {profile.instagram && (
                <a
                  href={`https://instagram.com/${profile.instagram}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="social-link instagram"
                  title="Instagram"
                >
                  <InstagramIcon />
                </a>
              )}
            </div>
          )}

          {/* Add to Contacts Button */}
          <button
            type="button"
            className="add-to-contacts-btn"
            onClick={handleDownloadVCard}
            disabled={isDownloading}
          >
            <DownloadIcon />
            <span>{isDownloading ? 'Downloading...' : 'Add to Contacts'}</span>
          </button>
        </div>
      </div>
      <style>{publicCardStyles}</style>
    </div>
  );
}

const publicCardStyles = `
  .public-card-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    padding: 24px;
    box-sizing: border-box;
  }

  .public-card-wrapper {
    width: 100%;
    max-width: 380px;
  }

  .public-card {
    background: #ffffff;
    border-radius: 24px;
    padding: 40px 32px;
    text-align: center;
    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
  }

  .public-card-loading,
  .public-card-error {
    background: #ffffff;
    border-radius: 24px;
    padding: 48px 32px;
    text-align: center;
    max-width: 380px;
    width: 100%;
  }

  .public-card-loading .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #e5e5e5;
    border-top-color: #667eea;
    border-radius: 50%;
    animation: spin 1s linear infinite;
    margin: 0 auto 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .public-card-loading p {
    color: #666;
    margin: 0;
  }

  .public-card-error h1 {
    font-size: 24px;
    color: #333;
    margin: 0 0 12px 0;
  }

  .public-card-error p {
    color: #666;
    margin: 0;
  }

  /* Avatar with QR toggle */
  .profile-avatar-container {
    position: relative;
    display: inline-block;
    margin-bottom: 20px;
  }

  .profile-avatar {
    width: 150px;
    height: 150px;
    border-radius: 50%;
    background-size: cover;
    background-position: center;
    background-repeat: no-repeat;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 48px;
    color: #ffffff;
    font-weight: 600;
    border: 4px solid #ffffff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.1);
  }

  .avatar-initials {
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.2);
  }

  .qr-toggle-btn {
    position: absolute;
    bottom: 4px;
    right: 4px;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    background: #ffffff;
    border: 2px solid #e5e5e5;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #667eea;
    transition: all 0.2s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .qr-toggle-btn:hover {
    background: #667eea;
    color: #ffffff;
    border-color: #667eea;
    transform: scale(1.05);
  }

  /* Name */
  .profile-name {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    margin-bottom: 8px;
  }

  .profile-name .first-name {
    font-size: 28px;
    font-weight: 700;
    color: #111;
    line-height: 1.2;
  }

  .profile-name .last-name {
    font-size: 28px;
    font-weight: 700;
    color: #111;
    line-height: 1.2;
  }

  /* Tagline */
  .profile-tagline {
    font-size: 16px;
    color: #667eea;
    font-style: italic;
    margin: 0 0 8px 0;
    font-weight: 500;
  }

  /* Location */
  .profile-location {
    font-size: 14px;
    color: #888;
    margin: 0 0 24px 0;
  }

  /* Contact info */
  .contact-info {
    display: flex;
    flex-direction: column;
    gap: 12px;
    margin-bottom: 24px;
  }

  .contact-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: #f8f9fa;
    border-radius: 12px;
    text-decoration: none;
    color: #333;
    font-size: 14px;
    transition: background 0.2s ease;
  }

  a.contact-item:hover {
    background: #f0f1f3;
  }

  .contact-item svg {
    flex-shrink: 0;
    color: #667eea;
  }

  .contact-item span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .contact-item.location-item {
    cursor: default;
  }

  /* Social links */
  .social-links {
    display: flex;
    justify-content: center;
    gap: 16px;
    margin-bottom: 28px;
  }

  .social-link {
    width: 48px;
    height: 48px;
    border-radius: 50%;
    background: #f0f1f3;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #555;
    transition: all 0.2s ease;
  }

  .social-link:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  }

  .social-link.whatsapp:hover {
    background: #25D366;
    color: #ffffff;
  }

  .social-link.linkedin:hover {
    background: #0A66C2;
    color: #ffffff;
  }

  .social-link.instagram:hover {
    background: linear-gradient(45deg, #f09433 0%, #e6683c 25%, #dc2743 50%, #cc2366 75%, #bc1888 100%);
    color: #ffffff;
  }

  .social-link svg {
    width: 22px;
    height: 22px;
  }

  /* Add to contacts button */
  .add-to-contacts-btn {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 16px 24px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: #ffffff;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 14px rgba(102, 126, 234, 0.4);
  }

  .add-to-contacts-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(102, 126, 234, 0.5);
  }

  .add-to-contacts-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .add-to-contacts-btn svg {
    flex-shrink: 0;
  }

  /* Responsive adjustments */
  @media (max-width: 440px) {
    .public-card-page {
      padding: 16px;
    }

    .public-card {
      padding: 32px 24px;
    }

    .profile-avatar {
      width: 120px;
      height: 120px;
      font-size: 40px;
    }

    .profile-name .first-name,
    .profile-name .last-name {
      font-size: 24px;
    }
  }
`;

export default PublicContactCard;
