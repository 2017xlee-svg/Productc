/**
 * Server-side media proxy and image fetcher.
 * Directly fetches images bypassing browser CORS for Cloud Storage migration.
 * (Teable integration is no longer used).
 */

export async function getFreshTeableUrls(): Promise<Map<string, string>> {
  return new Map<string, string>();
}

export async function fetchRemoteImageBuffer(
  rawUrl?: string,
  _attachmentId?: string,
  attachmentName?: string
): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  const candidateUrl = rawUrl?.trim() || '';

  if (!candidateUrl || !candidateUrl.startsWith('http')) {
    return null;
  }

  try {
    const res = await fetch(candidateUrl);
    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = attachmentName || 'image.jpg';

    return { buffer, contentType, fileName };
  } catch (err) {
    console.warn(`[MediaProxy] Exception fetching remote image:`, err);
    return null;
  }
}
