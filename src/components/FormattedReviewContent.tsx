import React, { useState, useMemo, useRef, useEffect } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { Attachment } from '../types';
import { FullscreenImageViewer } from './fullscreen-image-viewer';
import { Maximize2, Image as ImageIcon, ExternalLink } from 'lucide-react';
import {
  getAttachmentDisplayUrl,
  createSpecPlaceholderSvg,
  isExpiredOrDeadUrl,
  normalizeMediaUrl,
} from '../utils/imageFallback';
import { getCachedObjectUrl, registerActiveObjectUrl } from '../utils/imageCompressor';
import { getMediaBlob } from '../lib/indexedDbMedia';

interface ReviewImageItemProps {
  rawSrc?: string;
  attId?: string;
  alt: string;
  matched: Attachment | null;
  onOpenFullscreen: (src: string, alt: string) => void;
  [key: string]: any;
}

const ReviewImageItem: React.FC<ReviewImageItemProps> = ({
  rawSrc,
  attId,
  alt,
  matched,
  onOpenFullscreen,
  ...props
}) => {
  const [currentSrc, setCurrentSrc] = useState<string>(() => {
    const effectiveId = attId || matched?.id;
    if (effectiveId) {
      const cached = getCachedObjectUrl(effectiveId);
      if (cached) return cached;
    }
    if (rawSrc) {
      const normalized = normalizeMediaUrl(rawSrc);
      if (normalized.startsWith('https://') || normalized.startsWith('http://') || normalized.startsWith('data:')) {
        if (!isExpiredOrDeadUrl(normalized)) {
          return normalized;
        }
      }
    }
    if (matched) {
      const display = getAttachmentDisplayUrl(matched, alt);
      if (display && !display.startsWith('data:image/svg+xml')) {
        return display;
      }
    }
    return '';
  });

  const [isLoading, setIsLoading] = useState(!currentSrc || currentSrc.startsWith('data:image/svg+xml'));

  useEffect(() => {
    let isMounted = true;

    async function resolveSource() {
      const effectiveId = attId || matched?.id;

      // 1. Check in-memory object URL cache
      if (effectiveId) {
        const cached = getCachedObjectUrl(effectiveId);
        if (cached) {
          if (isMounted) {
            setCurrentSrc(cached);
            setIsLoading(false);
          }
          return;
        }

        // 2. Fetch from IndexedDB
        try {
          const blob = await getMediaBlob(effectiveId);
          if (blob && isMounted) {
            const newObjUrl = URL.createObjectURL(blob);
            registerActiveObjectUrl(effectiveId, newObjUrl);
            setCurrentSrc(newObjUrl);
            setIsLoading(false);
            return;
          }
        } catch {
          // ignore
        }
      }

      // 3. Normalized Google Drive or HTTP URL
      if (rawSrc) {
        const normalized = normalizeMediaUrl(rawSrc);
        if (normalized && !isExpiredOrDeadUrl(normalized)) {
          if (isMounted) {
            setCurrentSrc(normalized);
            setIsLoading(false);
          }
          return;
        }
      }

      // 4. Try matching attachment display URL
      if (matched) {
        const display = getAttachmentDisplayUrl(matched, alt);
        if (display && isMounted) {
          setCurrentSrc(display);
          setIsLoading(false);
          return;
        }
      }

      // 5. Fallback SVG
      if (isMounted) {
        setCurrentSrc(createSpecPlaceholderSvg(alt || matched?.name || 'Review Photo'));
        setIsLoading(false);
      }
    }

    resolveSource();

    return () => {
      isMounted = false;
    };
  }, [attId, matched?.id, rawSrc, alt]);

  const displaySrc = currentSrc || createSpecPlaceholderSvg(alt || 'Review Photo');

  return (
    <div className="my-4 rounded-xl overflow-hidden border border-slate-200 bg-slate-100 shadow-2xs group relative max-w-2xl">
      <img
        src={displaySrc}
        alt={alt || 'Review image'}
        className="w-full max-h-[480px] object-cover rounded-t-xl cursor-zoom-in"
        referrerPolicy="no-referrer"
        loading="lazy"
        onError={(e) => {
          (e.target as HTMLImageElement).src = createSpecPlaceholderSvg(alt || 'Review Photo');
        }}
        onClick={() => onOpenFullscreen(displaySrc, alt)}
        {...props}
      />
      <div className="p-2 bg-white/95 border-t border-slate-200 flex items-center justify-between text-xs text-slate-600">
        <span className="truncate font-medium">{alt || matched?.name || 'Attached picture'}</span>
        <button
          type="button"
          onClick={() => onOpenFullscreen(displaySrc, alt)}
          className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5" />
          <span>Full screen</span>
        </button>
      </div>
    </div>
  );
};

