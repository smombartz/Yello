import type { ContactPhoto } from '../api/types';
import { useSetContactPhotoPrimary } from '../api/hooks';

interface ContactPhotoGalleryProps {
  contactId: number;
  photos: ContactPhoto[];
}

const SOURCE_LABELS: Record<string, string> = {
  vcard: 'vCard',
  google: 'Google',
  gravatar: 'Gravatar',
  linkedin: 'LinkedIn',
};

export function ContactPhotoGallery({ contactId, photos }: ContactPhotoGalleryProps) {
  const setPrimary = useSetContactPhotoPrimary();

  if (photos.length <= 1) return null;

  return (
    <div className="contact-photo-gallery">
      <span className="photo-gallery-label">Photos</span>
      <div className="photo-gallery-thumbnails">
        {photos.map((photo) => (
          <button
            key={photo.id}
            className={`photo-gallery-thumb${photo.isPrimary ? ' is-primary' : ''}`}
            onClick={() => {
              if (!photo.isPrimary) {
                setPrimary.mutate({ contactId, photoId: photo.id });
              }
            }}
            disabled={setPrimary.isPending}
            title={`${SOURCE_LABELS[photo.source] || photo.source}${photo.isPrimary ? ' (current)' : ' — click to use'}`}
          >
            {photo.url ? (
              <img src={photo.url} alt={SOURCE_LABELS[photo.source] || photo.source} />
            ) : (
              <span className="photo-gallery-placeholder">?</span>
            )}
            <span className="photo-gallery-source">{SOURCE_LABELS[photo.source] || photo.source}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
