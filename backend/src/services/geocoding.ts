/**
 * Geocoding service using HERE.com Geocoding API
 * 250,000 free requests/month, no rate limiting needed
 */

interface GeocodingResult {
  latitude: number;
  longitude: number;
}

interface HereGeocodingResponse {
  items: Array<{
    position: {
      lat: number;
      lng: number;
    };
  }>;
}

const HERE_API_KEY = process.env.HERE_API_KEY || '';

/**
 * Check if HERE API is configured
 */
export function isGeocodingConfigured(): boolean {
  return HERE_API_KEY.length > 0;
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
 * Geocode an address using HERE.com API
 * Returns latitude/longitude or null if geocoding fails
 */
export async function geocodeAddress(address: {
  street?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
}): Promise<GeocodingResult | null> {
  if (!isGeocodingConfigured()) {
    console.error('HERE API key not configured. Set HERE_API_KEY environment variable.');
    return null;
  }

  const query = buildAddressQuery(address);

  if (!query.trim()) {
    return null;
  }

  try {
    const params = new URLSearchParams({
      q: query,
      apiKey: HERE_API_KEY
    });

    const response = await fetch(
      `https://geocode.search.hereapi.com/v1/geocode?${params.toString()}`,
      {
        headers: {
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      console.error(`HERE API error: ${response.status} ${response.statusText}`);
      return null;
    }

    const results = await response.json() as HereGeocodingResponse;

    if (!results.items || results.items.length === 0) {
      // Try a less specific search (just city + country)
      if (address.city || address.country) {
        const fallbackQuery = [address.city, address.state, address.country]
          .filter(Boolean)
          .join(', ');

        if (fallbackQuery !== query) {
          const fallbackParams = new URLSearchParams({
            q: fallbackQuery,
            apiKey: HERE_API_KEY
          });

          const fallbackResponse = await fetch(
            `https://geocode.search.hereapi.com/v1/geocode?${fallbackParams.toString()}`,
            {
              headers: {
                'Accept': 'application/json'
              }
            }
          );

          if (fallbackResponse.ok) {
            const fallbackResults = await fallbackResponse.json() as HereGeocodingResponse;
            if (fallbackResults.items && fallbackResults.items.length > 0) {
              return {
                latitude: fallbackResults.items[0].position.lat,
                longitude: fallbackResults.items[0].position.lng
              };
            }
          }
        }
      }

      return null;
    }

    return {
      latitude: results.items[0].position.lat,
      longitude: results.items[0].position.lng
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
