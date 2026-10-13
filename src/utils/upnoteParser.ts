import { Attachment } from '../types';
import { createAttachmentFromFile } from './imageCompressor';

export interface ProcessedPasteResult {
  /** The rich HTML content cleanly preserved */
  htmlContent: string;
  /** Backward-compatible text/markdown representation */
  markdownText: string;
  /** Extracted images as local Attachment objects */
  newPictures: Attachment[];
  /** Summary of what was processed */
  detectedTablesCount: number;
  detectedImagesCount: number;
}

/**
 * Converts a standard HTML `<table>` element into a clean GitHub Flavored Markdown table.
 */
export function htmlTableToMarkdown(tableElement: HTMLTableElement): string {
  const rows = Array.from(tableElement.querySelectorAll('tr'));
  if (rows.length === 0) return '';

  const tableData: string[][] = [];
  let maxCols = 0;

  for (const row of rows) {
    const cells = Array.from(row.querySelectorAll('th, td'));
    const rowValues = cells.map((cell) => {
      // Clean up cell content: replace newlines with <br/> and pipe symbols with \|
      let text = (cell.textContent || '').trim();
      text = text.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
      // If cell has bold, strong, or checkmark icons
      if (cell.querySelector('strong, b')) {
        // Keep bold if appropriate or leave clean
      }
      return text;
    });

    if (rowValues.length > maxCols) {
      maxCols = rowValues.length;
    }
    if (rowValues.length > 0) {
      tableData.push(rowValues);
    }
  }

  if (tableData.length === 0 || maxCols === 0) return '';

  // Pad rows that might have fewer columns
  const paddedData = tableData.map((row) => {
    while (row.length < maxCols) {
      row.push('');
    }
    return row;
  });

  const lines: string[] = [];

  // Header row (first row or default headers)
  const headerRow = paddedData[0];
  lines.push(`| ${headerRow.join(' | ')} |`);

  // Divider row
  const dividerRow = new Array(maxCols).fill('---');
  lines.push(`| ${dividerRow.join(' | ')} |`);

  // Remaining data rows
  for (let i = 1; i < paddedData.length; i++) {
    lines.push(`| ${paddedData[i].join(' | ')} |`);
  }

  return lines.join('\n');
}

/**
 * Detects if plain text has tab-separated columns (typical when pasting spreadsheet or UpNote table as plain text)
 * and formats it into a Markdown table.
 */
export function tsvToMarkdownTable(text: string): { isTable: boolean; markdown: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { isTable: false, markdown: text };

  // Check if multiple lines contain tabs
  const tabCounts = lines.map((l) => (l.match(/\t/g) || []).length);
  const maxTabs = Math.max(...tabCounts);

  // If at least 2 lines have tabs and at least 1 tab per line
  if (maxTabs >= 1) {
    const tableData = lines.map((line) => line.split('\t').map((c) => c.trim().replace(/\|/g, '\\|')));
    const maxCols = Math.max(...tableData.map((r) => r.length));

    if (maxCols >= 2) {
      const padded = tableData.map((row) => {
        while (row.length < maxCols) row.push('');
        return row;
      });

      const mdLines: string[] = [];
      mdLines.push(`| ${padded[0].join(' | ')} |`);
      mdLines.push(`| ${new Array(maxCols).fill('---').join(' | ')} |`);
      for (let i = 1; i < padded.length; i++) {
        mdLines.push(`| ${padded[i].join(' | ')} |`);
      }
      return { isTable: true, markdown: mdLines.join('\n') };
    }
  }

  return { isTable: false, markdown: text };
}

/**
 * Detects if plain text has tab-separated columns (typical when pasting spreadsheet as plain text)
 * and formats it into clean responsive HTML table.
 */
