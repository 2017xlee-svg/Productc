import React from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import { isAppSchemeUrl, openAppScheme, autoLinkUrls } from '../utils/formatHtml';

interface MarkdownContentProps {
  content: string;
  className?: string;
}

export const MarkdownContent: React.FC<MarkdownContentProps> = ({ content, className = '' }) => {
  if (!content || !content.trim()) {
    return <span className="text-slate-400 italic text-xs">No overview provided.</span>;
  }

  // Convert markdown links [Label](url) into <a> tags first so autoLinkUrls won't mangle them
  let prepared = content.replace(
    /\[([^\]]+)\]\(((?:https?|upnote|marginnote\w*|obsidian|notion|craftdocs|bear|things|onenote|goodnotes|notability|logseq):\/\/[^\s<>'"]+[\w\/=&#?%-])\)/gi,
    (_m, label, url) => {
      const isApp = isAppSchemeUrl(url);
      const targetAttr = isApp ? ' target="_top"' : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${url}"${targetAttr} class="text-blue-600 underline hover:text-blue-800 break-all cursor-pointer font-medium">${label}</a>`;
    }
  );

  // Auto-convert bare app schemes and web URLs to clickable <a> links
  prepared = autoLinkUrls(prepared);

  return (
    <div className={`prose prose-sm max-w-none text-slate-700 text-xs leading-relaxed space-y-2 ${className}`}>
      <Markdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => {
          if (/^\s*javascript:/i.test(url)) return '';
          return url;
        }}
        components={{
          a: ({ node, href, children, ...props }) => {
            if (!href) return <span {...props}>{children}</span>;
            let cleanHref = href.replace(/\\_/g, '_').trim();
            if (cleanHref.startsWith('www.')) {
              cleanHref = 'https://' + cleanHref;
            }
            const isApp = isAppSchemeUrl(cleanHref);
            const isExternal = cleanHref.startsWith('http://') || cleanHref.startsWith('https://');

            return (
              <a
                href={cleanHref}
                target={isApp ? '_top' : (isExternal ? '_blank' : undefined)}
                rel={isExternal ? 'noopener noreferrer' : undefined}
                className="text-blue-600 hover:text-blue-800 underline font-medium break-all cursor-pointer"
                onClick={(e) => {
                  if (isApp) {
                    e.stopPropagation();
                    openAppScheme(cleanHref);
                  }
                }}
                {...props}
              >
                {children}
              </a>
            );
          },
        }}
      >
        {prepared}
      </Markdown>
    </div>
  );
};
