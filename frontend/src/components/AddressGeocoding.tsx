import { useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from './Icon';
import { Pagination } from './Pagination';
import {
  useGeocodingSummary,
  useGeocodingContacts,
  useRetryGeocoding,
  useBatchGeocode,
  useUpdateAndGeocode
} from '../api/addressCleanupHooks';
import type { GeocodingFilter, GeocodingContact, GeocodingAddress } from '../api/types';
import { formatAddress } from '../lib/addressUtils';

interface ToastState {
  message: string;
  timeout: ReturnType<typeof setTimeout>;
}

interface BulkProgress {
  processed: number;
  total: number;
  successful: number;
  failed: number;
}

const PAGE_SIZE = 20;
const BATCH_SIZE = 25;

function formatCoordinates(lat: number | null, lng: number | null): string {
  if (lat === null || lng === null) return '';
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
}

interface AddressEditFormProps {
  address: GeocodingAddress;
  onSave: (updates: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }) => void;
  onCancel: () => void;
  isSaving: boolean;
}

function AddressEditForm({ address, onSave, onCancel, isSaving }: AddressEditFormProps) {
  const [street, setStreet] = useState(address.street || '');
  const [city, setCity] = useState(address.city || '');
  const [state, setState] = useState(address.state || '');
  const [postalCode, setPostalCode] = useState(address.postalCode || '');
  const [country, setCountry] = useState(address.country || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      street: street || null,
      city: city || null,
      state: state || null,
      postalCode: postalCode || null,
      country: country || null
    });
  };

  return (
    <form className="geocoding-edit-form" onSubmit={handleSubmit}>
      <div className="geocoding-edit-fields">
        <input
          type="text"
          placeholder="Street"
          value={street}
          onChange={(e) => setStreet(e.target.value)}
          disabled={isSaving}
        />
        <div className="geocoding-edit-row">
          <input
            type="text"
            placeholder="City"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            disabled={isSaving}
          />
          <input
            type="text"
            placeholder="State"
            value={state}
            onChange={(e) => setState(e.target.value)}
            disabled={isSaving}
          />
        </div>
        <div className="geocoding-edit-row">
          <input
            type="text"
            placeholder="Postal Code"
            value={postalCode}
            onChange={(e) => setPostalCode(e.target.value)}
            disabled={isSaving}
          />
          <input
            type="text"
            placeholder="Country"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            disabled={isSaving}
          />
        </div>
      </div>
      <div className="geocoding-edit-actions">
        <button type="button" onClick={onCancel} disabled={isSaving}>
          Cancel
        </button>
        <button type="submit" className="primary" disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save & Retry'}
        </button>
      </div>
    </form>
  );
}

interface GeocodingAddressItemProps {
  address: GeocodingAddress;
  onRetry: (addressId: number) => void;
  onEdit: (addressId: number) => void;
  onViewMap: (lat: number, lng: number) => void;
  isEditing: boolean;
  onSaveEdit: (updates: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }) => void;
  onCancelEdit: () => void;
  isRetrying: boolean;
  isSavingEdit: boolean;
}

