import JSZip from 'jszip';
import { Attachment, Product } from '../types';
import { saveMediaBlob } from '../lib/indexedDbMedia';
import { registerActiveObjectUrl } from './imageCompressor';
import { dataURLtoFile } from './upnoteParser';
import { extractTitleFromDoc, detectMatchingProduct } from './htmlReviewParser';
import { getCleanProductDisplayName } from './productUtils';

export interface ParsedBatchReview {
  id: string;
  folderName: string;
  title: string;
  body: string;
  authorName?: string;
  rating: number;
  matchedProductId?: string;
  matchedProductTitle?: string;
  pictures: Attachment[];
  tableCount: number;
  imageCount: number;
  wordCount: number;
  fileName: string;
  relativePath: string;
}

interface BatchFileItem {
  relativePath: string;
  fileName: string;
  getBlob: () => Promise<Blob>;
  getText: () => Promise<string>;
}

/**
 * Normalizes file path to forward slashes without leading slashes.
 */
function normalizePath(p: string): string {
  return p.replace(/\\/g, '/').replace(/^\/+/, '');
}

/**
 * Checks if a file path is a system junk file, shadow file (e.g. ._*.html), or stylesheet.
 */
function isIgnoredFile(p: string): boolean {
  const normalized = normalizePath(p);
  const segments = normalized.split('/');
  for (const seg of segments) {
    const trimmed = seg.trim();
    // Exclude hidden folders, hidden files, and AppleDouble shadow files (e.g. "._wacom.html", ".DS_Store", ".git")
    if (trimmed.startsWith('.') || trimmed.startsWith('._') || trimmed.startsWith('~$')) {
      return true;
    }
  }
  const fileName = segments[segments.length - 1] || '';
  if (fileName.startsWith('.') || fileName.startsWith('._')) {
    return true;
  }
  const lower = normalized.toLowerCase();
  return (
    lower.includes('__macosx') ||
    lower.includes('.ds_store') ||
    lower.includes('thumbs.db') ||
    lower.includes('desktop.ini') ||
    lower.endsWith('.css') ||
    lower.endsWith('.ttf') ||
    lower.endsWith('.woff') ||
    lower.endsWith('.woff2') ||
    lower.endsWith('.map') ||
    lower.endsWith('.json') ||
    lower.endsWith('.xml') ||
    lower.endsWith('.plist')
  );
}

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg', '.avif', '.bmp'];

