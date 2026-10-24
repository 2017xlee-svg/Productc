import { Attachment, Product } from '../types';
import { saveMediaBlob } from '../lib/indexedDbMedia';
import { registerActiveObjectUrl } from './imageCompressor';
import { dataURLtoFile } from './upnoteParser';
import { getCleanProductDisplayName } from './productUtils';
import { isAppSchemeUrl, autoLinkUrls } from './formatHtml';

export interface ParsedHtmlReview {
  title: string;
  body: string;
  authorName?: string;
  rating?: number;
  matchedProductId?: string;
  matchedProductTitle?: string;
  pictures: Attachment[];
  tableCount: number;
  imageCount: number;
  paragraphCount: number;
  wordCount: number;
  rawTextPreview: string;
  fileName?: string;
}

/**
 * Extracts and cleans the document title from HTML or file name.
 */
export function extractTitleFromDoc(doc: Document, fallbackFileName?: string): string {
  // 1. Try document title
  const docTitle = doc.title?.trim();
  if (docTitle && !docTitle.toLowerCase().includes('untitled') && docTitle.length <= 160) {
    return docTitle;
  }

  // 2. Try OpenGraph / meta title
  const ogTitle = doc.querySelector('meta[property="og:title"]')?.getAttribute('content')?.trim();
  if (ogTitle && ogTitle.length <= 160) {
    return ogTitle;
  }

  // 3. Try first h1 or h2 in body
  const firstH1 = doc.querySelector('h1')?.textContent?.trim();
  if (firstH1 && firstH1.length <= 160) {
    return firstH1;
  }

  const firstH2 = doc.querySelector('h2')?.textContent?.trim();
  if (firstH2 && firstH2.length <= 160) {
    return firstH2;
  }

  // 4. Try fallback from file name
  if (fallbackFileName) {
    const cleanName = fallbackFileName
      .replace(/\.(html?|txt|md)$/i, '')
      .replace(/^[\._\s]+/, '') // strip leading dots, shadow prefixes like ._ and whitespace
      .replace(/[-_]+/g, ' ')
      .trim();
    if (cleanName) {
      return cleanName;
    }
  }

  return 'Imported Review';
}

/**
 * Attempts to match content or title to an existing product in the catalog.
 */
export function detectMatchingProduct(
  title: string,
  plainText: string,
  products: Product[]
): { id?: string; title?: string } {
  if (!Array.isArray(products) || products.length === 0) return {};

  const fullSearchText = `${title} ${plainText.slice(0, 800)}`.toLowerCase();

  // 1. Check exact brand + product name (longest matches first)
  const sortedByLength = [...products].sort((a, b) => (b.name.length + (b.brand?.length || 0)) - (a.name.length + (a.brand?.length || 0)));

  for (const prod of sortedByLength) {
    const fullName = `${prod.brand || ''} ${prod.name}`.trim().toLowerCase();
    const prodName = prod.name.trim().toLowerCase();

    if (fullName && fullSearchText.includes(fullName)) {
      return { id: prod.id, title: getCleanProductDisplayName(prod) };
    }

    if (prodName.length >= 3 && fullSearchText.includes(prodName)) {
      return { id: prod.id, title: getCleanProductDisplayName(prod) };
    }
  }

  // 2. Check tags or brand match
  for (const prod of products) {
    if (Array.isArray(prod.tags)) {
      for (const t of prod.tags) {
        if (t && t.length >= 4 && fullSearchText.includes(t.toLowerCase())) {
          return { id: prod.id, title: getCleanProductDisplayName(prod) };
        }
      }
    }
  }

  return {};
}

/**
 * Core HTML parser that parses rich HTML notes (UpNote, Apple Notes, Google Docs, Notion, Web)
 * into a structured review with extracted images, sanitized HTML, and product mapping.
 */
