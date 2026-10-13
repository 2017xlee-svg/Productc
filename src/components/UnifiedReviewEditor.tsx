import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  X,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  Table as TableIcon,
  Image as ImageIcon,
  Link2,
  Palette,
  Highlighter,
  Trash2,
  Check,
  Save,
  Star,
  Quote,
  RemoveFormatting,
  Loader2,
  HelpCircle,
  ExternalLink,
  Plus,
  Minus,
  Rows,
  Columns,
  ChevronDown,
  Sparkles,
  FileCode,
  CheckCircle2,
} from 'lucide-react';
import { Attachment, Product, UserReview } from '../types';
import {
  createAttachmentFromFile,
  createAttachmentFromUrl,
  registerActiveObjectUrl,
  getCachedObjectUrl,
} from '../utils/imageCompressor';
import { saveMediaBlob, getMediaBlob } from '../lib/indexedDbMedia';
import {
  getProductImage,
  getFallbackImage,
  getAttachmentDisplayUrl,
  normalizeMediaUrl,
} from '../utils/imageFallback';
import { tsvToMarkdownTable, tsvToHtmlTable, dataURLtoFile } from '../utils/upnoteParser';
import { parseHtmlReviewFile } from '../utils/htmlReviewParser';
import { getCleanProductDisplayName, sortProductsByName } from '../utils/productUtils';

interface UnifiedReviewEditorProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  initialReview?: UserReview | null;
  initialProductId?: string;
  onSave: (reviewData: Partial<UserReview> & { productId?: string; title?: string }) => Promise<void>;
  onDelete?: (reviewId: string) => Promise<void>;
}

// UpNote-style text color palette
const COLOR_PALETTE = [
  { label: 'Default', value: '#1e293b', bg: 'bg-slate-800' },
  { label: 'Red', value: '#dc2626', bg: 'bg-red-600' },
  { label: 'Orange', value: '#ea580c', bg: 'bg-orange-600' },
  { label: 'Amber', value: '#d97706', bg: 'bg-amber-600' },
  { label: 'Green', value: '#16a34a', bg: 'bg-green-600' },
  { label: 'Teal', value: '#0d9488', bg: 'bg-teal-600' },
  { label: 'Blue', value: '#2563eb', bg: 'bg-blue-600' },
  { label: 'Indigo', value: '#4f46e5', bg: 'bg-indigo-600' },
  { label: 'Purple', value: '#9333ea', bg: 'bg-purple-600' },
  { label: 'Pink', value: '#db2777', bg: 'bg-pink-600' },
];

// UpNote-style background highlighter palette
const HIGHLIGHT_PALETTE = [
  { label: 'None', value: 'transparent', bg: 'bg-transparent border border-slate-300' },
  { label: 'Yellow', value: '#fef08a', bg: 'bg-yellow-200' },
  { label: 'Green', value: '#bbf7d0', bg: 'bg-green-200' },
  { label: 'Cyan', value: '#a5f3fc', bg: 'bg-cyan-200' },
  { label: 'Blue', value: '#bfdbfe', bg: 'bg-blue-200' },
  { label: 'Purple', value: '#e9d5ff', bg: 'bg-purple-200' },
  { label: 'Pink', value: '#fbcfe8', bg: 'bg-pink-200' },
  { label: 'Orange', value: '#fed7aa', bg: 'bg-orange-200' },
  { label: 'Gray', value: '#e2e8f0', bg: 'bg-slate-200' },
];

/**
 * Converts initial text or markdown to editable HTML for the contentEditable element.
 * If already rich HTML, it returns it cleanly without double-wrapping.
 */
