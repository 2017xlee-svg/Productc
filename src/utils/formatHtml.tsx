import React from 'react';

/**
 * Prepares and renders specification details or review summaries as rich text,
 * properly respecting newlines, bullet points (- Item, • Item), markdown (**bold**, *italic*),
 * and safe HTML tags (<b>, <strong>, <i>, <u>, <a>, <br>).
 */
export function formatSpecificationDetails(rawText?: string): string {
  if (!rawText) return '';

  let formatted = rawText;

  // 1. Normalize escaped literal "\n" strings (often found in JSON or API seeds) to real newlines
  formatted = formatted.replace(/\\n/g, '\n');

  // 2. Convert Markdown bold **text** or __text__ to <strong>text</strong>
  formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // 3. Convert Markdown italic *text* or _text_ (excluding HTML tags) to <em>text</em>
  formatted = formatted.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

  // 4. Clean up inline dashes like "from a distance. - Wide-Stereo" or "single voice - Wide-Stereo" -> newlines with bullets
  // Handles bullet points like "- Point 1 - Point 2"
  formatted = formatted.replace(/([.!?]|[\w\>])\s+-\s+([A-Z0-9<])/g, '$1\n• $2');
  // Handle start of string dashes: "- Item" -> "• Item"
  formatted = formatted.replace(/^-\s+/gm, '• ');

  // 5. Convert markdown links [Label](url)
  formatted = formatted.replace(
    /\[(.*?)\]\(((?:https?|upnote|marginnote\w*|obsidian|notion|craftdocs|bear|things|onenote|goodnotes|notability|logseq):\/\/[^\s<>'"]+[\w\/=&#?%-])\)/gi,
    (_m, label, url) => {
      const isApp = isAppSchemeUrl(url);
      const targetAttr = isApp ? ' target="_top"' : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${url}"${targetAttr} class="text-blue-600 underline hover:text-blue-800 break-all cursor-pointer font-medium">${label}</a>`;
    }
  );

  // 6. Sanitize any potentially dangerous tags (scripts/iframes)
  formatted = formatted.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  formatted = formatted.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  // 7. Auto-link bare URLs (including UpNote, MarginNote, Obsidian, etc. and standard web links)
  formatted = autoLinkUrls(formatted);

  return formatted;
}

/**
 * Detects whether a URL is a native app custom scheme (e.g. upnote://, marginnote4app://, obsidian://, etc.)
 */
export function isAppSchemeUrl(url?: string): boolean {
  if (!url) return false;
  const trimmed = url.trim();
  if (/^javascript:/i.test(trimmed) || /^mailto:/i.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return false;
  if (/^(upnote|marginnote\w*|obsidian|notion|craftdocs|bear|things|onenote|goodnotes|notability|logseq):/i.test(trimmed)) {
    return true;
  }
  return /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//i.test(trimmed);
}

/**
 * Dispatches navigation to a native app custom scheme.
 * On mobile browsers (iOS Safari, Android Chrome) and desktop browsers,
 * setting window.top.location.href or window.location.href prompts the OS to open the application directly.
 */
export function openAppScheme(url: string): void {
  if (!url) return;
  const cleanUrl = url.trim();

  // 1. Try window.top if inside an iframe (like AI Studio preview environment)
  try {
    if (window.top && window.top !== window) {
      try {
        window.top.location.href = cleanUrl;
        return;
      } catch {
        // Cross-origin iframe security can block direct window.top assignment
      }
    }
  } catch {
    // Ignore top check errors
  }

  // 2. Direct assignment on current window
  try {
    window.location.href = cleanUrl;
  } catch {
    // 3. Fallback via dynamic anchor click
    try {
      const a = document.createElement('a');
      a.href = cleanUrl;
      a.target = '_top';
      a.rel = 'noopener noreferrer';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      window.open(cleanUrl, '_top');
    }
  }
}

/**
 * Auto-links bare URLs (including native app schemes like upnote://, marginnote4app://, obsidian://, etc.
 * and standard web links http://, https://) in text, while avoiding double-linking already linked URLs.
 */
export function autoLinkUrls(text: string): string {
  if (!text) return '';
  const urlRegex = /\b((?:https?|upnote|marginnote\w*|obsidian|notion|craftdocs|bear|things|onenote|goodnotes|notability|logseq):\/\/[^\s<>'"`]+[\w\/=&#?%-])/gi;

  const parts = text.split(/(<[^>]+>)/g);
  let insideAnchor = false;

  const converted = parts.map((part) => {
    if (part.startsWith('<')) {
      if (/^<a\b/i.test(part)) {
        insideAnchor = true;
      } else if (/^<\/a>/i.test(part)) {
        insideAnchor = false;
      }
      return part;
    }

    if (insideAnchor) {
      return part;
    }

    return part.replace(urlRegex, (url) => {
      const isApp = isAppSchemeUrl(url);
      const targetAttr = isApp ? ' target="_top"' : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${url}"${targetAttr} class="text-blue-600 underline hover:text-blue-800 break-all cursor-pointer font-medium">${url}</a>`;
    });
  });

  return converted.join('');
}

interface FormattedHtmlProps {
  content?: string;
  className?: string;
}

export const FormattedSpecHtml: React.FC<FormattedHtmlProps> = ({ content = '', className = '' }) => {
  if (!content || !content.trim()) {
    return <span className="text-slate-400 italic">No value provided</span>;
  }

  const processed = formatSpecificationDetails(content);

  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const anchor = target.closest('a');
    if (!anchor) return;

    const href = anchor.getAttribute('href');
    if (!href) return;

    if (isAppSchemeUrl(href)) {
      e.preventDefault();
      e.stopPropagation();
      openAppScheme(href);
    }
  };

  // Check if content contains HTML tags or if we generated <strong>/<em>/<a> tags
  const hasHtml = /<[a-z][\s\S]*>/i.test(processed);

  if (hasHtml) {
    // Convert newlines to <br /> inside HTML formatted text
    const htmlWithBreaks = processed.replace(/\r?\n/g, '<br />');
    return (
      <div
        onClick={handleContainerClick}
        className={`leading-relaxed break-words whitespace-pre-line [&_b]:font-bold [&_b]:text-slate-900 [&_strong]:font-bold [&_strong]:text-slate-900 [&_u]:underline [&_i]:italic [&_em]:italic [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800 [&_a]:font-medium [&_a]:break-all [&_a]:cursor-pointer [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 ${className}`}
        dangerouslySetInnerHTML={{ __html: htmlWithBreaks }}
      />
    );
  }

  // Pure text with newlines and bullet formatting
  return (
    <div
      onClick={handleContainerClick}
      className={`leading-relaxed whitespace-pre-line break-words text-slate-800 ${className}`}
    >
      {processed}
    </div>
  );
};

/**
 * Checks whether text content already includes the unit measurement as a suffix or word
 * (e.g. "30g" already has "g", "27db" already has "db", "2 years" already has "year"),
 * preventing redundant display like "30g [g]".
 */
export function hasUnitSuffix(text?: string, unit?: string): boolean {
  if (!text || !unit) return false;
  const cleanText = text.replace(/<[^>]*>/g, '').trim().toLowerCase();
  const cleanUnit = unit.trim().toLowerCase();
  if (!cleanText || !cleanUnit) return false;

  // Exact suffix or pluralized suffix (e.g. "30g", "2 years")
  if (cleanText.endsWith(cleanUnit) || cleanText.endsWith(cleanUnit + 's')) {
    return true;
  }

  // Word boundary or number boundary check (e.g. "30 cm distance", "30g net")
  const regex = new RegExp(`(^|\\s|\\d)${cleanUnit}(s|\\b|$)`, 'i');
  return regex.test(cleanText);
}

interface SpecUnitBadgeProps {
  unit?: string;
  details?: string;
  className?: string;
}

export const SpecUnitBadge: React.FC<SpecUnitBadgeProps> = ({ unit, details, className = '' }) => {
  if (!unit || !unit.trim()) return null;
  if (details && hasUnitSuffix(details, unit)) return null;

  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-mono font-medium bg-slate-100 text-slate-700 border border-slate-200/90 shadow-2xs ${className}`}
    >
      {unit.trim()}
    </span>
  );
};