function GeocodingAddressItem({
  address,
  onRetry,
  onEdit,
  onViewMap,
  isEditing,
  onSaveEdit,
  onCancelEdit,
  isRetrying,
  isSavingEdit
}: GeocodingAddressItemProps) {
  if (isEditing) {
    return (
      <div className="geocoding-address-item editing">
        <AddressEditForm
          address={address}
          onSave={onSaveEdit}
          onCancel={onCancelEdit}
          isSaving={isSavingEdit}
        />
      </div>
    );
  }

  return (
    <div className={`geocoding-address-item status-${address.status}`}>
      <div className="geocoding-address-content">
        <div className="geocoding-address-text">{formatAddress(address)}</div>
        <div className="geocoding-address-meta">
          {address.type && <span className="geocoding-address-type">{address.type}</span>}
          <span className={`geocoding-status-badge ${address.status}`}>
            {address.status === 'pending' ? 'Pending' :
             address.status === 'failed' ? 'Failed' : 'Geocoded'}
          </span>
        </div>
        {address.status === 'geocoded' && address.latitude !== null && address.longitude !== null && (
          <div className="geocoding-coordinates">
            {formatCoordinates(address.latitude, address.longitude)}
          </div>
        )}
        {address.status === 'failed' && (
          <div className="geocoding-error">Could not find coordinates</div>
        )}
      </div>
      <div className="geocoding-address-actions">
        {address.status === 'pending' && (
          <button
            className="geocoding-action-btn"
            onClick={() => onRetry(address.id)}
            disabled={isRetrying}
            title="Geocode Now"
          >
            <Icon name="location-crosshairs" />
            <span className="btn-text">Geocode Now</span>
          </button>
        )}
        {address.status === 'failed' && (
          <button
            className="geocoding-action-btn"
            onClick={() => onEdit(address.id)}
            title="Edit"
          >
            <Icon name="pen-to-square" />
            <span className="btn-text">Edit</span>
          </button>
        )}
        {address.status === 'geocoded' && address.latitude !== null && address.longitude !== null && (
          <button
            className="geocoding-action-btn"
            onClick={() => onViewMap(address.latitude!, address.longitude!)}
            title="View Map"
          >
            <Icon name="map" />
            <span className="btn-text">View Map</span>
          </button>
        )}
      </div>
    </div>
  );
}

interface GeocodingCardProps {
  contact: GeocodingContact;
  onRetry: (addressId: number) => void;
  onEdit: (addressId: number) => void;
  onSaveEdit: (addressId: number, updates: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }) => void;
  onCancelEdit: () => void;
  onViewMap: (lat: number, lng: number) => void;
  editingAddressId: number | null;
  isRetrying: boolean;
  isSavingEdit: boolean;
}

function GeocodingCard({
  contact,
  onRetry,
  onEdit,
  onSaveEdit,
  onCancelEdit,
  onViewMap,
  editingAddressId,
  isRetrying,
  isSavingEdit
}: GeocodingCardProps) {
  const addressCount = contact.addresses.length;
  const addressText = addressCount === 1 ? '1 address' : `${addressCount} addresses`;

  return (
    <div className="geocoding-card">
      <div className="geocoding-card-header">
        <div className="geocoding-contact-info">
          {contact.photoUrl ? (
            <img
              src={contact.photoUrl}
              alt=""
              className="geocoding-avatar"
            />
          ) : (
            <div className="geocoding-avatar placeholder">
              <Icon name="user" />
            </div>
          )}
          <div className="geocoding-contact-details">
            <div className="geocoding-contact-name">{contact.displayName}</div>
            {contact.company && (
              <div className="geocoding-contact-company">{contact.company}</div>
            )}
          </div>
        </div>
        <span className="geocoding-badge">{addressText}</span>
      </div>

      <div className="geocoding-addresses">
        {contact.addresses.map((addr) => (
          <GeocodingAddressItem
            key={addr.id}
            address={addr}
            onRetry={onRetry}
            onEdit={onEdit}
            onViewMap={onViewMap}
            isEditing={editingAddressId === addr.id}
            onSaveEdit={(updates) => onSaveEdit(addr.id, updates)}
            onCancelEdit={onCancelEdit}
            isRetrying={isRetrying}
            isSavingEdit={isSavingEdit}
          />
        ))}
      </div>
    </div>
  );
}

interface BulkProgressModalProps {
  progress: BulkProgress;
  onCancel: () => void;
}