function markdownToEditableHtml(body: string): string {
  if (!body) return '<p><br></p>';

  // Check if body is already rich HTML
  if (
    /<\/?(p|div|h[1-6]|table|ul|ol|li|img|figure|blockquote|span|b|i|u|strong|em|mark|del)[\s>]/i.test(body) ||
    (body.includes('<') && body.includes('>') && (body.includes('</') || body.includes('/>')))
  ) {
    return body;
  }

  let html = body;

  // Process markdown tables into HTML tables first
  const lines = html.split('\n');
  const processedLines: string[] = [];
  let inTable = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('|') && line.trim().endsWith('|')) {
      inTable = true;
      tableRows.push(line);
    } else {
      if (inTable && tableRows.length > 0) {
        processedLines.push(convertMarkdownTableLinesToHtml(tableRows));
        tableRows = [];
        inTable = false;
      }
      processedLines.push(line);
    }
  }
  if (inTable && tableRows.length > 0) {
    processedLines.push(convertMarkdownTableLinesToHtml(tableRows));
  }
  html = processedLines.join('\n');

  // Headings
  html = html.replace(/^### (.*$)/gim, '<h3>$1</h3>');
  html = html.replace(/^## (.*$)/gim, '<h2>$1</h2>');
  html = html.replace(/^# (.*$)/gim, '<h1>$1</h1>');

  // Blockquotes
  html = html.replace(/^\> (.*$)/gim, '<blockquote>$1</blockquote>');

  // Bold & Italic
  html = html.replace(/\*\*\*(.*?)\*\*\*/gim, '<strong><em>$1</em></strong>');
  html = html.replace(/\*\*(.*?)\*\*/gim, '<strong>$1</strong>');
  html = html.replace(/\*(.*?)\*/gim, '<em>$1</em>');
  html = html.replace(/~~(.*?)~~/gim, '<del>$1</del>');

  // Highlights ==text==
  html = html.replace(/==(.*?)==/gim, '<mark style="background-color: #fef08a; padding: 2px 4px; border-radius: 4px;">$1</mark>');

  // Markdown images ![alt](url)
  html = html.replace(
    /!\[(.*?)\]\((.*?)\)/gim,
    '<figure class="my-4 max-w-2xl"><img src="$2" alt="$1" class="w-full rounded-2xl border border-slate-200 shadow-2xs object-cover" /><figcaption class="text-xs text-slate-500 mt-1 font-medium italic">$1</figcaption></figure>'
  );

  // Unordered list items
  html = html.replace(/^\- (.*$)/gim, '<ul><li>$1</li></ul>');
  html = html.replace(/<\/ul>\s?<ul>/gim, '');

  // Wrap loose paragraphs
  const blocks = html.split(/\n{2,}/);
  html = blocks
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return '';
      if (/^<(h[1-6]|table|blockquote|ul|ol|figure|div)/i.test(trimmed)) {
        return trimmed;
      }
      return `<p>${trimmed.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');

  return html || '<p><br></p>';
}

function convertMarkdownTableLinesToHtml(tableLines: string[]): string {
  if (tableLines.length < 2) return tableLines.join('\n');
  const rows = tableLines.filter((l) => !/^[\|\s\-:]+$/.test(l));
  if (rows.length === 0) return '';

  let html = '<table class="w-full my-4 border-collapse border border-slate-300 text-sm"><thead><tr>';
  const headerCells = rows[0].split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
  headerCells.forEach((cell) => {
    html += `<th class="border border-slate-300 px-3 py-2 bg-slate-100 font-bold text-slate-800 text-left">${cell}</th>`;
  });
  html += '</tr></thead><tbody>';

  for (let r = 1; r < rows.length; r++) {
    html += '<tr>';
    const cells = rows[r].split('|').map((c) => c.trim()).filter((_, idx, arr) => idx > 0 && idx < arr.length - 1);
    cells.forEach((cell) => {
      html += `<td class="border border-slate-300 px-3 py-2 text-slate-700">${cell}</td>`;
    });
    html += '</tr>';
  }
  html += '</tbody></table><p><br></p>';
  return html;
}

export const UnifiedReviewEditor: React.FC<UnifiedReviewEditorProps> = ({
  isOpen,
  onClose,
  products,
  initialReview,
  initialProductId,
  onSave,
  onDelete,
}) => {
  const safeProducts = Array.isArray(products) ? products : [];
  const sortedProducts = useMemo(() => sortProductsByName(safeProducts), [safeProducts]);
  const [selectedProductId, setSelectedProductId] = useState<string>(
    initialReview?.productIds?.[0] || initialProductId || safeProducts[0]?.id || ''
  );
  const [reviewTitle, setReviewTitle] = useState<string>(
    initialReview?.title || ''
  );
  const [authorName, setAuthorName] = useState<string>(
    initialReview?.authorName || 'Verified Reviewer'
  );
  const [rating, setRating] = useState<number>(initialReview?.rating || 5);
  const [pictures, setPictures] = useState<Attachment[]>(initialReview?.pictures || []);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorNotice, setErrorNotice] = useState<string | null>(null);

  // Table controls
  const [isInsideTable, setIsInsideTable] = useState(false);
  const [showTableMenu, setShowTableMenu] = useState(false);

  // Popover toggles
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [showHighlightPicker, setShowHighlightPicker] = useState(false);
  const [dropdownCoords, setDropdownCoords] = useState<{ top: number; left: number } | null>(null);
  const [showImageUrlModal, setShowImageUrlModal] = useState(false);
  const [directImageUrl, setDirectImageUrl] = useState('');
  const [imageCaption, setImageCaption] = useState('');

  const editorRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const htmlFileInputRef = useRef<HTMLInputElement>(null);
  const [isImportingHtml, setIsImportingHtml] = useState(false);
  const [importNotice, setImportNotice] = useState<string | null>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const lastActiveTableCellRef = useRef<HTMLTableCellElement | null>(null);
  const lastActiveTableRef = useRef<HTMLTableElement | null>(null);

  const closeAllDropdowns = () => {
    setShowColorPicker(false);
    setShowHighlightPicker(false);
    setShowTableMenu(false);
    setDropdownCoords(null);
  };

  const toggleDropdown = (
    type: 'color' | 'highlight' | 'table',
    e: React.MouseEvent<HTMLElement>
  ) => {
    e.preventDefault();
    e.stopPropagation();
    saveSelection();

    if (type === 'color' && showColorPicker) {
      closeAllDropdowns();
      return;
    }
    if (type === 'highlight' && showHighlightPicker) {
      closeAllDropdowns();
      return;
    }
    if (type === 'table' && showTableMenu) {
      closeAllDropdowns();
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const menuWidth = type === 'table' ? 260 : type === 'highlight' ? 240 : 210;
    const left = Math.max(10, Math.min(window.innerWidth - menuWidth - 10, rect.left));
    const top = rect.bottom + 6;

    setDropdownCoords({ top, left });
    setShowColorPicker(type === 'color');
    setShowHighlightPicker(type === 'highlight');
    setShowTableMenu(type === 'table');
  };

  // Initialize editor content once mounted or when initialReview/isOpen changes
  useEffect(() => {
    if (editorRef.current && isOpen) {
      const initialHtml = markdownToEditableHtml(initialReview?.body || '');
      editorRef.current.innerHTML = initialHtml;

      // Rehydrate/resolve any images inside the editable area
      const imgs = Array.from(editorRef.current.querySelectorAll('img'));
      imgs.forEach(async (img) => {
        const attId = img.getAttribute('data-attachment-id') || img.getAttribute('data-attachment-token') || '';
        const rawSrc = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || 'Review image';

        // 1. Google Drive link conversion
        const normalized = normalizeMediaUrl(rawSrc);
        if (normalized !== rawSrc && normalized.startsWith('https://')) {
          img.src = normalized;
          return;
        }

        // 2. Resolve via attachment ID from memory or IndexedDB
        const targetId = attId || (rawSrc.startsWith('att_') ? rawSrc : '');
        if (targetId) {
          const cached = getCachedObjectUrl(targetId);
          if (cached) {
            img.src = cached;
            return;
          }
          try {
            const blob = await getMediaBlob(targetId);
            if (blob) {
              const objUrl = URL.createObjectURL(blob);
              registerActiveObjectUrl(targetId, objUrl);
              img.src = objUrl;
              return;
            }
          } catch {
            // ignore
          }
        }

        // 3. Match from initialReview.pictures
        if (initialReview?.pictures) {
          const matched = initialReview.pictures.find(
            (p) => p.id === targetId || (p.url && p.url === rawSrc) || (p.name && p.name === alt)
          );
          if (matched?.id) {
            const cached = getCachedObjectUrl(matched.id);
            if (cached) {
              img.src = cached;
              return;
            }
            try {
              const blob = await getMediaBlob(matched.id);
              if (blob) {
                const objUrl = URL.createObjectURL(blob);
                registerActiveObjectUrl(matched.id, objUrl);
                img.src = objUrl;
                return;
              }
            } catch {
              // ignore
            }
          }
        }
      });
    }
  }, [initialReview?.id, isOpen]);

  // Synchronize state when editor is opened or product/review changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialReview?.productIds?.[0]) {
      setSelectedProductId(initialReview.productIds[0]);
    } else if (initialProductId) {
      setSelectedProductId(initialProductId);
    } else if (safeProducts.length > 0) {
      setSelectedProductId((prev) => prev || safeProducts[0].id);
    }

    if (initialReview) {
      setReviewTitle(initialReview.title || '');
      setAuthorName(initialReview.authorName || 'Verified Reviewer');
      setRating(initialReview.rating || 5);
      setPictures(Array.isArray(initialReview.pictures) ? [...initialReview.pictures] : []);
    } else {
      setReviewTitle('');
      setAuthorName('Verified Reviewer');
      setRating(5);
      setPictures([]);
      if (editorRef.current) {
        editorRef.current.innerHTML = '<p><br></p>';
      }
    }
  }, [isOpen, initialReview?.id, initialProductId]);

  // Save current text selection range and detect table context
  const saveSelection = () => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      savedSelectionRef.current = sel.getRangeAt(0).cloneRange();
      let node: Node | null = sel.anchorNode;
      if (node && node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }
      const cell = (node as HTMLElement)?.closest('td, th') as HTMLTableCellElement | null;
      if (cell) {
        lastActiveTableCellRef.current = cell;
        lastActiveTableRef.current = cell.closest('table');
        setIsInsideTable(true);
      } else {
        const tableEl = (node as HTMLElement)?.closest('table');
        if (tableEl) {
          lastActiveTableRef.current = tableEl;
          setIsInsideTable(true);
        } else {
          setIsInsideTable(false);
        }
      }
    }
  };

  if (!isOpen) return null;

  // Restore selection and ensure focus on the editor
  const restoreSelection = () => {
    if (!editorRef.current) return;
    editorRef.current.focus();
    const sel = window.getSelection();
    if (!sel) return;

    if (savedSelectionRef.current && editorRef.current.contains(savedSelectionRef.current.commonAncestorContainer)) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedSelectionRef.current);
        return;
      } catch {
        // ignore
      }
    }

    // If no valid saved range, ensure cursor is at the end of editor
    if (sel.rangeCount === 0 || !editorRef.current.contains(sel.anchorNode)) {
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      savedSelectionRef.current = range.cloneRange();
    }
  };

  // Execute standard formatting commands (bold, italic, underline, lists, etc.)
  const executeFormat = (command: string, value: string = '') => {
    restoreSelection();
    document.execCommand(command, false, value);
    saveSelection();
  };

  // Insert Heading reliably across all browsers with CSS-boosted tags
  const formatHeading = (tag: 'h1' | 'h2' | 'h3' | 'p') => {
    restoreSelection();
    const sel = window.getSelection();
    if (!sel || !editorRef.current) return;

    // If editor has no text, insert heading directly
    if (!editorRef.current.textContent?.trim()) {
      editorRef.current.innerHTML = `<${tag}>Heading</${tag}><p><br></p>`;
      const target = editorRef.current.querySelector(tag);
      if (target) {
        const r = document.createRange();
        r.selectNodeContents(target);
        sel.removeAllRanges();
        sel.addRange(r);
        savedSelectionRef.current = r.cloneRange();
      }
      saveSelection();
      return;
    }

    // Attempt browser formatBlock
    const tagUpper = tag.toUpperCase();
    let applied = false;
    try {
      applied = document.execCommand('formatBlock', false, `<${tagUpper}>`);
    } catch {
      // ignore
    }
    if (!applied) {
      try {
        applied = document.execCommand('formatBlock', false, tagUpper);
      } catch {
        // ignore
      }
    }
    if (!applied) {
      try {
        applied = document.execCommand('formatBlock', false, tag.toLowerCase());
      } catch {
        // ignore
      }
    }

    // Direct DOM fallback if formatBlock fails
    if (!applied || tag !== 'p') {
      if (sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        let node: Node | null = range.commonAncestorContainer;
        if (node.nodeType === Node.TEXT_NODE) {
          node = node.parentElement;
        }

        let block: HTMLElement | null = node as HTMLElement | null;
        while (
          block &&
          block.parentElement &&
          block.parentElement !== editorRef.current &&
          !['TD', 'TH'].includes(block.parentElement.tagName)
        ) {
          block = block.parentElement;
        }

        if (block && block !== editorRef.current && block.parentNode) {
          if (block.tagName.toLowerCase() !== tag.toLowerCase()) {
            const newEl = document.createElement(tag);
            newEl.innerHTML = block.innerHTML || '<br>';
            block.parentNode.replaceChild(newEl, block);
            const newRange = document.createRange();
            newRange.selectNodeContents(newEl);
            newRange.collapse(false);
            sel.removeAllRanges();
            sel.addRange(newRange);
            savedSelectionRef.current = newRange.cloneRange();
          }
        } else if (!range.collapsed) {
          const newEl = document.createElement(tag);
          newEl.appendChild(range.extractContents());
          range.insertNode(newEl);
          const newRange = document.createRange();
          newRange.selectNodeContents(newEl);
          newRange.collapse(false);
          sel.removeAllRanges();
          sel.addRange(newRange);
          savedSelectionRef.current = newRange.cloneRange();
        }
      }
    }
    saveSelection();
  };

  // Set text color
  const setTextColor = (color: string) => {
    restoreSelection();
    document.execCommand('foreColor', false, color);
    setShowColorPicker(false);
    saveSelection();
  };

  // Set text highlight color
  const setHighlightColor = (color: string) => {
    restoreSelection();
    if (color === 'transparent') {
      document.execCommand('removeFormat', false);
    } else {
      if (!document.execCommand('hiliteColor', false, color)) {
        document.execCommand('backColor', false, color);
      }
    }
    setShowHighlightPicker(false);
    saveSelection();
  };

  // Insert DOM Node reliably at current cursor position
  const insertNodeAtSelection = (node: Node) => {
    if (!editorRef.current) return;
    restoreSelection();

    // If node is a DocumentFragment, remember its last child before insertion
    // because inserting a DocumentFragment empties it and detaches it from the tree.
    const lastNodeToSelect =
      node.nodeType === Node.DOCUMENT_FRAGMENT_NODE ? node.lastChild : node;

    let range: Range | null = null;
    const sel = window.getSelection();

    if (savedSelectionRef.current && editorRef.current.contains(savedSelectionRef.current.commonAncestorContainer)) {
      range = savedSelectionRef.current;
    } else if (sel && sel.rangeCount > 0 && editorRef.current.contains(sel.anchorNode)) {
      range = sel.getRangeAt(0);
    }

    if (range && editorRef.current.contains(range.commonAncestorContainer)) {
      try {
        range.deleteContents();
        range.insertNode(node);

        const targetNode = lastNodeToSelect && lastNodeToSelect.parentNode ? lastNodeToSelect : null;
        if (targetNode) {
          const newRange = document.createRange();
          newRange.setStartAfter(targetNode);
          newRange.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(newRange);
          savedSelectionRef.current = newRange.cloneRange();
        }
      } catch {
        // Fallback for restricted ancestor tags
        editorRef.current.appendChild(node);
        const newRange = document.createRange();
        newRange.selectNodeContents(editorRef.current);
        newRange.collapse(false);
        sel?.removeAllRanges();
        sel?.addRange(newRange);
        savedSelectionRef.current = newRange.cloneRange();
      }
    } else {
      editorRef.current.appendChild(node);
      const newRange = document.createRange();
      newRange.selectNodeContents(editorRef.current);
      newRange.collapse(false);
      sel?.removeAllRanges();
      sel?.addRange(newRange);
      savedSelectionRef.current = newRange.cloneRange();
    }
    saveSelection();
  };

  // Insert HTML string at current cursor position
  const insertHtmlAtSelection = (html: string) => {
    const temp = document.createElement('div');
    temp.innerHTML = html;
    const frag = document.createDocumentFragment();
    let child: Node | null;
    let lastChild: Node | null = null;
    while ((child = temp.firstChild)) {
      lastChild = frag.appendChild(child);
    }
    if (lastChild) {
      insertNodeAtSelection(frag);
    }
  };

  // Table context detection with multiple reliable fallbacks
  const getTableContext = () => {
    // 1. Try active DOM selection
    const sel = window.getSelection();
    let node: Node | null = null;
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      node = sel.anchorNode;
    } else if (savedSelectionRef.current && editorRef.current?.contains(savedSelectionRef.current.commonAncestorContainer)) {
      node = savedSelectionRef.current.commonAncestorContainer;
    }

    if (node) {
      if (node.nodeType === Node.TEXT_NODE) {
        node = node.parentElement;
      }
      const cell = (node as HTMLElement)?.closest('td, th') as HTMLTableCellElement | null;
      if (cell) {
        lastActiveTableCellRef.current = cell;
        lastActiveTableRef.current = cell.closest('table');
        const row = cell.closest('tr') as HTMLTableRowElement | null;
        const table = cell.closest('table') as HTMLTableElement | null;
        if (table && row) {
          const colIndex = Array.from(row.children).indexOf(cell);
          const rowIndex = Array.from(row.parentElement?.children || []).indexOf(row);
          return { cell, row, table, colIndex, rowIndex };
        }
      }
    }

    // 2. Try last active table cell ref
    if (lastActiveTableCellRef.current && editorRef.current?.contains(lastActiveTableCellRef.current)) {
      const cell = lastActiveTableCellRef.current;
      const row = cell.closest('tr') as HTMLTableRowElement | null;
      const table = cell.closest('table') as HTMLTableElement | null;
      if (table && row) {
        const colIndex = Array.from(row.children).indexOf(cell);
        const rowIndex = Array.from(row.parentElement?.children || []).indexOf(row);
        return { cell, row, table, colIndex, rowIndex };
      }
    }

    // 3. Fallback to any table present in the editor
    if (editorRef.current) {
      const allTables = editorRef.current.querySelectorAll('table');
      if (allTables.length > 0) {
        const table = allTables[allTables.length - 1];
        const rows = table.querySelectorAll('tr');
        if (rows.length > 0) {
          const row = rows[rows.length - 1];
          const cells = row.querySelectorAll('td, th');
          const cell = (cells[cells.length - 1] || null) as HTMLTableCellElement | null;
          if (cell) {
            return {
              cell,
              row,
              table,
              colIndex: Math.max(0, Array.from(row.children).indexOf(cell)),
              rowIndex: Math.max(0, Array.from(row.parentElement?.children || []).indexOf(row)),
            };
          }
        }
      }
    }

    return null;
  };

  // Insert Comparison Table at cursor
  const insertTable = () => {
    const tableHtml = `
      <table class="w-full my-4 border-collapse border border-slate-300 text-sm">
        <thead>
          <tr>
            <th class="border border-slate-300 px-3 py-2 bg-slate-100 font-bold text-slate-800 text-left">Feature / Aspect</th>
            <th class="border border-slate-300 px-3 py-2 bg-slate-100 font-bold text-slate-800 text-left">Real-world Testing</th>
            <th class="border border-slate-300 px-3 py-2 bg-slate-100 font-bold text-slate-800 text-left">Verdict</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td class="border border-slate-300 px-3 py-2 text-slate-700">Display & Brightness</td>
            <td class="border border-slate-300 px-3 py-2 text-slate-700">Crisp, vibrant outdoors under direct sun</td>
            <td class="border border-slate-300 px-3 py-2 text-slate-700">5 / 5 ★</td>
          </tr>
          <tr>
            <td class="border border-slate-300 px-3 py-2 text-slate-700">Battery Endurance</td>
            <td class="border border-slate-300 px-3 py-2 text-slate-700">Easily lasts full day with 7+ hrs SOT</td>
            <td class="border border-slate-300 px-3 py-2 text-slate-700">4.5 / 5 ★</td>
          </tr>
        </tbody>
      </table>
      <p><br></p>
    `;
    insertHtmlAtSelection(tableHtml);
    setIsInsideTable(true);
    setShowTableMenu(false);
  };

  // Add Table Row (above or below)
  const handleAddRow = (direction: 'above' | 'below' = 'below') => {
    const ctx = getTableContext();
    let table: HTMLTableElement | null = ctx?.table || null;
    let targetRow: HTMLTableRowElement | null = ctx?.row || null;

    if (!table && editorRef.current) {
      const allTables = editorRef.current.querySelectorAll('table');
      if (allTables.length > 0) {
        table = allTables[allTables.length - 1];
        const rows = table.querySelectorAll('tr');
        targetRow = rows[rows.length - 1];
      }
    }

    if (!table) {
      insertTable();
      return;
    }

    const refRow = targetRow || table.querySelector('tr');
    const colCount = refRow ? refRow.children.length : 3;

    const newRow = document.createElement('tr');
    for (let i = 0; i < colCount; i++) {
      const td = document.createElement('td');
      td.className = 'border border-slate-300 px-3 py-2 text-slate-700';
      td.innerHTML = '<br>';
      newRow.appendChild(td);
    }

    if (targetRow && direction === 'above') {
      targetRow.parentNode?.insertBefore(newRow, targetRow);
    } else if (targetRow) {
      targetRow.parentNode?.insertBefore(newRow, targetRow.nextSibling);
    } else {
      const tbody = table.querySelector('tbody') || table;
      tbody.appendChild(newRow);
    }

    const firstCell = newRow.querySelector('td');
    if (firstCell) {
      const range = document.createRange();
      range.selectNodeContents(firstCell);
      range.collapse(true);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      savedSelectionRef.current = range.cloneRange();
    }
    setIsInsideTable(true);
    setShowTableMenu(false);
  };

  // Delete Current Table Row
  const handleDeleteRow = () => {
    const ctx = getTableContext();
    if (!ctx) {
      setErrorNotice('Please place the cursor inside the table row you wish to delete.');
      return;
    }
    const { row, table } = ctx;
    const allRows = table.querySelectorAll('tr');
    if (allRows.length <= 1) {
      table.remove();
      setIsInsideTable(false);
    } else {
      row.remove();
      setIsInsideTable(true);
    }
    saveSelection();
    setShowTableMenu(false);
  };

  // Add Table Column (left or right)
  const handleAddColumn = (direction: 'left' | 'right' = 'right') => {
    const ctx = getTableContext();
    let table: HTMLTableElement | null = ctx?.table || null;
    let colIdx = ctx ? ctx.colIndex : -1;

    if (!table && editorRef.current) {
      const allTables = editorRef.current.querySelectorAll('table');
      if (allTables.length > 0) {
        table = allTables[allTables.length - 1];
        colIdx = (table.querySelector('tr')?.children.length || 1) - 1;
      }
    }

    if (!table) {
      insertTable();
      return;
    }

    const allRows = table.querySelectorAll('tr');
    const insertIdx = direction === 'left' ? Math.max(0, colIdx) : colIdx + 1;

    allRows.forEach((r) => {
      const isHeader = r.parentElement?.tagName === 'THEAD' || r.querySelector('th') !== null;
      const newCell = isHeader ? document.createElement('th') : document.createElement('td');
      if (isHeader) {
        newCell.className = 'border border-slate-300 px-3 py-2 bg-slate-100 font-bold text-slate-800 text-left';
        newCell.textContent = 'Column';
      } else {
        newCell.className = 'border border-slate-300 px-3 py-2 text-slate-700';
        newCell.innerHTML = '<br>';
      }

      const children = Array.from(r.children);
      if (insertIdx >= children.length) {
        r.appendChild(newCell);
      } else {
        r.insertBefore(newCell, children[insertIdx]);
      }
    });

    setIsInsideTable(true);
    saveSelection();
    setShowTableMenu(false);
  };

  // Delete Current Table Column
  const handleDeleteColumn = () => {
    const ctx = getTableContext();
    if (!ctx) {
      setErrorNotice('Please place the cursor inside the column you wish to delete.');
      return;
    }
    const { table, colIndex } = ctx;
    const allRows = table.querySelectorAll('tr');
    const maxCols = allRows[0]?.children.length || 0;
    if (maxCols <= 1) {
      table.remove();
      setIsInsideTable(false);
      saveSelection();
      setShowTableMenu(false);
      return;
    }

    allRows.forEach((r) => {
      const children = Array.from(r.children);
      if (children[colIndex]) {
        children[colIndex].remove();
      }
    });
    setIsInsideTable(true);
    saveSelection();
    setShowTableMenu(false);
  };

  // Delete Entire Table
  const handleDeleteTable = () => {
    const ctx = getTableContext();
    if (ctx) {
      ctx.table.remove();
    } else if (editorRef.current) {
      const allTables = editorRef.current.querySelectorAll('table');
      if (allTables.length > 0) {
        allTables[allTables.length - 1].remove();
      }
    }
    setIsInsideTable(false);
    setShowTableMenu(false);
    saveSelection();
  };

  // Insert Image HTML at exact cursor position
  const insertImageAtCursor = (url: string, name: string = 'Photo', attachmentId?: string) => {
    const figure = document.createElement('figure');
    figure.className = 'my-4 max-w-2xl';

    const img = document.createElement('img');
    img.src = url;
    img.alt = name;
    if (attachmentId) {
      img.setAttribute('data-attachment-id', attachmentId);
    }
    img.className = 'w-full rounded-2xl border border-slate-200 shadow-2xs object-cover';
    img.setAttribute('referrerpolicy', 'no-referrer');

    const figcaption = document.createElement('figcaption');
    figcaption.className = 'text-xs text-slate-500 mt-1 font-medium italic';
    figcaption.textContent = name;

    figure.appendChild(img);
    figure.appendChild(figcaption);

    const nextP = document.createElement('p');
    nextP.innerHTML = '<br>';

    // Check if the current cursor is inside a block element
    restoreSelection();
    let currentBlock: HTMLElement | null = null;
    const sel = window.getSelection();
    let anchor: Node | null = null;
    if (savedSelectionRef.current && editorRef.current?.contains(savedSelectionRef.current.commonAncestorContainer)) {
      anchor = savedSelectionRef.current.commonAncestorContainer;
    } else if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      anchor = sel.anchorNode;
    }

    if (anchor) {
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentElement;
      currentBlock = (anchor as HTMLElement)?.closest('p, div, h1, h2, h3, h4, h5, h6, blockquote');
      if (currentBlock && !editorRef.current?.contains(currentBlock)) {
        currentBlock = null;
      }
    }

    // Clean block insertion: if inside an empty paragraph (<p><br></p>), replace it cleanly
    if (currentBlock && currentBlock !== editorRef.current && currentBlock.parentNode) {
      const text = currentBlock.textContent?.trim() || '';
      if (!text) {
        currentBlock.parentNode.insertBefore(figure, currentBlock);
        currentBlock.parentNode.insertBefore(nextP, currentBlock);
        currentBlock.remove();

        try {
          const newRange = document.createRange();
          newRange.selectNodeContents(nextP);
          newRange.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(newRange);
          savedSelectionRef.current = newRange.cloneRange();
        } catch {
          // ignore
        }
        saveSelection();
        return;
      } else {
        // If block has text, place figure directly after this block
        if (currentBlock.nextSibling) {
          currentBlock.parentNode.insertBefore(figure, currentBlock.nextSibling);
          currentBlock.parentNode.insertBefore(nextP, figure.nextSibling);
        } else {
          currentBlock.parentNode.appendChild(figure);
          currentBlock.parentNode.appendChild(nextP);
        }

        try {
          const newRange = document.createRange();
          newRange.selectNodeContents(nextP);
          newRange.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(newRange);
          savedSelectionRef.current = newRange.cloneRange();
        } catch {
          // ignore
        }
        saveSelection();
        return;
      }
    }

    // Fallback: insert fragment via insertNodeAtSelection
    const wrapper = document.createDocumentFragment();
    wrapper.appendChild(figure);
    wrapper.appendChild(nextP);
    insertNodeAtSelection(wrapper);
  };

  // Handle local file upload
  const handleFileUpload = async (file: File) => {
    setErrorNotice(null);
    try {
      const att = await createAttachmentFromFile(file);
      // Persist raw blob to IndexedDB
      await saveMediaBlob(att.id, file, att.name, att.mimetype);
      setPictures((prev) => {
        if (prev.some((p) => p.id === att.id)) return prev;
        return [...prev, att];
      });
      const displayUrl = att.dataUrl || att.url || URL.createObjectURL(file);
      insertImageAtCursor(displayUrl, att.name, att.id);
    } catch (err: any) {
      console.error('File upload error:', err);
      setErrorNotice(`Failed to upload photo: ${err?.message || 'Unknown error'}`);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Handle HTML Note / Document Import (.html, .htm)
  const handleHtmlImport = async (file: File) => {
    setIsImportingHtml(true);
    setErrorNotice(null);
    setImportNotice(null);
    try {
      const parsed = await parseHtmlReviewFile(file, safeProducts);

      // 1. Update Title if currently empty or default generic
      if (!reviewTitle.trim() || reviewTitle.toLowerCase().includes('in-depth') || reviewTitle === '') {
        setReviewTitle(parsed.title);
      }

      // 2. Update author if extracted
      if (parsed.authorName && (!authorName || authorName === 'Verified Reviewer')) {
        setAuthorName(parsed.authorName);
      }

      // 3. Update product if matched and none selected yet
      if (parsed.matchedProductId && (!selectedProductId || selectedProductId === '')) {
        setSelectedProductId(parsed.matchedProductId);
      }

      // 4. Register extracted pictures
      if (parsed.pictures.length > 0) {
        setPictures((prev) => {
          const newAtts = [...prev];
          for (const p of parsed.pictures) {
            if (!newAtts.some((existing) => existing.id === p.id)) {
              newAtts.push(p);
            }
          }
          return newAtts;
        });
      }

      // 5. Inject HTML into editor canvas
      if (editorRef.current) {
        const currentHtml = editorRef.current.innerHTML.trim();
        if (!currentHtml || currentHtml === '<p><br></p>' || currentHtml === '<p></p>') {
          editorRef.current.innerHTML = parsed.body;
        } else {
          editorRef.current.innerHTML += `<hr class="my-6 border-slate-200" />${parsed.body}`;
        }
      }

      setImportNotice(
        `Imported HTML note "${parsed.title}" (${parsed.tableCount} tables, ${parsed.imageCount} photos, ${parsed.wordCount} words).`
      );
      setTimeout(() => setImportNotice(null), 5000);
    } catch (err: any) {
      console.error('Failed to import HTML file in editor:', err);
      setErrorNotice(`Could not import HTML file: ${err?.message || 'Invalid format'}`);
    } finally {
      setIsImportingHtml(false);
      if (htmlFileInputRef.current) htmlFileInputRef.current.value = '';
    }
  };

  const handleHtmlFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await handleHtmlImport(file);
    }
  };

  // Handle image URL prompt
  const handleInsertImageUrl = async () => {
    if (!directImageUrl.trim()) return;
    try {
      const att = await createAttachmentFromUrl(directImageUrl.trim(), imageCaption.trim() || 'Online Image');
      setPictures((prev) => {
        if (prev.some((p) => p.id === att.id)) return prev;
        return [...prev, att];
      });
      insertImageAtCursor(att.url, imageCaption.trim() || att.name, att.id);
      setDirectImageUrl('');
      setImageCaption('');
      setShowImageUrlModal(false);
    } catch (err: any) {
      setErrorNotice(`Failed to load image URL: ${err?.message || 'Network error'}`);
    }
  };

  // Handle clipboard paste (UpNote / Apple Notes style: text, HTML, tables, and images)
  const handlePaste = async (e: React.ClipboardEvent<HTMLDivElement>) => {
    saveSelection();
    const clipboardData = e.clipboardData;
    if (!clipboardData) return;

    // 1. Direct Image Paste (e.g. copied image or screenshot)
    const items = Array.from(clipboardData.items || []);
    const imageItems = items.filter((item) => item.type.startsWith('image/'));

    if (imageItems.length > 0 && (!clipboardData.getData('text/html') || clipboardData.types.length <= 2)) {
      e.preventDefault();
      for (const item of imageItems) {
        const file = item.getAsFile();
        if (file) {
          await handleFileUpload(file);
        }
      }
      return;
    }

    // 2. Rich HTML Paste (from UpNote, Apple Notes, Google Docs, Notion, Word, Web)
    const htmlData = clipboardData.getData('text/html');
    if (htmlData) {
      e.preventDefault();
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlData, 'text/html');

      // Strip dangerous tags
      doc.querySelectorAll('script, style, meta, link, title, head, applet, iframe').forEach((el) => el.remove());

      // Process all embedded images
      const imgElements = Array.from(doc.querySelectorAll('img'));
      for (let i = 0; i < imgElements.length; i++) {
        const img = imgElements[i];
        const src = img.getAttribute('src') || '';
        const alt = img.getAttribute('alt') || `Pasted_Image_${i + 1}`;

        if (src.startsWith('data:image/')) {
          try {
            const file = dataURLtoFile(src, `${alt}.png`);
            const att = await createAttachmentFromFile(file);
            await saveMediaBlob(att.id, file, att.name, att.mimetype);
            setPictures((prev) => (prev.some((p) => p.id === att.id) ? prev : [...prev, att]));
            const displayUrl = att.dataUrl || att.url || URL.createObjectURL(file);
            img.setAttribute('src', displayUrl);
            img.setAttribute('data-attachment-id', att.id);
          } catch (err) {
            console.warn('Failed to convert pasted image', err);
          }
        } else if (src.startsWith('http://') || src.startsWith('https://')) {
          const attId = `att_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
          const attName = src.split('/').pop()?.split('?')[0] || `Image_${i + 1}.jpg`;
          const att: Attachment = {
            id: attId,
            name: attName,
            url: src,
          };
          setPictures((prev) => (prev.some((p) => p.id === att.id) ? prev : [...prev, att]));
          img.setAttribute('data-attachment-id', attId);
        }
        img.className = 'w-full rounded-2xl border border-slate-200 shadow-2xs object-cover my-4 max-w-2xl';
      }

      // Format tables cleanly
      doc.querySelectorAll('table').forEach((t) => {
        t.className = 'w-full my-4 border-collapse border border-slate-300 text-sm';
        t.querySelectorAll('th').forEach((th) => {
          th.className = 'border border-slate-300 px-3 py-2 bg-slate-100 font-bold text-slate-800 text-left';
        });
        t.querySelectorAll('td').forEach((td) => {
          td.className = 'border border-slate-300 px-3 py-2 text-slate-700';
        });
      });

      // Format headings
      doc.querySelectorAll('h1').forEach((h) => (h.className = 'text-2xl font-black text-slate-900 mt-6 mb-3 pb-2 border-b border-slate-200'));
      doc.querySelectorAll('h2').forEach((h) => (h.className = 'text-xl font-bold text-slate-900 mt-5 mb-2.5'));
      doc.querySelectorAll('h3').forEach((h) => (h.className = 'text-lg font-bold text-slate-900 mt-4 mb-2'));

      insertHtmlAtSelection(doc.body.innerHTML);
      return;
    }

    // 3. Plain Text / TSV Table fallback
    const plainText = clipboardData.getData('text/plain');
    if (plainText) {
      e.preventDefault();
      const tsvRes = tsvToHtmlTable(plainText);
      if (tsvRes.isTable) {
        insertHtmlAtSelection(tsvRes.html);
      } else {
        const html = markdownToEditableHtml(plainText);
        insertHtmlAtSelection(html);
      }
    }
  };

  // Handle Keyboard shortcuts (Ctrl+B, Ctrl+I, Ctrl+U, and Tab inside tables)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Tab') {
      const ctx = getTableContext();
      if (ctx) {
        e.preventDefault();
        const { cell, table } = ctx;
        const allCells = Array.from(table.querySelectorAll('th, td'));
        const currIndex = allCells.indexOf(cell);
        if (e.shiftKey) {
          if (currIndex > 0) {
            const prev = allCells[currIndex - 1] as HTMLElement;
            const range = document.createRange();
            range.selectNodeContents(prev);
            range.collapse(false);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            savedSelectionRef.current = range.cloneRange();
          }
        } else {
          if (currIndex === allCells.length - 1) {
            handleAddRow('below');
          } else if (currIndex >= 0 && currIndex < allCells.length - 1) {
            const next = allCells[currIndex + 1] as HTMLElement;
            const range = document.createRange();
            range.selectNodeContents(next);
            range.collapse(true);
            const sel = window.getSelection();
            sel?.removeAllRanges();
            sel?.addRange(range);
            savedSelectionRef.current = range.cloneRange();
          }
        }
        saveSelection();
        return;
      }
    }

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
      }
    }
  };

  // Handle Save
  const handleSave = async () => {
    if (!selectedProductId) {
      setErrorNotice('Please select a product for this review.');
      return;
    }

    const htmlContent = editorRef.current ? editorRef.current.innerHTML : '';
    const plainText = editorRef.current ? editorRef.current.innerText.trim() : '';

    if (!plainText && !htmlContent.includes('<img')) {
      setErrorNotice('Please write some review thoughts or insert an image.');
      return;
    }

    setIsSaving(true);
    setErrorNotice(null);

    // Scan editor HTML to ensure ONLY images currently in the document are saved
    const activePictures: Attachment[] = [];
    if (editorRef.current) {
      const imgs = Array.from(editorRef.current.querySelectorAll('img'));
      for (let i = 0; i < imgs.length; i++) {
        const img = imgs[i];
        const src = img.getAttribute('src') || '';
        const attId = img.getAttribute('data-attachment-id');
        const alt = img.getAttribute('alt') || `Review Image ${i + 1}`;

        if (!src && !attId) continue;

        // Try to match with existing attachment in current state or initialReview
        const matched =
          (attId ? pictures.find((p) => p.id === attId) : null) ||
          pictures.find((p) => (p.url && p.url === src) || (p.dataUrl && p.dataUrl === src)) ||
          (attId && initialReview?.pictures ? initialReview.pictures.find((p) => p.id === attId) : null) ||
          (initialReview?.pictures
            ? initialReview.pictures.find((p) => (p.url && p.url === src) || (p.dataUrl && p.dataUrl === src))
            : null);

        if (matched) {
          if (!activePictures.some((p) => p.id === matched.id)) {
            activePictures.push(matched);
          }
          if (matched.id && !attId) {
            img.setAttribute('data-attachment-id', matched.id);
          }
        } else if (src.startsWith('data:image/')) {
          const newId = attId || `att_rev_${Date.now()}_${i}`;
          try {
            const file = dataURLtoFile(src, `${alt}.png`);
            await saveMediaBlob(newId, file, `${alt}.png`, file.type);
            const objUrl = URL.createObjectURL(file);
            registerActiveObjectUrl(newId, objUrl);
            const newAtt: Attachment = {
              id: newId,
              name: alt,
              url: objUrl,
            };
            activePictures.push(newAtt);
            img.setAttribute('data-attachment-id', newId);
            img.setAttribute('src', objUrl);
          } catch {
            // ignore
          }
        } else if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('blob:')) {
          const newId = attId || `att_url_${Date.now()}_${i}`;
          const newAtt: Attachment = {
            id: newId,
            name: alt,
            url: src,
          };
          if (!activePictures.some((p) => p.id === newId || (p.url && p.url === src))) {
            activePictures.push(newAtt);
          }
          if (!img.getAttribute('data-attachment-id')) {
            img.setAttribute('data-attachment-id', newId);
          }
        } else if (attId) {
          // Has attachment ID from IndexedDB
          const existingAtt =
            pictures.find((p) => p.id === attId) ||
            initialReview?.pictures?.find((p) => p.id === attId) ||
            {
              id: attId,
              name: alt,
              url: '',
            };
          if (!activePictures.some((p) => p.id === attId)) {
            activePictures.push(existingAtt);
          }
        }
      }
    }
    const finalPictures = [...activePictures];
    // Keep standalone attached pictures user uploaded via gallery
    if (Array.isArray(pictures)) {
      for (const p of pictures) {
        if (p && p.id && !finalPictures.some((ap) => ap.id === p.id)) {
          finalPictures.push(p);
        }
      }
    }

    // Clean body HTML: replace any remaining base64 src attributes with clean reference to prevent saving megabytes of base64 text into review.body
    let cleanSavedBody = editorRef.current ? editorRef.current.innerHTML : htmlContent;
    cleanSavedBody = cleanSavedBody.replace(/src="data:image\/[^"]+"/gi, 'src=""');

    try {
      await onSave({
        id: initialReview?.id,
        title: reviewTitle.trim() || undefined,
        productId: selectedProductId,
        productIds: [selectedProductId],
        productTitles: [selectedProduct?.name || 'Product'],
        body: cleanSavedBody,
        authorName: authorName.trim() || 'Verified Reviewer',
        rating,
        pictures: finalPictures,
      });

      setSaveSuccess(true);
      setTimeout(() => {
        setSaveSuccess(false);
        onClose();
      }, 700);
    } catch (err: any) {
      setErrorNotice(`Save failed: ${err?.message || 'Could not save review'}`);
    } finally {
      setIsSaving(false);
    }
  };

  // Handle Delete
  const handleDelete = async () => {
    if (!initialReview?.id || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsDeleting(true);
    try {
      await onDelete(initialReview.id);
      onClose();
    } catch (err: any) {
      setErrorNotice(`Delete failed: ${err?.message || 'Could not delete review'}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const selectedProduct = safeProducts.find((p) => p.id === selectedProductId);

  return (
    <div
      id="unified-review-editor-screen"
      className="fixed inset-0 z-50 bg-white flex flex-col overflow-hidden w-full h-full max-w-full"
    >
      {/* Hidden File Input for Device Image Uploads */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* Hidden File Input for HTML Note Import */}
      <input
        type="file"
        ref={htmlFileInputRef}
        onChange={handleHtmlFileInputChange}
        accept=".html,.htm"
        className="hidden"
      />

      {/* 1. Header: Product selector, Rating, Author, and Action buttons */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 pt-safe flex items-center justify-between gap-3 shrink-0 shadow-2xs z-20">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
            title="Close editor (Esc)"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Editor Header Info (Clean, single-line, not doubled with body) */}
          <div className="min-w-0">
            <h1 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
              {initialReview ? `Edit Review #${initialReview.reviewNumber || ''}` : 'Write New Review'}
            </h1>
            <p className="text-[11px] text-slate-500 truncate">
              {selectedProduct ? getCleanProductDisplayName(selectedProduct) : 'Product Review'}
            </p>
          </div>

          {/* Star Rating Controls */}
          <div className="hidden sm:flex items-center gap-1 pl-3 border-l border-slate-200">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="p-1 text-slate-300 hover:text-amber-400 transition-colors cursor-pointer"
                title={`${star} Stars`}
              >
                <Star
                  className={`w-4 h-4 ${
                    star <= rating ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        {/* Right Header Actions */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Delete Review (if editing existing) */}
          {initialReview && onDelete && (
            <button
              id="editor-delete-btn"
              type="button"
              onClick={handleDelete}
              disabled={isDeleting}
              className={`p-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                confirmDelete
                  ? 'bg-rose-600 text-white font-bold px-2.5'
                  : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
              }`}
              title={confirmDelete ? 'Click to confirm delete' : 'Delete review'}
            >
              {confirmDelete ? 'Confirm' : <Trash2 className="w-4 h-4" />}
            </button>
          )}

          {/* Import HTML Note Button */}
          <button
            id="editor-import-html-btn"
            type="button"
            onClick={() => {
              saveSelection();
              if (htmlFileInputRef.current) htmlFileInputRef.current.click();
            }}
            disabled={isImportingHtml}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 text-xs font-bold transition-all cursor-pointer shadow-2xs shrink-0 disabled:opacity-50"
            title="Import note or report from an HTML file (.html / .htm)"
          >
            {isImportingHtml ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <FileCode className="w-3.5 h-3.5 text-indigo-600" />
            )}
            <span className="hidden xs:inline">{isImportingHtml ? 'Importing...' : 'Import HTML'}</span>
          </button>

          {/* Save Review Button */}
          <button
            id="editor-save-btn"
            type="button"
            onClick={handleSave}
            disabled={isSaving || saveSuccess}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs sm:text-sm font-bold shadow-xs transition-all cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : saveSuccess ? (
              <Check className="w-4 h-4 text-emerald-300" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            <span>{isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Review'}</span>
          </button>
        </div>
      </header>

      {/* 2. Mobile Rating & Author Row (Visible on small screens) */}
      <div className="sm:hidden px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1">
          <span className="text-slate-500 font-medium">Rating:</span>
          <div className="flex items-center gap-0.5">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onClick={() => setRating(star)}
                className="p-0.5"
              >
                <Star
                  className={`w-3.5 h-3.5 ${
                    star <= rating ? 'text-amber-500 fill-amber-500' : 'text-slate-200'
                  }`}
                />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-1">
          <span className="text-slate-500 font-medium">By:</span>
          <input
            type="text"
            value={authorName}
            onChange={(e) => setAuthorName(e.target.value)}
            className="w-28 text-xs font-semibold text-slate-800 bg-transparent border-b border-slate-300 focus:border-indigo-600 outline-none"
            placeholder="Your name"
          />
        </div>
      </div>

      {/* 3. Sticky Formatting Toolbar with focus-preservation on every button */}
      <div
        className="sticky top-0 z-30 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 px-3 sm:px-6 py-2 flex items-center gap-1 sm:gap-1.5 overflow-x-auto no-scrollbar shadow-2xs"
        onMouseDown={(e) => {
          // Prevent toolbar clicks from stealing contenteditable focus
          if ((e.target as HTMLElement).tagName !== 'INPUT') {
            e.preventDefault();
          }
        }}
      >
        {/* Headings */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatHeading('h1')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
            title="Heading 1"
          >
            <Heading1 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatHeading('h2')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
            title="Heading 2"
          >
            <Heading2 className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => formatHeading('h3')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
            title="Heading 3"
          >
            <Heading3 className="w-4 h-4" />
          </button>
        </div>

        {/* Text Style: Bold, Italic, Underline, Strikethrough */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('bold')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors font-bold cursor-pointer"
            title="Bold (Ctrl+B)"
          >
            <Bold className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('italic')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors italic cursor-pointer"
            title="Italic (Ctrl+I)"
          >
            <Italic className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('underline')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors underline cursor-pointer"
            title="Underline (Ctrl+U)"
          >
            <Underline className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('strikeThrough')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors line-through cursor-pointer"
            title="Strikethrough"
          >
            <Strikethrough className="w-4 h-4" />
          </button>
        </div>

        {/* Text Color Picker */}
        <div className="shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => toggleDropdown('color', e)}
            className={`flex items-center gap-1 p-2 border rounded-xl transition-colors shadow-2xs cursor-pointer ${
              showColorPicker
                ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="Text Color"
          >
            <Palette className="w-4 h-4 text-indigo-600" />
          </button>
        </div>

        {/* Bright Highlighter Palette */}
        <div className="shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => toggleDropdown('highlight', e)}
            className={`flex items-center gap-1 p-2 border rounded-xl transition-colors shadow-2xs cursor-pointer ${
              showHighlightPicker
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="Background Highlighter"
          >
            <Highlighter className="w-4 h-4 text-amber-500" />
          </button>
        </div>

        {/* Lists & Blockquote */}
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-0.5 shadow-2xs shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('insertUnorderedList')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
            title="Bullet List"
          >
            <List className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('insertOrderedList')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
            title="Numbered List"
          >
            <ListOrdered className="w-4 h-4" />
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => executeFormat('formatBlock', '<blockquote>')}
            className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 transition-colors cursor-pointer"
            title="Blockquote"
          >
            <Quote className="w-4 h-4" />
          </button>
        </div>

        {/* Table Management Menu & Dropdown */}
        <div className="shrink-0">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => toggleDropdown('table', e)}
            className={`flex items-center gap-1 p-2 border rounded-xl transition-colors shadow-2xs cursor-pointer ${
              isInsideTable || showTableMenu
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
            title="Table Tools (Add/Delete Rows & Columns)"
          >
            <TableIcon className="w-4 h-4" />
            <ChevronDown className="w-3 h-3 text-slate-400" />
          </button>
        </div>

        {/* Quick In-Toolbar Table Actions (shown when cursor is inside a table) */}
        {isInsideTable && (
          <div className="flex items-center gap-1 bg-amber-100/90 border border-amber-300 rounded-xl px-2 py-1 shadow-2xs shrink-0 animate-in fade-in">
            <span className="text-[11px] font-bold text-amber-900 flex items-center gap-1 mr-1">
              <TableIcon className="w-3.5 h-3.5 text-amber-700" />
              Table:
            </span>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAddRow('below')}
              className="px-2 py-1 text-xs font-bold bg-white hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg cursor-pointer transition-colors shadow-2xs"
              title="Add Row Below"
            >
              + Row
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDeleteRow}
              className="px-2 py-1 text-xs font-bold bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
              title="Delete Current Row"
            >
              - Row
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleAddColumn('right')}
              className="px-2 py-1 text-xs font-bold bg-white hover:bg-amber-200 text-amber-900 border border-amber-300 rounded-lg cursor-pointer transition-colors shadow-2xs"
              title="Add Column to Right"
            >
              + Col
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDeleteColumn}
              className="px-2 py-1 text-xs font-bold bg-white hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg cursor-pointer transition-colors shadow-2xs"
              title="Delete Current Column"
            >
              - Col
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleDeleteTable}
              className="p-1 text-rose-600 hover:bg-rose-200 rounded-lg cursor-pointer transition-colors"
              title="Delete Entire Table"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Inline Image Upload from Device */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => {
            saveSelection();
            if (fileInputRef.current) fileInputRef.current.click();
          }}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 rounded-xl text-indigo-700 text-xs font-semibold transition-colors shadow-2xs cursor-pointer shrink-0"
          title="Insert Photo at Cursor"
        >
          <ImageIcon className="w-4 h-4 text-indigo-600" />
          <span>Insert Photo</span>
        </button>

        {/* Insert Image URL */}
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            saveSelection();
          }}
          onClick={() => {
            saveSelection();
            setShowImageUrlModal(true);
          }}
          className="p-2 bg-white border border-slate-200 rounded-xl text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer shrink-0"
          title="Insert Photo via URL"
        >
          <Link2 className="w-4 h-4" />
        </button>

        {/* Clear Formatting */}
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => executeFormat('removeFormat')}
          className="p-2 bg-white border border-slate-200 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer shrink-0 ml-auto"
          title="Clear Formatting"
        >
          <RemoveFormatting className="w-4 h-4" />
        </button>
      </div>

      {/* Import success notification */}
      {importNotice && (
        <div className="bg-emerald-50 border-b border-emerald-200 px-4 py-2 text-xs font-semibold text-emerald-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{importNotice}</span>
          </div>
          <button onClick={() => setImportNotice(null)} className="text-emerald-500 hover:text-emerald-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Error notification */}
      {errorNotice && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-2 text-xs font-medium text-rose-800 flex items-center justify-between">
          <span>{errorNotice}</span>
          <button onClick={() => setErrorNotice(null)} className="text-rose-500 hover:text-rose-800 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 4. Single-Canvas WYSIWYG Editor */}
      <main
        className="flex-1 overflow-y-auto overflow-x-auto p-4 sm:p-8 bg-white cursor-text min-w-0"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'copy';
        }}
        onDrop={async (e) => {
          e.preventDefault();
          const files = Array.from(e.dataTransfer.files || []);
          const htmlFile = files.find(
            (f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')
          );
          if (htmlFile) {
            await handleHtmlImport(htmlFile);
            return;
          }
          const imgFiles = files.filter((f) => f.type.startsWith('image/'));
          for (const img of imgFiles) {
            await handleFileUpload(img);
          }
        }}
        onClick={(e) => {
          if (e.target === e.currentTarget) {
            editorRef.current?.focus();
          }
        }}
      >
        <div className="max-w-4xl mx-auto w-full min-h-[500px] flex flex-col min-w-0">
          {/* Linked Product Banner Card */}
          {selectedProduct && (
            <div className="flex items-center justify-between p-3.5 mb-5 bg-slate-50 border border-slate-200 rounded-2xl shadow-2xs">
              <div className="flex items-center gap-3 min-w-0">
                <img
                  src={getProductImage(selectedProduct)}
                  alt={selectedProduct.name}
                  className="w-12 h-12 rounded-xl object-cover border border-slate-200 bg-white shrink-0 shadow-2xs"
                  referrerPolicy="no-referrer"
                />
                <div className="min-w-0">
                  <div className="text-[11px] font-extrabold uppercase tracking-wider text-indigo-600 truncate">
                    Reviewing Product
                  </div>
                  <div className="font-bold text-slate-900 text-sm sm:text-base truncate">
                    {getCleanProductDisplayName(selectedProduct)}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 hover:bg-slate-100 cursor-pointer shadow-2xs outline-none"
                >
                  {sortedProducts.map((p) => (
                    <option key={p.id} value={p.id}>
                      Switch to: {getCleanProductDisplayName(p)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Review / Report Name Input Field */}
          <div className="mb-6 pb-4 border-b border-slate-200">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 mb-2">
              <label htmlFor="editor-review-title-input" className="text-xs font-bold uppercase tracking-wider text-indigo-600 flex items-center gap-1.5">
                <span>Review / Report Name</span>
              </label>
              <span className="text-[11px] text-slate-400">
                Give your review report a descriptive name
              </span>
            </div>
            <input
              id="editor-review-title-input"
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder="e.g. In-Depth Sound, Battery & Noise Cancellation Field Test"
              className="w-full text-xl sm:text-2xl font-black text-slate-900 placeholder:text-slate-300 outline-none bg-transparent"
            />
          </div>

          {/* Author Byline & Tips (Desktop) */}
          <div className="hidden sm:flex items-center justify-between pb-4 mb-4 border-b border-slate-100 text-xs text-slate-500">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-slate-700">Review Author:</span>
              <input
                type="text"
                value={authorName}
                onChange={(e) => setAuthorName(e.target.value)}
                placeholder="Author name"
                className="px-2.5 py-1 rounded-lg border border-slate-200 font-medium text-slate-800 outline-none focus:border-indigo-600 w-48"
              />
            </div>
            <div className="text-slate-400">
              💡 Tip: Click on any table to add or delete rows and columns, or press Tab in the last cell!
            </div>
          </div>

          {/* Real-time ContentEditable Canvas */}
          <div
            ref={editorRef}
            contentEditable={true}
            suppressContentEditableWarning={true}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onKeyUp={saveSelection}
            onMouseUp={saveSelection}
            onTouchEnd={saveSelection}
            onSelect={saveSelection}
            onBlur={saveSelection}
            onFocus={saveSelection}
            data-placeholder="Start writing your detailed review... Format headings, add comparison tables, and paste photos directly inline."
            className="flex-1 outline-none text-slate-800 text-base sm:text-lg leading-relaxed space-y-4 focus:ring-0 empty:before:content-[attr(data-placeholder)] empty:before:text-slate-400 empty:before:pointer-events-none prose prose-slate max-w-none overflow-x-auto break-words min-w-0"
            style={{ minHeight: '450px' }}
          />
        </div>
      </main>

      {/* Image URL Prompt Modal */}
      {showImageUrlModal && (
        <div className="fixed inset-0 z-60 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <ImageIcon className="w-5 h-5 text-indigo-600" />
                <span>Insert Photo via URL</span>
              </h3>
              <button
                type="button"
                onClick={() => setShowImageUrlModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Image Direct URL (https://...)
                </label>
                <input
                  type="url"
                  value={directImageUrl}
                  onChange={(e) => setDirectImageUrl(e.target.value)}
                  placeholder="https://images.unsplash.com/..."
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-indigo-600 outline-none"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Caption / Alt Text (Optional)
                </label>
                <input
                  type="text"
                  value={imageCaption}
                  onChange={(e) => setImageCaption(e.target.value)}
                  placeholder="e.g. Back chassis ports and buttons"
                  className="w-full px-3 py-2 text-sm rounded-xl border border-slate-200 focus:border-indigo-600 outline-none"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowImageUrlModal(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleInsertImageUrl}
                disabled={!directImageUrl.trim()}
                className="px-4 py-2 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50"
              >
                Insert Photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Fixed Popover Dropdowns (Never clipped by overflow-x-auto or placed under view) */}
      {(showColorPicker || showHighlightPicker || showTableMenu) && (
        <div
          className="fixed inset-0 z-[9990] bg-transparent"
          onMouseDown={(e) => {
            e.preventDefault();
            closeAllDropdowns();
          }}
        />
      )}

      {/* Text Color Dropdown */}
      {showColorPicker && dropdownCoords && (
        <div
          className="fixed z-[9999] bg-white border border-slate-200 shadow-2xl rounded-2xl p-2.5 grid grid-cols-4 gap-2 w-52 animate-in fade-in zoom-in-95"
          style={{ top: `${dropdownCoords.top}px`, left: `${dropdownCoords.left}px` }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {COLOR_PALETTE.map((c) => (
            <button
              key={c.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setTextColor(c.value);
                closeAllDropdowns();
              }}
              className="flex flex-col items-center gap-1 p-1 hover:bg-slate-50 rounded-lg text-[10px] text-slate-600 cursor-pointer"
              title={c.label}
            >
              <span className={`w-5 h-5 rounded-full ${c.bg}`} />
              <span className="truncate max-w-[40px]">{c.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Highlighter Dropdown */}
      {showHighlightPicker && dropdownCoords && (
        <div
          className="fixed z-[9999] bg-white border border-slate-200 shadow-2xl rounded-2xl p-2.5 grid grid-cols-3 gap-2 w-56 animate-in fade-in zoom-in-95"
          style={{ top: `${dropdownCoords.top}px`, left: `${dropdownCoords.left}px` }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {HIGHLIGHT_PALETTE.map((h) => (
            <button
              key={h.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                setHighlightColor(h.value);
                closeAllDropdowns();
              }}
              className="flex flex-col items-center gap-1 p-1.5 hover:bg-slate-50 rounded-lg text-[10px] text-slate-600 cursor-pointer"
              title={h.label}
            >
              <span className={`w-6 h-4 rounded ${h.bg}`} />
              <span className="truncate max-w-[50px]">{h.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Table Operations Menu Dropdown */}
      {showTableMenu && dropdownCoords && (
        <div
          className="fixed z-[9999] bg-white border border-slate-200 shadow-2xl rounded-2xl p-2 w-64 space-y-1 text-xs animate-in fade-in zoom-in-95 max-h-[80vh] overflow-y-auto"
          style={{ top: `${dropdownCoords.top}px`, left: `${dropdownCoords.left}px` }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              insertTable();
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-2 text-left rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
          >
            <TableIcon className="w-3.5 h-3.5 text-indigo-600" />
            <span>Insert Comparison Table</span>
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleAddRow('below');
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add Row Below</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleAddRow('above');
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-emerald-600" />
            <span>Add Row Above</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleDeleteRow();
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer font-medium"
          >
            <Minus className="w-3.5 h-3.5 text-rose-600" />
            <span>Delete Current Row</span>
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleAddColumn('right');
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Column to Right</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleAddColumn('left');
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-slate-700 hover:bg-slate-50 cursor-pointer font-medium"
          >
            <Plus className="w-3.5 h-3.5 text-blue-600" />
            <span>Add Column to Left</span>
          </button>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleDeleteColumn();
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer font-medium"
          >
            <Minus className="w-3.5 h-3.5 text-rose-600" />
            <span>Delete Current Column</span>
          </button>
          <div className="border-t border-slate-100 my-1" />
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              handleDeleteTable();
              closeAllDropdowns();
            }}
            className="w-full flex items-center gap-2 px-2.5 py-1.5 text-left rounded-lg text-rose-700 hover:bg-rose-50 cursor-pointer font-bold"
          >
            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
            <span>Delete Entire Table</span>
          </button>
        </div>
      )}
    </div>
  );
};