function isImageFile(p: string): boolean {
  if (isIgnoredFile(p)) return false;
  const lower = p.toLowerCase();
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

function isHtmlFile(p: string): boolean {
  if (isIgnoredFile(p)) return false;
  const lower = p.toLowerCase();
  return lower.endsWith('.html') || lower.endsWith('.htm');
}

/**
 * Core processor for a list of batch file items.
 *
 * Folder Hierarchy Rule:
 * Inside the root directory, each review folder (e.g. "Review 1", "Review 2", "Review 3")
 * represents 1 review. Any subfolder inside that review folder (e.g. "images/", "attachments/")
 * is treated as that review's content assets, NEVER a separate review.
 */
export async function processBatchFileItems(
  items: BatchFileItem[],
  products: Product[] = []
): Promise<ParsedBatchReview[]> {
  // 1. Separate HTML review files and asset images
  const validItems = items.filter((it) => !isIgnoredFile(it.relativePath));
  const htmlItems = validItems.filter((it) => isHtmlFile(it.relativePath));
  const imageItems = validItems.filter((it) => isImageFile(it.relativePath));

  if (htmlItems.length === 0) {
    return [];
  }

  const results: ParsedBatchReview[] = [];

  for (let reviewIndex = 0; reviewIndex < htmlItems.length; reviewIndex++) {
    const htmlItem = htmlItems[reviewIndex];
    const pathParts = htmlItem.relativePath.split('/');
    // Review directory is the directory containing this HTML file
    const reviewDir = pathParts.length > 1 ? pathParts.slice(0, -1).join('/') + '/' : '';
    const folderName = pathParts.length > 1 ? pathParts[pathParts.length - 2] : 'Root';

    // Find all images that belong to this review:
    // Assets that reside inside the review directory or subdirectories (e.g. "images/")
    const reviewAssets = imageItems.filter((img) => {
      if (reviewDir && img.relativePath.startsWith(reviewDir)) {
        return true;
      }
      // If root level, match sibling images
      if (!reviewDir && !img.relativePath.includes('/')) {
        return true;
      }
      return false;
    });

    // Also collect all remaining image items as fallback candidates
    const allFallbackAssets = imageItems;

    // Read and parse HTML content
    const htmlContent = await htmlItem.getText();
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, 'text/html');

    // Extract Title
    const title = extractTitleFromDoc(doc, htmlItem.fileName || folderName);

    // Extract Author
    let authorName =
      doc.querySelector('meta[name="author"]')?.getAttribute('content')?.trim() ||
      doc.querySelector('.author, .byline, [rel="author"]')?.textContent?.trim() ||
      undefined;

    if (authorName && authorName.length > 50) {
      authorName = authorName.slice(0, 50).trim();
    }

    // Remove script, style, meta, head, base, iframe, form elements
    const elementsToRemove = doc.querySelectorAll(
      'script, style, meta, link, head, base, iframe, object, embed, form, input, button, select, noscript'
    );
    elementsToRemove.forEach((el) => el.remove());

    // Locate main content container
    const mainContent =
      doc.querySelector('article') ||
      doc.querySelector('main') ||
      doc.querySelector('.note-content') ||
      doc.querySelector('.page-content') ||
      doc.querySelector('.shine-editor') ||
      doc.querySelector('.content') ||
      doc.body;

    // Remove first <h1> if it strictly duplicates the extracted title
    const topH1 = mainContent.querySelector('h1');
    if (topH1 && topH1.textContent?.trim().toLowerCase() === title.toLowerCase()) {
      topH1.remove();
    }

    // Clean attributes and inline event handlers
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

    // Process Tables: ensure responsive wrapper & sleek classes
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

      if (!t.parentElement?.classList.contains('overflow-x-auto') && !t.parentElement?.classList.contains('shine-table-wrapper')) {
        const wrapper = doc.createElement('div');
        wrapper.className = 'w-full overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-2xs bg-white shine-table-wrapper';
        t.parentNode?.insertBefore(wrapper, t);
        wrapper.appendChild(t);
      }
    });

    // Process Images: Match relative paths to actual binary asset blobs
    const pictures: Attachment[] = [];
    const imgElements = Array.from(mainContent.querySelectorAll('img'));

    for (let i = 0; i < imgElements.length; i++) {
      const img = imgElements[i];
      const rawSrc = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || `Photo ${i + 1}`;
      const cleanAlt = alt.trim() || `Photo ${i + 1}`;

      if (!rawSrc) continue;

      if (rawSrc.startsWith('data:image/')) {
        // Base64 embedded photo
        const attId = `att_batch_${Date.now()}_${reviewIndex}_${i}`;
        const fileNameSafe = `${cleanAlt.replace(/[^a-zA-Z0-9_-]/g, '_')}.png`;

        try {
          const file = dataURLtoFile(rawSrc, fileNameSafe);
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
          img.src = objUrl;
          img.setAttribute('data-attachment-id', attId);
        } catch (err) {
          console.warn('Could not extract base64 image in batch:', err);
        }
      } else if (rawSrc.startsWith('http://') || rawSrc.startsWith('https://')) {
        // Remote web image
        const attId = `att_url_${Date.now()}_${reviewIndex}_${i}`;
        const newAtt: Attachment = {
          id: attId,
          name: cleanAlt,
          url: rawSrc,
        };
        pictures.push(newAtt);
        img.setAttribute('data-attachment-id', attId);
      } else {
        // Relative path (e.g. "images/photo.png", "./images/photo.png", or "photo.png")
        let decodedSrc = '';
        try {
          decodedSrc = decodeURIComponent(rawSrc);
        } catch {
          decodedSrc = rawSrc;
        }
        decodedSrc = normalizePath(decodedSrc.replace(/^\.\//, ''));
        const targetFileName = decodedSrc.split('/').pop()?.toLowerCase() || '';

        // Match against assets in this review's directory
        let matchedAsset = reviewAssets.find((a) => {
          const normalizedAssetPath = normalizePath(a.relativePath);
          // Exact subpath match
          if (reviewDir && normalizedAssetPath === normalizePath(reviewDir + decodedSrc)) {
            return true;
          }
          if (normalizedAssetPath.endsWith('/' + decodedSrc) || normalizedAssetPath === decodedSrc) {
            return true;
          }
          // Filename match inside review folder
          if (a.fileName.toLowerCase() === targetFileName) {
            return true;
          }
          return false;
        });

        // Fallback: match anywhere in image items by filename
        if (!matchedAsset && targetFileName) {
          matchedAsset = allFallbackAssets.find((a) => a.fileName.toLowerCase() === targetFileName);
        }

        if (matchedAsset) {
          const attId = `att_asset_${Date.now()}_${reviewIndex}_${i}_${Math.random().toString(36).substring(2, 6)}`;
          try {
            const blob = await matchedAsset.getBlob();
            const mimeType = blob.type || 'image/png';
            await saveMediaBlob(attId, blob, matchedAsset.fileName, mimeType);
            const objUrl = URL.createObjectURL(blob);
            registerActiveObjectUrl(attId, objUrl);

            const newAtt: Attachment = {
              id: attId,
              name: cleanAlt !== `Photo ${i + 1}` ? cleanAlt : matchedAsset.fileName,
              url: objUrl,
              mimetype: mimeType,
              size: blob.size,
            };
            pictures.push(newAtt);
            img.src = objUrl;
            img.setAttribute('data-attachment-id', attId);
          } catch (blobErr) {
            console.warn('Could not read image blob from batch:', blobErr);
          }
        }
      }

      // Add responsive styling
      img.classList.add('w-full', 'rounded-2xl', 'border', 'border-slate-200', 'shadow-2xs', 'object-cover', 'my-4', 'max-w-2xl');
      img.setAttribute('loading', 'lazy');
      img.setAttribute('referrerpolicy', 'no-referrer');
    }

    // Typography styling
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

    // Link styling & external target
    mainContent.querySelectorAll('a').forEach((a) => {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
      const href = a.getAttribute('href') || '';
      const isYouTube = href.includes('youtube.com') || href.includes('youtu.be');
      if (isYouTube) {
        a.className =
          'inline-flex items-center gap-1.5 px-2 py-0.5 my-0.5 rounded-lg text-xs font-semibold bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-900 border border-rose-200/90 shadow-2xs font-mono break-all cursor-pointer align-baseline';
      } else {
        a.className =
          'inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 underline font-medium hover:underline transition-colors break-all cursor-pointer align-baseline';
      }
    });

    const finalBodyHtml = mainContent.innerHTML.trim();
    const plainText = mainContent.textContent || '';
    const words = plainText.trim().split(/\s+/).filter(Boolean);

    // Skip empty or shadow phantom files with zero content
    if (words.length === 0 && pictures.length === 0 && tables.length === 0) {
      continue;
    }
    // Skip ghost files whose title or filename starts with dot or dot-underscore
    const cleanTitle = title.trim();
    if (cleanTitle.startsWith('.') || cleanTitle.startsWith('._') || htmlItem.fileName.startsWith('.') || htmlItem.fileName.startsWith('._')) {
      continue;
    }

    // Auto-match device / product
    const matched = detectMatchingProduct(cleanTitle, plainText, products);
    const matchedProd = matched.id ? products.find((p) => p.id === matched.id) : undefined;
    const matchedTitle = matchedProd ? getCleanProductDisplayName(matchedProd) : matched.title;

    results.push({
      id: `batch_rev_${Date.now()}_${reviewIndex}`,
      folderName,
      title: cleanTitle,
      body: finalBodyHtml || '<p>No content in imported review.</p>',
      authorName,
      rating: 5,
      matchedProductId: matched.id,
      matchedProductTitle: matchedTitle,
      pictures,
      tableCount: tables.length,
      imageCount: pictures.length,
      wordCount: words.length,
      fileName: htmlItem.fileName,
      relativePath: htmlItem.relativePath,
    });
  }

  return results;
}

