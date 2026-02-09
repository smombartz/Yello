import { useState } from 'react';
import { Icon } from './Icon';
import { AddressNormalize } from './AddressNormalize';
import { AddressDuplicates } from './AddressDuplicates';
import { AddressGeocoding } from './AddressGeocoding';
import { useNormalizeSummary, useDuplicatesSummary, useGeocodingSummary } from '../api/addressCleanupHooks';

type AddressSubTab = 'normalize' | 'duplicates' | 'geocoding';

export function AddressCleanup() {
  const [activeTab, setActiveTab] = useState<AddressSubTab>('normalize');

  const { data: normalizeSummary } = useNormalizeSummary();
  const { data: duplicatesSummary } = useDuplicatesSummary();
  const { data: geocodingSummary } = useGeocodingSummary();

  const normalizeCount = normalizeSummary?.junkCount ?? 0;
  const duplicatesCount = duplicatesSummary?.totalContacts ?? 0;
  const pendingGeocodingCount = geocodingSummary?.pending ?? 0;

  return (
    <div className="address-cleanup">
      <div className="address-subtabs">
        <button
          className={`address-subtab ${activeTab === 'normalize' ? 'active' : ''}`}
          onClick={() => setActiveTab('normalize')}
        >
          <Icon name="broom" />
          Normalize
          {normalizeCount > 0 && (
            <span className="subtab-badge">{normalizeCount}</span>
          )}
        </button>
        <button
          className={`address-subtab ${activeTab === 'duplicates' ? 'active' : ''}`}
          onClick={() => setActiveTab('duplicates')}
        >
          <Icon name="copy" />
          Duplicates
          {duplicatesCount > 0 && (
            <span className="subtab-badge">{duplicatesCount}</span>
          )}
        </button>
        <button
          className={`address-subtab ${activeTab === 'geocoding' ? 'active' : ''}`}
          onClick={() => setActiveTab('geocoding')}
        >
          <Icon name="location-dot" />
          Geocoding
          {pendingGeocodingCount > 0 && (
            <span className="subtab-badge">{pendingGeocodingCount}</span>
          )}
        </button>
      </div>

      <div className="address-subtab-content">
        {activeTab === 'normalize' ? (
          <AddressNormalize />
        ) : activeTab === 'duplicates' ? (
          <AddressDuplicates />
        ) : (
          <AddressGeocoding />
        )}
      </div>
    </div>
  );
}
