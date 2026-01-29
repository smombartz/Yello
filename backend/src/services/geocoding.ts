/**
 * Geocoding service using OpenStreetMap Nominatim API
 * Rate limited to 1 request per second per Nominatim usage policy
 */

interface GeocodingResult {
  latitude: number;
  longitude: number;
}

interface NominatimResponse {
  lat: string;
  lon: string;
  display_name: string;
}

// Queue for rate limiting - Nominatim requires max 1 req/sec
// Using 2 seconds to be safe and avoid 503 errors
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds to avoid 503 errors
const MAX_RETRIES = 2;
const RETRY_DELAY = 5000; // 5 seconds before retry on 503

/**
 * Wait for rate limit
 */
async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const waitTime = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

/**
 * Fetch with retry on 503
 */
async function fetchWithRetry(url: string, options: RequestInit, retries = MAX_RETRIES): Promise<Response> {
  const response = await fetch(url, options);

  if (response.status === 503 && retries > 0) {
    console.log(`Nominatim 503 - waiting ${RETRY_DELAY/1000}s before retry (${retries} retries left)`);
    await new Promise(resolve => setTimeout(resolve, RETRY_DELAY));
    lastRequestTime = Date.now(); // Reset rate limit timer
    return fetchWithRetry(url, options, retries - 1);
  }

  return response;
}

/**
 * Build a search query from address components
 */
function buildAddressQuery(address: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): string {
  const parts: string[] = [];

  if (address.street) parts.push(address.street);
  if (address.city) parts.push(address.city);
  if (address.state) parts.push(address.state);
  if (address.postalCode) parts.push(address.postalCode);
  if (address.country) parts.push(address.country);

  return parts.join(', ');
}

/**
 * Geocode an address using Nominatim
 * Returns latitude/longitude or null if geocoding fails
 */
export async function geocodeAddress(address: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): Promise<GeocodingResult | null> {
  const query = buildAddressQuery(address);

  if (!query.trim()) {
    return null;
  }

  try {
    await waitForRateLimit();

    const params = new URLSearchParams({
      q: query,
      format: 'json',
      limit: '1',
      addressdetails: '0'
    });

    const response = await fetchWithRetry(
      `https://nominatim.openstreetmap.org/search?${params.toString()}`,
      {
        headers: {
          'User-Agent': 'ElloCRM/1.0 (contact management app)',
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error(`Nominatim API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const results = await response.json() as NominatimResponse[];

    if (results.length === 0) {
      // Try a less specific search (just city + country)
      if (address.city || address.country) {
        const fallbackQuery = [address.city, address.state, address.country]
          .filter(Boolean)
          .join(', ');

        if (fallbackQuery !== query) {
          await waitForRateLimit();

          const fallbackParams = new URLSearchParams({
            q: fallbackQuery,
            format: 'json',
            limit: '1',
            addressdetails: '0'
          });

          const fallbackResponse = await fetchWithRetry(
            `https://nominatim.openstreetmap.org/search?${fallbackParams.toString()}`,
            {
              headers: {
                'User-Agent': 'ElloCRM/1.0 (contact management app)',
                'Accept': 'application/json'
              }
            }
          );

          if (fallbackResponse.ok) {
            const fallbackResults = await fallbackResponse.json() as NominatimResponse[];
            if (fallbackResults.length > 0) {
              return {
                latitude: parseFloat(fallbackResults[0].lat),
                longitude: parseFloat(fallbackResults[0].lon)
              };
            }
          }
        }
      }

      return null;
    }

    return {
      latitude: parseFloat(results[0].lat),
      longitude: parseFloat(results[0].lon)
    };
  } catch (error) {
    console.error('Geocoding error:', error);
    return null;
  }
}

/**
 * Validate latitude/longitude values
 */
export function isValidCoordinate(lat: number | null, lng: number | null): boolean {
  if (lat === null || lng === null) return false;
  if (isNaN(lat) || isNaN(lng)) return false;
  if (lat < -90 || lat > 90) return false;
  if (lng < -180 || lng > 180) return false;
  return true;
}