interface FormattedReviewContentProps {
  content: string;
  className?: string;
  pictures?: Attachment[];
}

export const FormattedReviewContent: React.FC<FormattedReviewContentProps> = ({
  content,
  className = '',
  pictures = [],
}) => {
  const [fullscreenImages, setFullscreenImages] = useState<Attachment[] | null>(null);
  const [fullscreenIndex, setFullscreenIndex] = useState(0);
  const htmlContainerRef = useRef<HTMLDivElement>(null);

  if (!content) return null;

  // Find attachment by matching URL, image name, ID, or data-attachment-id
  const findAttachment = (src?: string, attId?: string, altText?: string) => {
    if (attId) {
      const matchById = pictures.find((p) => p.id === attId);
      if (matchById) return matchById;
    }
    if (!src && !altText) return null;
    return (
      (src ? pictures.find((p) => p.url === src || p.smUrl === src || p.dataUrl === src) : null) ||
      (src ? pictures.find((p) => src.includes(p.id) || (p.name && src.includes(p.name))) : null) ||
      (altText ? pictures.find((p) => p.name === altText || (p.id && altText.includes(p.id))) : null) ||
      null
    );
  };

  // Pre-process markdown and HTML content to guarantee flawless rendering:
  // 1. Unescapes underscores in URLs (UpNote exports `\_` inside links)
  // 2. Ensures markdown tables have clean blank lines around them so GFM table parser activates reliably
  // 3. Converts markdown image syntax to figures with zoom and metadata
  const preparedMarkdown = useMemo(() => {
    if (!content) return '';
    let text = content;

    // Clean escaped underscores in Markdown links: [https://...\_...](https://..._...)
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, url) => {
      const cleanLabel = label.replace(/\\_/g, '_');
      const cleanUrl = url.replace(/\\_/g, '_');
      return `[${cleanLabel}](${cleanUrl})`;
    });

    // Clean escaped underscores in angle bracket URLs: <https://...\_...>
    text = text.replace(/<((?:https?:\/\/|www\.)[^>]+)>/g, (_m, url) => {
      return `<${url.replace(/\\_/g, '_')}>`;
    });

    // Clean escaped underscores in bare URLs
    text = text.replace(/(https?:\/\/[^\s<>()"']+)/g, (_m, url) => {
      return url.replace(/\\_/g, '_');
    });

    // Convert markdown images to figures with zoom and attachment ID if needed, ensuring surrounding blank lines
    text = text.replace(
      /!\[(.*?)\]\((.*?)\)/gim,
      '\n\n<figure class="my-4 max-w-2xl"><img src="$2" alt="$1" class="w-full rounded-2xl border border-slate-200 shadow-2xs object-cover cursor-zoom-in" /><figcaption class="text-xs text-slate-500 mt-1 font-medium italic">$1</figcaption></figure>\n\n'
    );

    // Line-based Markdown table normalization: guarantees blank line before and after tables
    const lines = text.split(/\r?\n/);
    const result: string[] = [];
    let inTable = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const hasPipes = trimmed.includes('|');
      const isSeparator = /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(trimmed);
      const nextTrimmed = i + 1 < lines.length ? lines[i + 1].trim() : '';
      const nextIsSeparator = /^\|?(\s*:?-+:?\s*\|)+\s*:?-+:?\s*\|?$/.test(nextTrimmed);

      const isTableRow = inTable ? (hasPipes || isSeparator) : (hasPipes && nextIsSeparator);

      if (isTableRow) {
        if (!inTable) {
          if (result.length > 0 && result[result.length - 1].trim() !== '') {
            result.push('');
          }
          inTable = true;
        }

        let formattedLine = trimmed;
        if (!formattedLine.startsWith('|')) formattedLine = '| ' + formattedLine;
        if (!formattedLine.endsWith('|')) formattedLine = formattedLine + ' |';

        result.push(formattedLine);
      } else {
        if (inTable) {
          if (trimmed !== '') {
            result.push('');
          }
          inTable = false;
        }
        result.push(line);
      }
    }

    return result.join('\n');
  }, [content]);

  // Unified image opener that resolves the exact clicked image and gathers all review images
  const openImageViewer = (clickedSrc: string, clickedAlt?: string) => {
    if (!clickedSrc) return;

    // Gather all unique images from the DOM container and pictures prop
    const domImgs = htmlContainerRef.current
      ? Array.from(htmlContainerRef.current.querySelectorAll('img'))
      : [];

    const allImgList: Attachment[] = [];
    const seenUrls = new Set<string>();

    // First, add all images present in the rendered HTML in DOM order
    domImgs.forEach((imgEl, idx) => {
      const src = imgEl.currentSrc || imgEl.src || imgEl.getAttribute('src') || '';
      if (src && !seenUrls.has(src)) {
        seenUrls.add(src);
        const alt = imgEl.getAttribute('alt') || `Photo ${idx + 1}`;
        const attId = imgEl.getAttribute('data-attachment-id') || imgEl.getAttribute('data-attachment-token') || '';
        const matched = findAttachment(src, attId, alt);
        allImgList.push({
          id: matched?.id || attId || `dom_img_${idx}_${Date.now()}`,
          name: matched?.name || alt,
          url: matched?.url || src,
          dataUrl: matched?.dataUrl,
          smUrl: matched?.smUrl || src,
          lgUrl: matched?.lgUrl || src,
        });
      }
    });

    // Then, add any pictures from the review that weren't in the DOM
    pictures.forEach((p) => {
      const activeUrl = p.id ? getCachedObjectUrl(p.id) : undefined;
      const normalizedUrl = normalizeMediaUrl(activeUrl || p.url || p.dataUrl);
      if (normalizedUrl && !seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        allImgList.push({
          ...p,
          url: normalizedUrl,
        });
      }
    });

    // If still empty, add the clicked image
    if (allImgList.length === 0) {
      allImgList.push({
        id: `img_click_${Date.now()}`,
        name: clickedAlt || 'Review Photo',
        url: clickedSrc,
      });
    }

    // Find the exact index of the clicked image
    let targetIdx = allImgList.findIndex(
      (item) =>
        item.url === clickedSrc ||
        item.dataUrl === clickedSrc ||
        (clickedSrc && item.url && item.url.includes(clickedSrc))
    );
    if (targetIdx === -1 && clickedAlt) {
      targetIdx = allImgList.findIndex((item) => item.name === clickedAlt);
    }
    if (targetIdx === -1) {
      allImgList.unshift({
        id: `img_direct_${Date.now()}`,
        name: clickedAlt || 'Review Photo',
        url: clickedSrc,
      });
      targetIdx = 0;
    }

    setFullscreenImages([...allImgList]);
    setFullscreenIndex(Math.max(0, targetIdx));
  };

  // Robust container-level click delegation for any rendered images in HTML
  const handleHtmlContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const img = target.closest('img');
    if (!img) return;

    e.preventDefault();
    e.stopPropagation();

    const src = img.getAttribute('src') || img.src || '';
    const alt = img.getAttribute('alt') || 'Review Photo';
    openImageViewer(src, alt);
  };

  // Setup image resolvers and cursor on rendered <img> elements
  useEffect(() => {
    if (!htmlContainerRef.current) return;

    const container = htmlContainerRef.current;
    const imgElements = Array.from(container.querySelectorAll('img'));

    imgElements.forEach((img) => {
      const src = img.getAttribute('src') || '';
      const attId = img.getAttribute('data-attachment-id') || '';
      const alt = img.getAttribute('alt') || 'Review picture';
      const matched = findAttachment(src, attId, alt);

      // If matched with a saved attachment, update display URL
      if (matched) {
        const displayUrl = getAttachmentDisplayUrl(matched, alt);
        if (displayUrl && displayUrl !== src && !displayUrl.startsWith('data:image/svg+xml')) {
          img.src = displayUrl;
        }
      }

      // Add fallback error handler
      img.onerror = () => {
        if (!img.src.startsWith('data:image/svg+xml')) {
          img.src = createSpecPlaceholderSvg(alt);
        }
      };

      img.style.cursor = 'zoom-in';
    });
  }, [preparedMarkdown, pictures]);

  return (
    <>
      <div
        ref={htmlContainerRef}
        onClick={handleHtmlContainerClick}
        className={`review-formatted-body max-w-none text-slate-800 text-sm leading-relaxed ${className}`}
      >
        <Markdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw]}
          components={{
            // Images embedded in Markdown or HTML
            img: ({ node, src, alt, ...props }) => {
              const attId =
                (props as any)?.['data-attachment-id'] ||
                (props as any)?.dataAttachmentId ||
                (node?.properties as any)?.['data-attachment-id'] ||
                (node?.properties as any)?.dataAttachmentId ||
                (props as any)?.['data-attachment-token'] ||
                (node?.properties as any)?.['data-attachment-token'] ||
                (src && src.startsWith('att_') ? src : undefined);

              const cleanAlt = alt || 'Review image';
              const matched = findAttachment(src, attId, cleanAlt);

              if (!src && !attId && !matched) return null;

              return (
                <ReviewImageItem
                  rawSrc={src}
                  attId={attId}
                  alt={cleanAlt}
                  matched={matched}
                  onOpenFullscreen={(displaySrc, clickedAlt) => openImageViewer(displaySrc, clickedAlt)}
                  {...props}
                />
              );
            },
            // Clickable Links with external target and styling
            a: ({ node, href, children, ...props }) => {
              if (!href) return <span {...props}>{children}</span>;
              let cleanHref = href.replace(/\\_/g, '_').trim();
              if (cleanHref.startsWith('www.')) {
                cleanHref = 'https://' + cleanHref;
              }
              const isExternal = cleanHref.startsWith('http://') || cleanHref.startsWith('https://');

              return (
                <a
                  href={cleanHref}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  className="inline-flex items-center gap-1 text-indigo-600 hover:text-indigo-800 underline font-medium hover:underline transition-colors break-all cursor-pointer align-baseline"
                  onClick={(e) => {
                    e.stopPropagation();
                  }}
                  {...props}
                >
                  <span>{children}</span>
                  {isExternal && <ExternalLink className="w-3 h-3 shrink-0 inline opacity-70" />}
                </a>
              );
            },
            // Styled GFM Markdown Tables with horizontal scroll wrapper
            table: ({ node, ...props }) => (
              <div className="my-4 overflow-x-auto rounded-xl border border-slate-200 shadow-2xs bg-white max-w-full">
                <table className="w-full text-left border-collapse text-xs sm:text-sm min-w-[360px]" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead className="bg-slate-100/90 text-slate-800 font-bold border-b border-slate-200" {...props} />
            ),
            th: ({ node, ...props }) => (
              <th className="px-3.5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-700 border border-slate-200 whitespace-nowrap bg-slate-50/90" {...props} />
            ),
            tbody: ({ node, ...props }) => (
              <tbody className="divide-y divide-slate-100" {...props} />
            ),
            tr: ({ node, ...props }) => (
              <tr className="hover:bg-indigo-50/40 transition-colors even:bg-slate-50/50" {...props} />
            ),
            td: ({ node, ...props }) => (
              <td className="px-3.5 py-2 text-xs sm:text-sm text-slate-800 border border-slate-200 align-top break-words max-w-xs" {...props} />
            ),
            // Headings
            h1: ({ node, ...props }) => (
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 mt-6 mb-3 border-b border-slate-200 pb-2" {...props} />
            ),
            h2: ({ node, ...props }) => (
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-5 mb-2.5" {...props} />
            ),
            h3: ({ node, ...props }) => (
              <h3 className="text-base sm:text-lg font-bold text-slate-900 mt-4 mb-2" {...props} />
            ),
            h4: ({ node, ...props }) => (
              <h4 className="text-sm sm:text-base font-bold text-slate-900 mt-4 mb-1.5" {...props} />
            ),
            h5: ({ node, ...props }) => (
              <h5 className="text-xs sm:text-sm font-bold text-slate-800 mt-3 mb-1" {...props} />
            ),
            h6: ({ node, ...props }) => (
              <h6 className="text-xs font-semibold text-slate-700 mt-3 mb-1 uppercase tracking-wider" {...props} />
            ),
            p: ({ node, ...props }) => (
              <div className="mb-3 whitespace-pre-line text-slate-700 text-sm leading-relaxed" {...props} />
            ),
            ul: ({ node, ...props }) => (
              <ul className="list-disc pl-5 my-3 space-y-1 text-slate-700" {...props} />
            ),
            ol: ({ node, ...props }) => (
              <ol className="list-decimal pl-5 my-3 space-y-1 text-slate-700" {...props} />
            ),
            li: ({ node, ...props }) => (
              <li className="text-sm leading-relaxed" {...props} />
            ),
            blockquote: ({ node, ...props }) => (
              <blockquote className="border-l-4 border-indigo-500 pl-4 py-1.5 my-3 bg-indigo-50/50 rounded-r-lg text-slate-700 italic" {...props} />
            ),
            code: ({ node, inline, ...props }: any) =>
              inline ? (
                <code className="px-1.5 py-0.5 rounded bg-slate-100 text-indigo-700 font-mono text-xs border border-slate-200" {...props} />
              ) : (
                <pre className="p-3 my-3 bg-slate-900 text-slate-100 rounded-xl overflow-x-auto text-xs font-mono">
                  <code {...props} />
                </pre>
              ),
            strong: ({ node, ...props }) => (
              <strong className="font-bold text-slate-900" {...props} />
            ),
          }}
        >
          {preparedMarkdown}
        </Markdown>
      </div>

      {/* Fullscreen view of embedded review pictures */}
      {fullscreenImages && (
        <FullscreenImageViewer
          isOpen={true}
          images={fullscreenImages}
          initialIndex={fullscreenIndex}
          onClose={() => setFullscreenImages(null)}
        />
      )}
    </>
  );
};