export function tsvToHtmlTable(text: string): { isTable: boolean; html: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return { isTable: false, html: text };

  const tabCounts = lines.map((l) => (l.match(/\t/g) || []).length);
  const maxTabs = Math.max(...tabCounts);

  if (maxTabs >= 1) {
    const tableData = lines.map((line) => line.split('\t').map((c) => c.trim()));
    const maxCols = Math.max(...tableData.map((r) => r.length));

    if (maxCols >= 2) {
      const padded = tableData.map((row) => {
        while (row.length < maxCols) row.push('');
        return row;
      });

      const headerCells = padded[0]
        .map(
          (c) =>
            `<th class="border-b border-r last:border-r-0 border-slate-200 px-3 py-2.5 bg-slate-50 font-bold text-slate-800 text-left whitespace-nowrap">${c || '&nbsp;'}</th>`
        )
        .join('');
      const bodyRows = padded
        .slice(1)
        .map(
          (row) =>
            `<tr>${row
              .map(
                (c) =>
                  `<td class="border-b border-r last:border-r-0 border-slate-200 px-3 py-2 text-slate-700 align-top">${c || '&nbsp;'}</td>`
              )
              .join('')}</tr>`
        )
        .join('');

      const tableHtml = `<div class="w-full overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-2xs bg-white"><table class="w-full min-w-[480px] border-collapse text-sm"><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows}</tbody></table></div>`;
      return { isTable: true, html: tableHtml };
    }
  }

  return { isTable: false, html: text };
}

/**
 * Converts general rich HTML (from UpNote or Webpage) into clean markdown,
 * replacing `<table>` with Markdown tables, `<h1>`-`<h6>` with `#`, etc.
 */
export function htmlToMarkdown(htmlString: string): { markdown: string; tableCount: number } {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlString, 'text/html');

  let tableCount = 0;

  // Process all tables first by replacing them with unique markdown markers
  const tables = Array.from(doc.querySelectorAll('table'));
  tables.forEach((table) => {
    tableCount++;
    const mdTable = htmlTableToMarkdown(table);
    const placeholder = doc.createElement('div');
    placeholder.setAttribute('data-md-table', 'true');
    placeholder.textContent = `\n\n${mdTable}\n\n`;
    table.parentNode?.replaceChild(placeholder, table);
  });

  // Convert headings
  for (let i = 6; i >= 1; i--) {
    const headings = Array.from(doc.querySelectorAll(`h${i}`));
    headings.forEach((h) => {
      const prefix = '#'.repeat(i);
      const text = h.textContent?.trim() || '';
      const p = doc.createElement('p');
      p.textContent = `\n\n${prefix} ${text}\n\n`;
      h.parentNode?.replaceChild(p, h);
    });
  }

  // Convert bold / strong
  const strongs = Array.from(doc.querySelectorAll('strong, b'));
  strongs.forEach((s) => {
    const text = s.textContent || '';
    s.textContent = `**${text}**`;
  });

  // Convert lists
  const listItems = Array.from(doc.querySelectorAll('li'));
  listItems.forEach((li) => {
    const text = li.textContent?.trim() || '';
    li.textContent = `• ${text}\n`;
  });

  // Extract clean text
  let content = doc.body.textContent || '';

  // Clean up excessive blank lines (more than 2 consecutive newlines)
  content = content.replace(/\n{3,}/g, '\n\n').trim();

  return { markdown: content, tableCount };
}

/**
 * Converts a Base64 data URL to a File object for processing.
 */
export function dataURLtoFile(dataurl: string, filename: string): File {
  const arr = dataurl.split(',');
  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
  const bstr = atob(arr[1]);
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new File([u8arr], filename, { type: mime });
}

/**
 * Parses ClipboardEvent data (from UpNote or Webpage) to extract:
 * 1. Formatted markdown table and text
 * 2. Binary clipboard images and Base64 images embedded in HTML
 */
