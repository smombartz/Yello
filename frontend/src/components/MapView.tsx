import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useOutletContext } from 'react-router-dom';
import L from 'leaflet';
import { Icon } from './Icon';
import 'leaflet/dist/leaflet.css';
import 'leaflet.markercluster/dist/MarkerCluster.css';
import 'leaflet.markercluster/dist/MarkerCluster.Default.css';
import 'leaflet.markercluster';
import { useMapMarkers, useMapStats, useGeocode } from '../api/mapHooks';
import type { MapMarker } from '../api/mapHooks';
import type { OutletContext } from './Layout';

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

// Imperative Leaflet map — creation and destruction live in the same useEffect,
// so React StrictMode's double-invoke (create → destroy → create) works correctly.
function LeafletMap({ markers }: { markers: MapMarker[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterRef = useRef<L.MarkerClusterGroup | null>(null);

  // Create and destroy the map instance
  useEffect(() => {
    if (!containerRef.current) return;

    const map = L.map(containerRef.current, {
      center: [39.8283, -98.5795],
      zoom: 4,
    });
    mapRef.current = map;

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(map);

    return () => {
      mapRef.current = null;
      clusterRef.current = null;
      map.remove();
    };
  }, []);

  // Manage marker cluster layer (separate so markers can update without recreating the map)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (clusterRef.current) {
      map.removeLayer(clusterRef.current);
    }

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
    clusterRef.current = clusterGroup;

    if (markers.length > 0) {
      const bounds = L.latLngBounds(markers.map(m => [m.latitude, m.longitude]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12 });
    }
  }, [markers]);

  return <div ref={containerRef} className="leaflet-map" />;
}

export function MapView() {
  const { setHeaderConfig } = useOutletContext<OutletContext>();
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
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

  const handleGeocode = useCallback(() => {
    geocodeMutation.mutate(25);
  }, [geocodeMutation.mutate]);

  // Configure page header
  useEffect(() => {
    setHeaderConfig({
      title: 'Map',
      search: searchQuery,
      onSearchChange: setSearchQuery,
      searchPlaceholder: 'Search contacts...',
      info: mapData ? (
        <span>{mapData.geocodedCount} of {mapData.totalContacts} on map</span>
      ) : undefined,
      actions: statsData && statsData.pendingAddresses > 0 ? (
        <button
          className="header-action-btn"
          onClick={handleGeocode}
          disabled={geocodeMutation.isPending}
        >
          <Icon name={geocodeMutation.isPending ? 'arrows-rotate' : 'location-crosshairs'} className={geocodeMutation.isPending ? 'spinning' : ''} />
          {geocodeMutation.isPending ? 'Geocoding...' : `Geocode ${statsData.pendingAddresses}`}
        </button>
      ) : undefined,
    });
  }, [setHeaderConfig, searchQuery, mapData, statsData, geocodeMutation.isPending, handleGeocode]);

  return (
    <div className="map-view">

      <div className="map-container">
        {isLoading ? (
          <div className="map-loading">
            <Icon name="arrows-rotate" className="spinning" />
            <p>Loading map data...</p>
          </div>
        ) : error ? (
          <div className="map-error">
            <Icon name="circle-exclamation" />
            <p>Error loading map: {error.message}</p>
          </div>
        ) : markers.length === 0 ? (
          <div className="map-empty">
            <Icon name="location-pin-slash" />
            <h3>No Locations Found</h3>
            <p>
              {debouncedSearch
                ? 'No contacts matching your search have geocoded addresses.'
                : 'No contacts have geocoded addresses yet.'}
            </p>
            {statsData && statsData.pendingAddresses > 0 && (
              <button className="geocode-button primary" onClick={handleGeocode}>
                <Icon name="location-crosshairs" />
                Geocode {statsData.pendingAddresses} addresses
              </button>
            )}
          </div>
        ) : (
          <LeafletMap markers={markers} />
        )}
      </div>

      {geocodeMutation.isSuccess && geocodeMutation.data && (
        <div className="geocode-result">
          <Icon name="circle-check" />
          Geocoded {geocodeMutation.data.successful} of {geocodeMutation.data.processed} addresses
          {geocodeMutation.data.remaining > 0 && ` (${geocodeMutation.data.remaining} remaining)`}
        </div>
      )}
    </div>
  );
}