export async function parseHtmlContent(
  htmlString: string,
  fileName?: string,
  existingProducts: Product[] = []
): Promise<ParsedHtmlReview> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  // 1. Extract Title
  const title = extractTitleFromDoc(doc, fileName);

  // 2. Extract Author
  let authorName =
    doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
    doc.querySelector('.author, .byline, [rel="author"]')?.textContent?.trim() ||
    undefined;

  if (authorName && authorName.length > 50) {
    authorName = authorName.slice(0, 50).trim();
  }

  // 3. Remove script, style, meta, head, base, iframe, form elements
  const elementsToRemove = doc.querySelectorAll(
    'script, style, meta, link, head, base, iframe, object, embed, form, input, button, select, noscript'
  );
  elementsToRemove.forEach((el) => el.remove());

  // 4. Locate the main content container
  // UpNote, Evernote, Notion, or standard HTML often have specific containers or fall back to body
  const mainContent =
    doc.querySelector('article') ||
    doc.querySelector('main') ||
    doc.querySelector('.note-content') ||
    doc.querySelector('.page-content') ||
    doc.querySelector('.content') ||
    doc.body;

  // Remove first <h1> if it strictly duplicates the extracted title to avoid redundant headers
  const topH1 = mainContent.querySelector('h1');
  if (topH1 && topH1.textContent?.trim().toLowerCase() === title.toLowerCase()) {
    topH1.remove();
  }

  // 5. Clean attributes and inline event handlers
  const allElements = mainContent.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      const attrName = attr.name.toLowerCase();
      if (attrName.startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // 6. Process Tables: ensure responsive wrapper & sleek classes
  const tables = Array.from(mainContent.querySelectorAll('table'));
  tables.forEach((t) => {
    t.classList.add('w-full', 'min-w-[480px]', 'border-collapse', 'text-sm');
    t.querySelectorAll('th').forEach((th) => {
      th.classList.add(
        'border-b',
        'border-r',
        'last:border-r-0',
        'border-slate-200',
        'px-3',
        'py-2.5',
        'bg-slate-50',
        'font-bold',
        'text-slate-800',
        'text-left',
        'whitespace-nowrap'
      );
    });
    t.querySelectorAll('td').forEach((td) => {
      td.classList.add(
        'border-b',
        'border-r',
        'last:border-r-0',
        'border-slate-200',
        'px-3',
        'py-2',
        'text-slate-700',
        'align-top'
      );
    });

    if (!t.parentElement?.classList.contains('overflow-x-auto')) {
      const wrapper = doc.createElement('div');
      wrapper.className = 'w-full overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-2xs bg-white';
      t.parentNode?.insertBefore(wrapper, t);
      wrapper.appendChild(t);
    }
  });

  // 7. Process Images: extract base64 data URLs to IndexedDB and register active object URLs
  const pictures: Attachment[] = [];
  const imgElements = Array.from(mainContent.querySelectorAll('img'));

  for (let i = 0; i < imgElements.length; i++) {
    const img = imgElements[i];
    const src = img.getAttribute('src') || '';
    const alt = img.getAttribute('alt') || `Photo ${i + 1}`;
    const cleanAlt = alt.trim() || `Photo ${i + 1}`;

    if (!src) continue;

    if (src.startsWith('data:image/')) {
      // Base64 embedded photo: extract into IndexedDB Blob to keep database.json lightweight
      const attId = `att_import_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`;
      const fileNameSafe = `${cleanAlt.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

      try {
        const file = dataURLtoFile(src, fileNameSafe);
        await saveMediaBlob(attId, file, fileNameSafe, file.type);
        const objUrl = URL.createObjectURL(file);
        registerActiveObjectUrl(attId, objUrl);

        const newAtt: Attachment = {
          id: attId,
          name: cleanAlt,
          url: objUrl,
          mimetype: file.type,
          size: file.size,
        };
        pictures.push(newAtt);

        // Update image element
        img.src = objUrl;
        img.setAttribute('data-attachment-id', attId);
      } catch (err) {
        console.warn('Could not extract base64 image into IndexedDB:', err);
      }
    } else if (src.startsWith('http://') || src.startsWith('https://')) {
      // Remote web image
      const attId = `att_url_${Date.now()}_${i}`;
      const newAtt: Attachment = {
        id: attId,
        name: cleanAlt,
        url: src,
      };
      pictures.push(newAtt);
      img.setAttribute('data-attachment-id', attId);
    } else {
      // Relative path from an exported folder (e.g. "images/photo1.jpg" or "./p1.png")
      const attId = `att_rel_${Date.now()}_${i}`;
      const newAtt: Attachment = {
        id: attId,
        name: cleanAlt,
        url: src,
      };
      pictures.push(newAtt);
      img.setAttribute('data-attachment-id', attId);
    }

    // Add styling classes for nice responsive display
    img.classList.add('w-full', 'rounded-2xl', 'border', 'border-slate-200', 'shadow-2xs', 'object-cover', 'my-4', 'max-w-2xl');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('referrerpolicy', 'no-referrer');
  }

  // 8. Style Typography (headings, paragraphs, lists, quotes, code)
  mainContent.querySelectorAll('h1').forEach((h) => {
    h.className = 'text-2xl font-black text-slate-900 mt-6 mb-3 pb-2 border-b border-slate-200';
  });
  mainContent.querySelectorAll('h2').forEach((h) => {
    h.className = 'text-xl font-bold text-slate-900 mt-5 mb-2.5';
  });
  mainContent.querySelectorAll('h3').forEach((h) => {
    h.className = 'text-lg font-bold text-slate-900 mt-4 mb-2';
  });
  mainContent.querySelectorAll('p').forEach((p) => {
    p.className = 'mb-3 leading-relaxed text-slate-700 text-sm';
  });
  mainContent.querySelectorAll('ul').forEach((ul) => {
    ul.className = 'list-disc pl-5 my-3 space-y-1 text-slate-700';
  });
  mainContent.querySelectorAll('ol').forEach((ol) => {
    ol.className = 'list-decimal pl-5 my-3 space-y-1 text-slate-700';
  });
  mainContent.querySelectorAll('blockquote').forEach((b) => {
    b.className = 'border-l-4 border-indigo-500 pl-4 py-1.5 my-3 bg-indigo-50/50 rounded-r-lg text-slate-700 italic';
  });
  mainContent.querySelectorAll('pre').forEach((pre) => {
    pre.className = 'overflow-x-auto p-3 my-3 bg-slate-900 text-slate-100 rounded-xl text-xs font-mono';
  });

  // 9. Process Links: ensure target="_top" for app schemes, target="_blank" for web, and blue styling
  mainContent.querySelectorAll('a').forEach((a) => {
    const href = a.getAttribute('href') || '';
    const isApp = isAppSchemeUrl(href);
    if (isApp) {
      a.setAttribute('target', '_top');
      a.removeAttribute('rel');
      a.className =
        'inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline font-medium hover:underline transition-colors break-all cursor-pointer align-baseline';
    } else {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      const isYouTube = href.includes('youtube.com') || href.includes('youtu.be');
      if (isYouTube) {
        a.className =
          'inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-900 border border-rose-200/90 shadow-2xs font-mono break-all cursor-pointer align-baseline';
      } else {
        a.className =
          'inline-flex items-center gap-1 text-blue-600 hover:text-blue-800 underline font-medium hover:underline transition-colors break-all cursor-pointer align-baseline';
      }
    }
  });

  const rawBodyHtml = mainContent.innerHTML.trim();
  const finalBodyHtml = autoLinkUrls(rawBodyHtml);
  const plainText = mainContent.textContent || '';
  const words = plainText.trim().split(/\s+/).filter(Boolean);
  const paragraphs = Array.from(mainContent.querySelectorAll('p, div, h1, h2, h3, li')).filter(
    (el) => (el.textContent || '').trim().length > 0
  );

  // 10. Match with Product
  const matched = detectMatchingProduct(title, plainText, existingProducts);

  return {
    title,
    body: finalBodyHtml || '<p>No content in imported HTML note.</p>',
    authorName,
    rating: 5,
    matchedProductId: matched.id,
    matchedProductTitle: matched.title,
    pictures,
    tableCount: tables.length,
    imageCount: pictures.length,
    paragraphCount: paragraphs.length,
    wordCount: words.length,
    rawTextPreview: plainText.slice(0, 300).trim(),
    fileName,
  };
}

/**
 * Reads and parses an HTML File directly from an <input type="file"> event or drag & drop.
 */
export async function parseHtmlReviewFile(
  file: File,
  existingProducts: Product[] = []
): Promise<ParsedHtmlReview> {
  const content = await file.text();
  return parseHtmlContent(content, file.name, existingProducts);
}