export async function parseClipboardReviewData(
  e: React.ClipboardEvent | ClipboardEvent
): Promise<ProcessedPasteResult> {
  const clipboardData = e.clipboardData;
  if (!clipboardData) {
    return {
      htmlContent: '',
      markdownText: '',
      newPictures: [],
      detectedTablesCount: 0,
      detectedImagesCount: 0,
    };
  }

  const htmlData = clipboardData.getData('text/html');
  const plainText = clipboardData.getData('text/plain');

  const newPictures: Attachment[] = [];
  let detectedImagesCount = 0;

  // 1. Check for direct image files in clipboardData.items / files (e.g. copied picture from UpNote / Web)
  const items = Array.from(clipboardData.items || []);
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) {
        detectedImagesCount++;
        const att = await createAttachmentFromFile(file);
        newPictures.push(att);
      }
    }
  }

  // 2. Check for base64 images embedded in HTML
  if (htmlData) {
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    const imgTags = Array.from(doc.querySelectorAll('img'));

    for (let i = 0; i < imgTags.length; i++) {
      const src = imgTags[i].getAttribute('src') || '';
      if (src.startsWith('data:image/')) {
        detectedImagesCount++;
        const file = dataURLtoFile(src, `Pasted_Image_${Date.now()}_${i + 1}.png`);
        const att = await createAttachmentFromFile(file);
        newPictures.push(att);
      } else if (src.startsWith('http://') || src.startsWith('https://')) {
        // Webpage external image link
        detectedImagesCount++;
        const imgName = src.split('/').pop()?.split('?')[0] || `Web_Image_${i + 1}.jpg`;
        const att: Attachment = {
          id: `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
          name: imgName,
          url: src,
        };
        newPictures.push(att);
      }
    }
  }

  // 3. Process text and tables
  let finalHtml = '';
  let finalMarkdown = '';
  let detectedTablesCount = 0;

  if (htmlData) {
    // Rich HTML from clipboard: sanitize and preserve rich styling directly
    finalHtml = sanitizeReviewHtml(htmlData);
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlData, 'text/html');
    detectedTablesCount = doc.querySelectorAll('table').length;

    if (htmlData.includes('<table')) {
      const res = htmlToMarkdown(htmlData);
      finalMarkdown = res.markdown;
    } else {
      finalMarkdown = plainText || doc.body.textContent || '';
    }
  } else if (plainText) {
    // Plain text or TSV table
    const tsvRes = tsvToHtmlTable(plainText);
    if (tsvRes.isTable) {
      finalHtml = tsvRes.html;
      finalMarkdown = tsvToMarkdownTable(plainText).markdown;
      detectedTablesCount = 1;
    } else {
      finalHtml = `<p>${plainText.replace(/\n\n+/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;
      finalMarkdown = plainText;
    }
  }

  return {
    htmlContent: finalHtml,
    markdownText: finalMarkdown,
    newPictures,
    detectedTablesCount,
    detectedImagesCount,
  };
}

/**
 * Strips HTML tags and Markdown formatting from a string to produce clean, readable plain text
 * for card summaries, search indexing, and snippets.
 */
export function stripHtmlAndMarkdownToText(content?: string | null, maxLength?: number): string {
  if (!content) return '';

  let text = content;
  // If HTML detected, parse textContent
  if (/<\/?(p|div|h[1-6]|table|ul|ol|li|img|figure|blockquote|span|b|i|u|strong|em|mark|del)[\s>]/i.test(content) || (content.includes('<') && content.includes('>'))) {
    try {
      const doc = new DOMParser().parseFromString(content, 'text/html');
      text = doc.body.textContent || '';
    } catch {
      text = content.replace(/<[^>]+>/g, ' ');
    }
  }

  // Clean common Markdown syntax
  text = text
    .replace(/^#{1,6}\s+/gm, '') // # Headings
    .replace(/\*\*([^*]+)\*\*/g, '$1') // **bold**
    .replace(/\*([^*]+)\*/g, '$1') // *italic*
    .replace(/__([^_]+)__/g, '$1') // __bold__
    .replace(/_([^_]+)_/g, '$1') // _italic_
    .replace(/~~([^~]+)~~/g, '$1') // ~~strikethrough~~
    .replace(/==([^=]+)==/g, '$1') // ==highlight==
    .replace(/!\[.*?\]\(.*?\)/g, '') // ![images](...)
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1') // [links](...)
    .replace(/^\s*[-*+]\s+/gm, '') // Bullet points
    .replace(/^\s*\d+\.\s+/gm, '') // Numbered points
    .replace(/\|/g, ' ') // Table borders
    .replace(/[-:]{3,}/g, ' ') // Table dashes
    .replace(/\s+/g, ' ') // Collapse whitespace
    .trim();

  if (maxLength && text.length > maxLength) {
    return text.slice(0, maxLength).trim() + '...';
  }
  return text;
}

/**
 * Sanitizes rich review HTML to prevent XSS and ensure clean typography and table styles.
 */
export function sanitizeReviewHtml(rawHtml: string): string {
  if (!rawHtml) return '';

  let html = rawHtml;
  // If it's escaped HTML like &lt;h1&gt;, unescape it first
  if (
    (html.includes('&lt;h') || html.includes('&lt;p') || html.includes('&lt;div') || html.includes('&lt;table')) &&
    !html.includes('<h') &&
    !html.includes('<p')
  ) {
    const txt = document.createElement('textarea');
    txt.innerHTML = html;
    html = txt.value;
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  // Strip dangerous elements
  const dangerous = doc.querySelectorAll('script, iframe, object, embed, applet, base, form, input, button');
  dangerous.forEach((el) => el.remove());

  // Remove inline event handlers
  const allElements = doc.querySelectorAll('*');
  allElements.forEach((el) => {
    const attrs = Array.from(el.attributes);
    for (const attr of attrs) {
      if (attr.name.toLowerCase().startsWith('on') || attr.value.toLowerCase().includes('javascript:')) {
        el.removeAttribute(attr.name);
      }
    }
  });

  // Ensure tables have horizontal scroll wrapping and nice responsive styling
  doc.querySelectorAll('table').forEach((t) => {
    // If not already in an overflow-x-auto container, wrap it so wide tables scroll horizontally
    if (!t.parentElement?.classList.contains('overflow-x-auto')) {
      const wrapper = doc.createElement('div');
      wrapper.className = 'w-full overflow-x-auto my-4 rounded-xl border border-slate-200 shadow-2xs bg-white';
      t.parentNode?.insertBefore(wrapper, t);
      wrapper.appendChild(t);
    }
    t.classList.add('w-full', 'min-w-[480px]', 'border-collapse', 'text-sm');
    t.querySelectorAll('th').forEach((th) => {
      th.classList.add('border-b', 'border-r', 'last:border-r-0', 'border-slate-200', 'px-3', 'py-2.5', 'bg-slate-50', 'font-bold', 'text-slate-800', 'text-left', 'whitespace-nowrap');
    });
    t.querySelectorAll('td').forEach((td) => {
      td.classList.add('border-b', 'border-r', 'last:border-r-0', 'border-slate-200', 'px-3', 'py-2', 'text-slate-700', 'align-top');
    });
  });

  // Ensure code blocks and pre elements can scroll horizontally
  doc.querySelectorAll('pre').forEach((pre) => {
    pre.classList.add('overflow-x-auto', 'p-3', 'my-3', 'bg-slate-900', 'text-slate-100', 'rounded-xl', 'text-xs', 'font-mono');
  });

  // Typography styling
  doc.querySelectorAll('h1').forEach((h) => h.classList.add('text-2xl', 'font-black', 'text-slate-900', 'mt-6', 'mb-3', 'pb-2', 'border-b', 'border-slate-200'));
  doc.querySelectorAll('h2').forEach((h) => h.classList.add('text-xl', 'font-bold', 'text-slate-900', 'mt-5', 'mb-2.5'));
  doc.querySelectorAll('h3').forEach((h) => h.classList.add('text-lg', 'font-bold', 'text-slate-900', 'mt-4', 'mb-2'));
  doc.querySelectorAll('p').forEach((p) => p.classList.add('mb-3', 'leading-relaxed', 'text-slate-700', 'text-sm'));
  doc.querySelectorAll('ul').forEach((ul) => ul.classList.add('list-disc', 'pl-5', 'my-3', 'space-y-1', 'text-slate-700'));
  doc.querySelectorAll('ol').forEach((ol) => ol.classList.add('list-decimal', 'pl-5', 'my-3', 'space-y-1', 'text-slate-700'));
  doc.querySelectorAll('blockquote').forEach((b) => b.classList.add('border-l-4', 'border-indigo-500', 'pl-4', 'py-1.5', 'my-3', 'bg-indigo-50/50', 'rounded-r-lg', 'text-slate-700', 'italic'));

  // Ensure images are responsive with border
  doc.querySelectorAll('img').forEach((img) => {
    img.classList.add('w-full', 'rounded-2xl', 'border', 'border-slate-200', 'shadow-2xs', 'object-cover', 'my-4', 'max-w-2xl', 'cursor-zoom-in');
    img.setAttribute('loading', 'lazy');
    img.setAttribute('referrerpolicy', 'no-referrer');
  });

  return doc.body.innerHTML;
}
