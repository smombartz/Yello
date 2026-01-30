interface GoogleContact {
  email: string;
  photoUrl: string | null;
}

interface OtherContactsResponse {
  otherContacts?: Array<{
    resourceName: string;
    emailAddresses?: Array<{ value: string }>;
    photos?: Array<{ url: string; metadata?: { primary?: boolean } }>;
  }>;
  nextPageToken?: string;
}

export async function fetchGoogleContactsPhotos(accessToken: string): Promise<GoogleContact[]> {
  const contacts: GoogleContact[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL('https://people.googleapis.com/v1/otherContacts');
      url.searchParams.set('readMask', 'emailAddresses,photos');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 403) {
          console.log('User has not granted contacts permission');
          return [];
        }
        throw new Error(`Google People API error: ${response.status}`);
      }

      const data = (await response.json()) as OtherContactsResponse;

      if (data.otherContacts) {
        for (const contact of data.otherContacts) {
          const email = contact.emailAddresses?.[0]?.value;
          const photo = contact.photos?.find(p => p.metadata?.primary)?.url || contact.photos?.[0]?.url;

          if (email && photo) {
            contacts.push({ email: email.toLowerCase(), photoUrl: photo });
          }
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    return contacts;
  } catch (error) {
    console.error('Error fetching Google contacts:', error);
    return [];
  }
}
