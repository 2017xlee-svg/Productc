/**
 * Server-side media proxy and Teable presigned URL resolver.
 * 
 * Solves:
 * 1. Expired AWS S3 presigned URLs from Teable by dynamically scraping fresh presigned URLs
 *    from the public share page (https://app.teable.ai/s/IkafxjMCq).
 * 2. Browser CORS restrictions when fetching remote images during Cloud Storage migration.
 */

let cachedTeableUrls: Map<string, string> = new Map();
let lastTeableFetchTime = 0;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function getFreshTeableUrls(): Promise<Map<string, string>> {
  const now = Date.now();
  if (cachedTeableUrls.size > 0 && now - lastTeableFetchTime < CACHE_TTL_MS) {
    return cachedTeableUrls;
  }

  const freshMap = new Map<string, string>();
  const tableIds = ['tblrMrem3oieN0ZrBuC', 'tblGCLIQ94pWgpvkLpn', 'tblS3R4MFGxwk8p4Cxt'];

  for (const tid of tableIds) {
    try {
      const res = await fetch(`https://app.teable.ai/s/IkafxjMCq?tableId=${tid}`, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const match = html.match(/<script id=\"__NEXT_DATA__\"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) continue;

      const json = JSON.parse(match[1]);
      const records = json?.props?.pageProps?.recordsServerData?.records || [];

      for (const rec of records) {
        for (const val of Object.values(rec.fields || {})) {
          if (Array.isArray(val)) {
            for (const item of val) {
              if (item && typeof item === 'object' && item.presignedUrl) {
                const cleanUrl = String(item.presignedUrl)
                  .replace(/\\\\u0026/g, '&')
                  .replace(/\\u0026/g, '&');

                if (item.id) freshMap.set(item.id, cleanUrl);
                if (item.name) freshMap.set(item.name, cleanUrl);
                // Also index by S3 key path (e.g., /table/QYcqLd9XBDhc)
                const keyMatch = cleanUrl.match(/\/table\/[a-zA-Z0-9_-]+/);
                if (keyMatch) {
                  freshMap.set(keyMatch[0], cleanUrl);
                }
              }
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[TeableProxy] Error fetching table ${tid}:`, err);
    }
  }

  if (freshMap.size > 0) {
    cachedTeableUrls = freshMap;
    lastTeableFetchTime = now;
    console.log(`[TeableProxy] Successfully indexed ${freshMap.size} fresh attachment URLs from Teable`);
  }

  return freshMap;
}

export async function fetchRemoteImageBuffer(
  rawUrl?: string,
  attachmentId?: string,
  attachmentName?: string
): Promise<{ buffer: Buffer; contentType: string; fileName: string } | null> {
  const freshMap = await getFreshTeableUrls();

  let candidateUrl = rawUrl?.trim() || '';

  // 1. Check if we have a fresh presigned URL for this attachment ID or filename
  if (attachmentId && freshMap.has(attachmentId)) {
    candidateUrl = freshMap.get(attachmentId)!;
  } else if (attachmentName && freshMap.has(attachmentName)) {
    candidateUrl = freshMap.get(attachmentName)!;
  } else if (candidateUrl) {
    // Check if the URL has an S3 key path we have a fresh signature for
    const keyMatch = candidateUrl.match(/\/table\/[a-zA-Z0-9_-]+/);
    if (keyMatch && freshMap.has(keyMatch[0])) {
      candidateUrl = freshMap.get(keyMatch[0])!;
    }
  }

  if (!candidateUrl || !candidateUrl.startsWith('http')) {
    return null;
  }

  try {
    let res = await fetch(candidateUrl);

    if (!res.ok) {
      return null;
    }

    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const arrayBuffer = await res.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const fileName = attachmentName || 'image.jpg';

    return { buffer, contentType, fileName };
  } catch (err) {
    console.warn(`[TeableProxy] Exception fetching remote image:`, err);
    return null;
  }
}
