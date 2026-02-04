import { useState, useEffect, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { useOutletContext } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { useMapMarkers, useMapStats, useGeocode } from '../api/mapHooks';
import type { MapMarker } from '../api/mapHooks';
import { MobileHeader } from './MobileHeader';

interface OutletContext {
  setModalOpen: (open: boolean) => void;
  isMobile: boolean;
}

// Fix for default marker icons in Leaflet with Vite
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';

// @ts-expect-error - Leaflet default icon fix
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

interface MapViewProps {
  onBack?: () => void;
}

// Create a custom avatar marker icon
function createAvatarIcon(photoUrl: string | null, displayName: string): L.DivIcon {
  const initials = displayName
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) || '?';

  const html = photoUrl
    ? `<div class="map-avatar-marker">
        <img src="${photoUrl}" alt="${displayName}" />
      </div>`
    : `<div class="map-avatar-marker map-avatar-initials">
        ${initials}
      </div>`;

  return L.divIcon({
    html,
    className: 'map-avatar-icon',
    iconSize: [40, 40],
    iconAnchor: [20, 40],
    popupAnchor: [0, -40],
  });
}

// Component to handle marker clustering
function MarkerClusterGroup({ markers }: { markers: MapMarker[] }) {
  const map = useMap();

  useEffect(() => {
    const clusterGroup = L.markerClusterGroup({
      showCoverageOnHover: false,
      maxClusterRadius: 50,
      spiderfyOnMaxZoom: true,
      iconCreateFunction: (cluster) => {
        const count = cluster.getChildCount();
        return L.divIcon({
          html: `<div class="map-cluster-marker">${count}</div>`,
          className: 'map-cluster-icon',
          iconSize: [44, 44],
        });
      },
    });

    markers.forEach((marker) => {
      const icon = createAvatarIcon(marker.photoUrl, marker.displayName);
      const leafletMarker = L.marker([marker.latitude, marker.longitude], { icon });

      const locationParts = [marker.city, marker.country].filter(Boolean).join(', ');
      const typeLabel = marker.type ? ` (${marker.type})` : '';

      leafletMarker.bindPopup(`
        <div class="map-popup">
          <div class="map-popup-avatar">
            ${marker.photoUrl
              ? `<img src="${marker.photoUrl}" alt="${marker.displayName}" />`
              : `<div class="map-popup-initials">${marker.displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}</div>`
            }
          </div>
          <div class="map-popup-info">
            <div class="map-popup-name">${marker.displayName}</div>
            ${locationParts ? `<div class="map-popup-location">${locationParts}${typeLabel}</div>` : ''}
          </div>
        </div>
      `);

      clusterGroup.addLayer(leafletMarker);
    });

    map.addLayer(clusterGroup);

    // Fit bounds if there are markers
    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.latitude, m.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }

    return () => {
      map.removeLayer(clusterGroup);
    };
  }, [map, markers]);

  return null;
}

export function MapView({ onBack: _onBack }: MapViewProps) {
  const { isMobile } = useOutletContext<OutletContext>();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const mapRef = useRef<L.Map | null>(null);

  const { data: mapData, isLoading, error } = useMapMarkers(debouncedSearch || undefined);
  const { data: statsData } = useMapStats();
  const geocodeMutation = useGeocode();

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const markers = useMemo(() => mapData?.markers || [], [mapData]);

  const handleGeocode = () => {
    geocodeMutation.mutate(25); // Smaller batches to avoid Nominatim rate limits
  };

  const handleRecenter = () => {
    if (mapRef.current && markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.latitude, m.longitude]));
      mapRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    } else if (mapRef.current) {
      mapRef.current.setView(defaultCenter, defaultZoom);
    }
  };

  // Default center (US)
  const defaultCenter: [number, number] = [39.8283, -98.5795];
  const defaultZoom = 4;

  return (
    <div className="map-view">
      {isMobile && (
        <MobileHeader
          title="Map"
          onRecenter={handleRecenter}
        />
      )}
      {!isMobile && (
        <div className="map-header">
          <h1>
            <span className="material-symbols-outlined">map</span>
            Contacts Map
          </h1>
          <div className="map-header-stats">
          {mapData && (
            <span className="map-stat">
              {mapData.geocodedCount} of {mapData.totalContacts} contacts on map
            </span>
          )}
          {statsData && statsData.pendingAddresses > 0 && (
            <button
              className="geocode-button"
              onClick={handleGeocode}
              disabled={geocodeMutation.isPending}
            >
              <span className="material-symbols-outlined">
                {geocodeMutation.isPending ? 'sync' : 'location_searching'}
              </span>
              {geocodeMutation.isPending
                ? 'Geocoding...'
                : `Geocode ${statsData.pendingAddresses} addresses`}
            </button>
          )}
        </div>
      </div>
      )}

      <div className="map-search-bar">
        <span className="material-symbols-outlined search-icon">search</span>
        <input
          type="text"
          placeholder="Search contacts..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="map-search-input"
        />
        {searchQuery && (
          <button
            className="clear-search"
            onClick={() => setSearchQuery('')}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        )}
      </div>

      <div className="map-container">
        {isLoading ? (
          <div className="map-loading">
            <span className="material-symbols-outlined spinning">sync</span>
            <p>Loading map data...</p>
          </div>
        ) : error ? (
          <div className="map-error">
            <span className="material-symbols-outlined">error</span>
            <p>Error loading map: {error.message}</p>
          </div>
        ) : markers.length === 0 ? (
          <div className="map-empty">
            <span className="material-symbols-outlined">location_off</span>
            <h3>No Locations Found</h3>
            <p>
              {debouncedSearch
                ? 'No contacts matching your search have geocoded addresses.'
                : 'No contacts have geocoded addresses yet.'}
            </p>
            {statsData && statsData.pendingAddresses > 0 && (
              <button className="geocode-button primary" onClick={handleGeocode}>
                <span className="material-symbols-outlined">location_searching</span>
                Geocode {statsData.pendingAddresses} addresses
              </button>
            )}
          </div>
        ) : (
          <MapContainer
            center={defaultCenter}
            zoom={defaultZoom}
            className="leaflet-map"
            ref={mapRef}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            <MarkerClusterGroup markers={markers} />
          </MapContainer>
        )}
      </div>

      {geocodeMutation.isSuccess && geocodeMutation.data && (
        <div className="geocode-result">
          <span className="material-symbols-outlined">check_circle</span>
          Geocoded {geocodeMutation.data.successful} of {geocodeMutation.data.processed} addresses
          {geocodeMutation.data.remaining > 0 && ` (${geocodeMutation.data.remaining} remaining)`}
        </div>
      )}
    </div>
  );
}
