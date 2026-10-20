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

  // 5. Sanitize any potentially dangerous tags (scripts/iframes)
  formatted = formatted.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  formatted = formatted.replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '');

  return formatted;
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

  // Check if content contains HTML tags or if we generated <strong>/<em> tags
  const hasHtml = /<[a-z][\s\S]*>/i.test(processed);

  if (hasHtml) {
    // Convert newlines to <br /> inside HTML formatted text
    const htmlWithBreaks = processed.replace(/\r?\n/g, '<br />');
    return (
      <div
        className={`leading-relaxed break-words whitespace-pre-line [&_b]:font-bold [&_b]:text-slate-900 [&_strong]:font-bold [&_strong]:text-slate-900 [&_u]:underline [&_i]:italic [&_em]:italic [&_a]:text-indigo-600 [&_a]:underline [&_a]:hover:text-indigo-800 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 ${className}`}
        dangerouslySetInnerHTML={{ __html: htmlWithBreaks }}
      />
    );
  }

  // Pure text with newlines and bullet formatting
  return (
    <div
      className={`leading-relaxed whitespace-pre-line break-words text-slate-800 ${className}`}
    >
      {processed}
    </div>
  );
};