function BulkProgressModal({ progress, onCancel }: BulkProgressModalProps) {
  const percent = progress.total > 0 ? Math.round((progress.processed / progress.total) * 100) : 0;

  return (
    <div className="modal-overlay">
      <div className="modal-content geocoding-progress-modal">
        <h3>Geocoding Addresses...</h3>
        <div className="geocoding-progress-bar">
          <div className="geocoding-progress-fill" style={{ width: `${percent}%` }} />
        </div>
        <div className="geocoding-progress-count">
          {progress.processed} / {progress.total}
        </div>
        <div className="geocoding-progress-stats">
          <span className="geocoding-stat success">
            <Icon name="circle-check" />
            {progress.successful} successful
          </span>
          <span className="geocoding-stat error">
            <Icon name="circle-exclamation" />
            {progress.failed} failed
          </span>
        </div>
        <div className="geocoding-progress-actions">
          <button onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

export function AddressGeocoding() {
  const navigate = useNavigate();
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<GeocodingFilter>('all');
  const [toast, setToast] = useState<ToastState | null>(null);
  const [editingAddressId, setEditingAddressId] = useState<number | null>(null);
  const [bulkProgress, setBulkProgress] = useState<BulkProgress | null>(null);
  const [isBulkCancelled, setIsBulkCancelled] = useState(false);

  const { data: summary, refetch: refetchSummary } = useGeocodingSummary();
  const { data, isLoading, isFetching, refetch: refetchContacts } = useGeocodingContacts(filter, currentPage, PAGE_SIZE);

  const retryMutation = useRetryGeocoding();
  const batchMutation = useBatchGeocode();
  const updateMutation = useUpdateAndGeocode();

  // Cleanup toast timeout on unmount
  useEffect(() => {
    return () => {
      if (toast?.timeout) {
        clearTimeout(toast.timeout);
      }
    };
  }, [toast]);

  const showToast = useCallback((message: string) => {
    if (toast?.timeout) {
      clearTimeout(toast.timeout);
    }
    const timeout = setTimeout(() => setToast(null), 5000);
    setToast({ message, timeout });
  }, [toast]);

  const handleRetry = useCallback((addressId: number) => {
    retryMutation.mutate([addressId], {
      onSuccess: (result) => {
        if (result.successful > 0) {
          showToast('Address geocoded successfully');
        } else {
          showToast('Could not geocode address');
        }
      },
    });
  }, [retryMutation, showToast]);

  const handleEdit = useCallback((addressId: number) => {
    setEditingAddressId(addressId);
  }, []);

  const handleCancelEdit = useCallback(() => {
    setEditingAddressId(null);
  }, []);

  const handleSaveEdit = useCallback((addressId: number, updates: {
    street?: string | null;
    city?: string | null;
    state?: string | null;
    postalCode?: string | null;
    country?: string | null;
  }) => {
    updateMutation.mutate({ addressId, ...updates }, {
      onSuccess: (result) => {
        setEditingAddressId(null);
        if (result.address.status === 'geocoded') {
          showToast('Address updated and geocoded successfully');
        } else {
          showToast('Address updated but geocoding failed');
        }
      },
      onError: () => {
        showToast('Failed to update address');
      }
    });
  }, [updateMutation, showToast]);

  const handleViewMap = useCallback((lat: number, lng: number) => {
    navigate(`/map?lat=${lat}&lng=${lng}&zoom=15`);
  }, [navigate]);

  const handleBulkGeocode = useCallback(async () => {
    if (!summary || summary.pending === 0) return;

    setIsBulkCancelled(false);
    setBulkProgress({
      processed: 0,
      total: summary.pending,
      successful: 0,
      failed: 0
    });

    let totalSuccessful = 0;
    let totalFailed = 0;
    let totalProcessed = 0;

    // Process in batches
    while (totalProcessed < summary.pending && !isBulkCancelled) {
      try {
        const result = await batchMutation.mutateAsync(BATCH_SIZE);

        totalProcessed += result.processed;
        totalSuccessful += result.successful;
        totalFailed += result.failed;

        setBulkProgress({
          processed: totalProcessed,
          total: summary.pending,
          successful: totalSuccessful,
          failed: totalFailed
        });

        // If we processed less than the batch size, we're done
        if (result.processed < BATCH_SIZE) {
          break;
        }
      } catch {
        break;
      }
    }

    // Close modal and show toast
    setBulkProgress(null);
    showToast(`Geocoded ${totalSuccessful} address${totalSuccessful !== 1 ? 'es' : ''}, ${totalFailed} failed`);

    // Refresh data
    refetchSummary();
    refetchContacts();
  }, [summary, batchMutation, isBulkCancelled, showToast, refetchSummary, refetchContacts]);

  const handleCancelBulk = useCallback(() => {
    setIsBulkCancelled(true);
    setBulkProgress(null);
  }, []);

  const handleFilterChange = useCallback((newFilter: GeocodingFilter) => {
    setFilter(newFilter);
    setCurrentPage(1);
  }, []);

  const contacts = data?.contacts ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const pendingCount = summary?.pending ?? 0;
  const failedCount = summary?.failed ?? 0;
  const geocodedCount = summary?.geocoded ?? 0;

  if (isLoading) {
    return (
      <div className="geocoding-loading">
        <Icon name="arrows-rotate" className="spinning" />
        <p>Loading addresses...</p>
      </div>
    );
  }

  return (
    <div className="geocoding-view">
      <div className="geocoding-description">
        <p>
          View and manage geocoding status for all addresses. Geocoding converts addresses to coordinates for map display.
        </p>
      </div>

      <div className="geocoding-summary">
        <span className="geocoding-summary-item pending">
          {pendingCount} pending
        </span>
        <span className="geocoding-summary-separator">·</span>
        <span className="geocoding-summary-item failed">
          {failedCount} failed
        </span>
        <span className="geocoding-summary-separator">·</span>
        <span className="geocoding-summary-item geocoded">
          {geocodedCount} geocoded
        </span>
      </div>

      <div className="geocoding-header">
        <div className="geocoding-filters">
          <button
            className={`geocoding-filter-btn ${filter === 'all' ? 'active' : ''}`}
            onClick={() => handleFilterChange('all')}
          >
            All
          </button>
          <button
            className={`geocoding-filter-btn ${filter === 'pending' ? 'active' : ''}`}
            onClick={() => handleFilterChange('pending')}
          >
            Pending
            {pendingCount > 0 && <span className="filter-count">{pendingCount}</span>}
          </button>
          <button
            className={`geocoding-filter-btn ${filter === 'failed' ? 'active' : ''}`}
            onClick={() => handleFilterChange('failed')}
          >
            Failed
            {failedCount > 0 && <span className="filter-count">{failedCount}</span>}
          </button>
          <button
            className={`geocoding-filter-btn ${filter === 'geocoded' ? 'active' : ''}`}
            onClick={() => handleFilterChange('geocoded')}
          >
            Geocoded
          </button>
        </div>
        {pendingCount > 0 && (
          <button
            className="geocoding-bulk-btn"
            onClick={handleBulkGeocode}
            disabled={batchMutation.isPending}
          >
            <Icon name="location-crosshairs" />
            Geocode All Pending ({pendingCount})
          </button>
        )}
      </div>

      {total === 0 && !isFetching ? (
        <div className="geocoding-empty">
          <Icon name="location-pin-slash" />
          <p>
            {filter === 'all' ? 'No addresses found' :
             filter === 'pending' ? 'No pending addresses' :
             filter === 'failed' ? 'No failed addresses' :
             'No geocoded addresses'}
          </p>
        </div>
      ) : (
        <>
          <div className="geocoding-list">
            {contacts.map((contact) => (
              <GeocodingCard
                key={contact.id}
                contact={contact}
                onRetry={handleRetry}
                onEdit={handleEdit}
                onSaveEdit={handleSaveEdit}
                onCancelEdit={handleCancelEdit}
                onViewMap={handleViewMap}
                editingAddressId={editingAddressId}
                isRetrying={retryMutation.isPending}
                isSavingEdit={updateMutation.isPending}
              />
            ))}
          </div>

          {totalPages > 1 && (
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              isLoading={isFetching}
            />
          )}
        </>
      )}

      {toast && (
        <div className="undo-toast">
          <Icon name="circle-check" />
          <span className="message">{toast.message}</span>
          <button
            className="dismiss"
            onClick={() => {
              if (toast.timeout) clearTimeout(toast.timeout);
              setToast(null);
            }}
          >
            <Icon name="xmark" />
          </button>
        </div>
      )}

      {bulkProgress && (
        <BulkProgressModal
          progress={bulkProgress}
          onCancel={handleCancelBulk}
        />
      )}
    </div>
  );
}