/**
 * Parses an exported batch ZIP file (e.g. exported from UpNote or notes app).
 */
export async function parseBatchFromZip(
  zipFile: File,
  products: Product[] = []
): Promise<ParsedBatchReview[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const items: BatchFileItem[] = [];

  for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
    if (zipEntry.dir) continue;
    const normalized = normalizePath(relativePath);
    const fileName = normalized.split('/').pop() || '';

    items.push({
      relativePath: normalized,
      fileName,
      getBlob: async () => {
        const u8 = await zipEntry.async('uint8array');
        let mime = 'application/octet-stream';
        const lower = fileName.toLowerCase();
        if (lower.endsWith('.png')) mime = 'image/png';
        else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) mime = 'image/jpeg';
        else if (lower.endsWith('.webp')) mime = 'image/webp';
        else if (lower.endsWith('.gif')) mime = 'image/gif';
        else if (lower.endsWith('.svg')) mime = 'image/svg+xml';
        return new Blob([u8], { type: mime });
      },
      getText: async () => zipEntry.async('text'),
    });
  }

  return processBatchFileItems(items, products);
}

/**
 * Parses files chosen from a folder input (<input type="file" webkitdirectory directory multiple />).
 */
export async function parseBatchFromDirectoryFiles(
  files: FileList | File[],
  products: Product[] = []
): Promise<ParsedBatchReview[]> {
  const fileArray = Array.from(files);
  const items: BatchFileItem[] = fileArray.map((file) => {
    const relativePath = normalizePath(file.webkitRelativePath || file.name);
    return {
      relativePath,
      fileName: file.name,
      getBlob: async () => file,
      getText: async () => file.text(),
    };
  });

  return processBatchFileItems(items, products);
}

