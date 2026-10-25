import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Bold,
  Italic,
  Underline,
  List,
  Link2,
  RemoveFormatting,
  X,
  ExternalLink,
  Check,
} from 'lucide-react';
import { isAppSchemeUrl, openAppScheme, autoLinkUrls } from '../utils/formatHtml';

interface HtmlWysiwygEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: string;
  className?: string;
  id?: string;
  autoFocus?: boolean;
}

/**
 * Normalizes initial text, converting legacy Markdown (**bold**, *italic*, [label](url))
 * and escaped newlines into clean, editable HTML.
 */
function normalizeToEditableHtml(content: string): string {
  if (!content || !content.trim()) return '';

  let html = content;

  // 1. Convert legacy markdown bold: **text** or __text__ -> <strong>text</strong>
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');

  // 2. Convert legacy markdown italic: *text* or _text_ -> <em>text</em>
  html = html.replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3');

  // 3. Convert legacy markdown strikethrough: ~~text~~ -> <del>text</del>
  html = html.replace(/~~(.*?)~~/g, '<del>$1</del>');

  // 4. Convert legacy markdown links: [label](url) -> <a href="url" target="_top">label</a>
  html = html.replace(
    /\[([^\]]+)\]\(((?:https?|upnote|marginnote\w*|obsidian|notion|craftdocs|bear|things|onenote|goodnotes|notability|logseq):\/\/[^\s<>'"]+[\w\/=&#?%-])\)/gi,
    (_m, label, url) => {
      const isApp = isAppSchemeUrl(url);
      const targetAttr = isApp ? ' target="_top"' : ' target="_blank" rel="noopener noreferrer"';
      return `<a href="${url}"${targetAttr} class="text-blue-600 underline hover:text-blue-800 break-all cursor-pointer font-medium">${label}</a>`;
    }
  );

  // 5. Convert markdown bullet lines: "- Item" or "• Item" into unordered lists if not already HTML
  const isRichHtml = /<\/?(p|div|ul|ol|li|table|h[1-6]|blockquote)/i.test(html);
  if (!isRichHtml) {
    const lines = html.split(/\r?\n/);
    const convertedLines: string[] = [];
    let inList = false;

    for (const line of lines) {
      const trimmed = line.trim();
      const bulletMatch = trimmed.match(/^[-*•]\s+(.*)$/);
      if (bulletMatch) {
        if (!inList) {
          convertedLines.push('<ul class="list-disc pl-5 my-1.5 space-y-0.5">');
          inList = true;
        }
        convertedLines.push(`<li>${bulletMatch[1]}</li>`);
      } else {
        if (inList) {
          convertedLines.push('</ul>');
          inList = false;
        }
        if (trimmed) {
          convertedLines.push(`<p>${trimmed}</p>`);
        } else {
          convertedLines.push('<p><br></p>');
        }
      }
    }
    if (inList) {
      convertedLines.push('</ul>');
    }
    html = convertedLines.join('');
  }

  // 6. Auto-link any bare URLs (upnote://, marginnote4app://, https://)
  html = autoLinkUrls(html);

  return html;
}

export const HtmlWysiwygEditor: React.FC<HtmlWysiwygEditorProps> = ({
  value,
  onChange,
  placeholder = 'Type details here... Format with bold, underline, lists or links.',
  minHeight = '110px',
  className = '',
  id,
  autoFocus = false,
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const [showLinkModal, setShowLinkModal] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkText, setLinkText] = useState('');
  const savedSelectionRef = useRef<Range | null>(null);

  // Initialize or update editor content
  useEffect(() => {
    if (!editorRef.current) return;
    const currentHtml = editorRef.current.innerHTML;
    const targetHtml = normalizeToEditableHtml(value);

    // Only update if meaningfully different to avoid killing cursor selection
    if (currentHtml !== targetHtml && (!currentHtml || currentHtml === '<p><br></p>' || value !== currentHtml)) {
      // If target is empty, set empty string
      if (!targetHtml.trim()) {
        editorRef.current.innerHTML = '';
      } else {
        editorRef.current.innerHTML = targetHtml;
      }
    }
  }, [value]);

  // Focus on mount if autoFocus
  useEffect(() => {
    if (autoFocus && editorRef.current) {
      editorRef.current.focus();
    }
  }, [autoFocus]);

  // Save current selection for toolbar actions
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current) {
      const range = sel.getRangeAt(0);
      if (editorRef.current.contains(range.commonAncestorContainer)) {
        savedSelectionRef.current = range.cloneRange();
      }
    }
  };

  const restoreSelection = () => {
    if (!savedSelectionRef.current) return;
    const sel = window.getSelection();
    if (sel) {
      sel.removeAllRanges();
      sel.addRange(savedSelectionRef.current);
    }
  };

  // Handle emitting changes to parent
  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    let html = editorRef.current.innerHTML;

    // Treat empty states as empty string
    const textContent = editorRef.current.textContent?.trim() || '';
    if (!textContent && !html.includes('<img') && !html.includes('<table')) {
      html = '';
    }

    onChange(html);
  }, [onChange]);

  // Execute formatting command via document.execCommand
  const executeFormat = (command: string, arg: string | undefined = undefined) => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();
    document.execCommand(command, false, arg);
    saveSelection();
    emitChange();
  };

  // Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+U)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        executeFormat('bold');
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        executeFormat('italic');
      } else if (e.key === 'u' || e.key === 'U') {
        e.preventDefault();
        executeFormat('underline');
      } else if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        openLinkDialog();
      }
    }
  };

  // Open link dialog
  const openLinkDialog = () => {
    saveSelection();
    const sel = window.getSelection();
    const selectedText = sel ? sel.toString().trim() : '';
    setLinkText(selectedText);
    setLinkUrl('');
    setShowLinkModal(true);
  };

  // Insert link
  const handleInsertLink = (e: React.FormEvent) => {
    e.preventDefault();
    if (!linkUrl.trim()) {
      setShowLinkModal(false);
      return;
    }

    let url = linkUrl.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://') && !isAppSchemeUrl(url)) {
      url = 'https://' + url;
    }

    const isApp = isAppSchemeUrl(url);
    const displayText = linkText.trim() || url;
    const targetAttr = isApp ? ' target="_top"' : ' target="_blank" rel="noopener noreferrer"';
    const linkHtml = `<a href="${url}"${targetAttr} class="text-blue-600 underline hover:text-blue-800 break-all cursor-pointer font-medium">${displayText}</a>`;

    if (!editorRef.current) return;
    editorRef.current.focus();
    restoreSelection();

    // Insert HTML link
    if (document.queryCommandSupported('insertHTML')) {
      document.execCommand('insertHTML', false, linkHtml);
    } else {
      document.execCommand('createLink', false, url);
    }

    setShowLinkModal(false);
    setLinkUrl('');
    setLinkText('');
    emitChange();
  };

  // Click delegation for opening app scheme links inside editor
  const handleContainerClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const anchor = (e.target as HTMLElement).closest('a');
    if (anchor) {
      const href = anchor.getAttribute('href');
      if (href && isAppSchemeUrl(href)) {
        e.stopPropagation();
        openAppScheme(href);
      }
    }
  };

  // Auto-link bare URLs on paste
  const handlePaste = (e: React.ClipboardEvent<HTMLDivElement>) => {
    const text = e.clipboardData.getData('text/plain');
    if (!text) return;

    // Check if pasted text contains an app scheme or web URL
    if (/((?:https?|upnote|marginnote\w*|obsidian|notion|craftdocs|bear|things|onenote):\/\/[^\s]+)/i.test(text)) {
      e.preventDefault();
      const linked = autoLinkUrls(text.replace(/\r?\n/g, '<br>'));
      document.execCommand('insertHTML', false, linked);
      emitChange();
    }
  };

  return (
    <div
      className={`rounded-xl border border-slate-200 overflow-hidden bg-white focus-within:border-slate-800 focus-within:ring-1 focus-within:ring-slate-800 transition-all ${className}`}
    >
      {/* Compact Formatting Toolbar */}
      <div className="bg-slate-50/90 border-b border-slate-200 px-2 py-1.5 flex items-center justify-between gap-1 text-slate-700 text-xs">
        <div className="flex items-center gap-1 flex-wrap">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('bold')}
            title="Bold (Ctrl+B)"
            className="p-1.5 hover:text-slate-950 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-slate-700 font-bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('italic')}
            title="Italic (Ctrl+I)"
            className="p-1.5 hover:text-slate-950 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-slate-700 italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('underline')}
            title="Underline (Ctrl+U)"
            className="p-1.5 hover:text-slate-950 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-slate-700 underline"
          >
            <Underline className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('insertUnorderedList')}
            title="Bullet list"
            className="p-1.5 hover:text-slate-950 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-slate-700"
          >
            <List className="w-3.5 h-3.5" />
          </button>

          <div className="h-4 w-px bg-slate-300 mx-0.5" />

          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={openLinkDialog}
            title="Add Link / App Link"
            className="flex items-center gap-1 px-2 py-1 hover:text-slate-950 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer text-xs font-semibold text-slate-700"
          >
            <Link2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Link</span>
          </button>
        </div>

        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeFormat('removeFormat')}
          title="Clear formatting"
          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
        >
          <RemoveFormatting className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Inline WYSIWYG ContentEditable Canvas */}
      <div
        id={id}
        ref={editorRef}
        contentEditable={true}
        suppressContentEditableWarning={true}
        onInput={emitChange}
        onBlur={emitChange}
        onKeyDown={handleKeyDown}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onTouchEnd={saveSelection}
        onSelect={saveSelection}
        onClick={handleContainerClick}
        onPaste={handlePaste}
        data-placeholder={placeholder}
        style={{ minHeight }}
        className="w-full p-3 text-xs sm:text-sm text-slate-800 placeholder:text-slate-400 outline-none leading-relaxed overflow-x-auto break-words empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none [&_b]:font-bold [&_b]:text-slate-900 [&_strong]:font-bold [&_strong]:text-slate-900 [&_u]:underline [&_i]:italic [&_em]:italic [&_del]:line-through [&_a]:text-blue-600 [&_a]:underline [&_a]:hover:text-blue-800 [&_a]:font-medium [&_a]:break-all [&_a]:cursor-pointer [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1.5 [&_ul]:space-y-0.5 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1.5 [&_p]:mb-1.5 [&_p:last-child]:mb-0"
      />

      {/* Link Insertion Modal */}
      {showLinkModal && (
        <div className="fixed inset-0 z-70 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
              <h4 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                <Link2 className="w-4 h-4 text-blue-600" />
                <span>Insert Link / App Link</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowLinkModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleInsertLink} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Link Text
                </label>
                <input
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Optional display text (e.g. My UpNote Note)"
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:bg-white focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  URL or Native App Scheme *
                </label>
                <input
                  type="text"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="upnote://..., marginnote4app://..., https://..."
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:bg-white focus:border-blue-600 font-mono"
                  required
                  autoFocus
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Supports UpNote, MarginNote, Obsidian, and standard web links.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowLinkModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex items-center gap-1 px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Insert Link</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