/**
 * Recursively scans dragged and dropped folders and files using webkitGetAsEntry.
 */
export async function readDroppedFilesRecursively(dataTransfer: DataTransfer): Promise<File[]> {
  const files: File[] = [];
  const items = Array.from(dataTransfer.items || []);

  const traverseFileTree = async (item: any, path = ''): Promise<void> => {
    if (item.isFile) {
      const file = await new Promise<File>((resolve, reject) => {
        item.file(resolve, reject);
      });
      // Attach custom relative path for proper folder structure preservation
      Object.defineProperty(file, 'webkitRelativePath', {
        value: path + file.name,
        writable: false,
      });
      files.push(file);
    } else if (item.isDirectory) {
      const dirReader = item.createReader();
      const entries = await new Promise<any[]>((resolve, reject) => {
        const result: any[] = [];
        const readEntries = () => {
          dirReader.readEntries((batch: any[]) => {
            if (batch.length === 0) {
              resolve(result);
            } else {
              result.push(...batch);
              readEntries();
            }
          }, reject);
        };
        readEntries();
      });

      for (const entry of entries) {
        await traverseFileTree(entry, path + item.name + '/');
      }
    }
  };

  const queue: Promise<void>[] = [];
  for (const item of items) {
    const entry = item.webkitGetAsEntry?.();
    if (entry) {
      queue.push(traverseFileTree(entry));
    } else {
      const f = item.getAsFile();
      if (f) files.push(f);
    }
  }

  await Promise.all(queue);
  return files;
}
