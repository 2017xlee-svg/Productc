import React, { useState, useRef, useMemo } from 'react';
import {
  X,
  FileCode,
  Upload,
  Check,
  Star,
  Sparkles,
  Eye,
  Trash2,
  AlertCircle,
  Loader2,
  Table as TableIcon,
  Image as ImageIcon,
  CheckCircle2,
  Edit3,
  Folder,
  Archive,
  Layers,
} from 'lucide-react';
import { Product, UserReview } from '../types';
import {
  parseBatchFromZip,
  parseBatchFromDirectoryFiles,
  readDroppedFilesRecursively,
  ParsedBatchReview,
} from '../utils/htmlBatchParser';
import { parseHtmlReviewFile } from '../utils/htmlReviewParser';
import { getCleanProductDisplayName, sortProductsByName } from '../utils/productUtils';
import { FormattedReviewContent } from './FormattedReviewContent';

interface ImportHtmlReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Product[];
  onSaveReview: (reviewData: {
    productId?: string;
    productIds?: string[];
    productTitles?: string[];
    title?: string;
    body: string;
    authorName?: string;
    rating?: number;
    pictures?: any[];
  }) => Promise<void>;
  onSaveBatchReviews?: (reviewsDataList: any[]) => Promise<void>;
  onOpenInEditor?: (reviewData: Partial<UserReview> & { productId?: string; title?: string }) => void;
}

export const ImportHtmlReviewModal: React.FC<ImportHtmlReviewModalProps> = ({
  isOpen,
  onClose,
  products,
  onSaveReview,
  onSaveBatchReviews,
  onOpenInEditor,
}) => {
  const [parsedReviews, setParsedReviews] = useState<ParsedBatchReview[]>([]);
  const sortedProducts = useMemo(() => sortProductsByName(products), [products]);
  const [selectedIndex, setSelectedIndex] = useState<number>(0);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [importSuccessMessage, setImportSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  // Process a selected or dropped file list
  const handleInputFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setIsParsing(true);
    setErrorMessage(null);
    setImportSuccessMessage(null);

    try {
      // 1. Check if a ZIP file was provided
      const zipFile = fileArray.find((f) => f.name.toLowerCase().endsWith('.zip'));
      if (zipFile) {
        const batchResults = await parseBatchFromZip(zipFile, products);
        if (batchResults.length === 0) {
          setErrorMessage('No HTML reviews were found inside the ZIP archive.');
        } else {
          setParsedReviews((prev) => [...prev, ...batchResults]);
          setSelectedIndex(parsedReviews.length);
          setImportSuccessMessage(`Loaded ${batchResults.length} reviews from ZIP archive.`);
        }
        return;
      }

      // 2. Check if files have webkitRelativePath (folder upload)
      const hasRelativePaths = fileArray.some((f) => f.webkitRelativePath && f.webkitRelativePath.includes('/'));
      if (hasRelativePaths) {
        const batchResults = await parseBatchFromDirectoryFiles(fileArray, products);
        if (batchResults.length === 0) {
          setErrorMessage('No HTML reviews were found in the selected folder.');
        } else {
          setParsedReviews((prev) => [...prev, ...batchResults]);
          setSelectedIndex(parsedReviews.length);
          setImportSuccessMessage(`Loaded ${batchResults.length} reviews from folder.`);
        }
        return;
      }

      // 3. Fallback: single or multiple standalone HTML files
      const htmlFiles = fileArray.filter(
        (f) => f.name.toLowerCase().endsWith('.html') || f.name.toLowerCase().endsWith('.htm')
      );
      if (htmlFiles.length === 0) {
        setErrorMessage('Please select valid HTML file(s) (.html, .htm), an exported folder, or a .zip archive.');
        return;
      }

      const results: ParsedBatchReview[] = [];
      for (let i = 0; i < htmlFiles.length; i++) {
        const single = await parseHtmlReviewFile(htmlFiles[i], products);
        results.push({
          id: `rev_single_${Date.now()}_${i}`,
          folderName: 'File Import',
          title: single.title,
          body: single.body,
          authorName: single.authorName,
          rating: single.rating || 5,
          matchedProductId: single.matchedProductId,
          matchedProductTitle: single.matchedProductTitle,
          pictures: single.pictures,
          tableCount: single.tableCount,
          imageCount: single.imageCount,
          wordCount: single.wordCount,
          fileName: single.fileName || htmlFiles[i].name,
          relativePath: htmlFiles[i].name,
        });
      }

      setParsedReviews((prev) => [...prev, ...results]);
      setSelectedIndex(parsedReviews.length);
      setImportSuccessMessage(`Loaded ${results.length} HTML review(s).`);
    } catch (err: any) {
      console.error('Failed to parse HTML batch:', err);
      setErrorMessage(`Failed to process HTML batch: ${err?.message || 'Invalid format'}`);
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (folderInputRef.current) folderInputRef.current.value = '';
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleInputFiles(e.target.files);
    }
  };

  const handleFolderInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleInputFiles(e.target.files);
    }
  };

  const handleDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);

    setIsParsing(true);
    setErrorMessage(null);
    setImportSuccessMessage(null);

    try {
      // Recursively extract all files and directory structure from drop event
      const droppedFiles = await readDroppedFilesRecursively(e.dataTransfer);
      if (droppedFiles.length > 0) {
        await handleInputFiles(droppedFiles);
      } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await handleInputFiles(e.dataTransfer.files);
      }
    } catch (err: any) {
      console.error('Error handling dropped folder:', err);
      setErrorMessage(`Could not read dropped folder: ${err?.message || 'Error reading directory'}`);
      setIsParsing(false);
    }
  };

  const currentReview = parsedReviews[selectedIndex];

  const updateCurrentReview = (updates: Partial<ParsedBatchReview>) => {
    setParsedReviews((prev) => {
      const copy = [...prev];
      if (copy[selectedIndex]) {
        copy[selectedIndex] = { ...copy[selectedIndex], ...updates };
      }
      return copy;
    });
  };

  const handleRemoveReview = (index: number) => {
    setParsedReviews((prev) => prev.filter((_, i) => i !== index));
    if (selectedIndex >= parsedReviews.length - 1) {
      setSelectedIndex(Math.max(0, parsedReviews.length - 2));
    }
  };

  // Import single currently selected review
  const handleImportCurrent = async () => {
    if (!currentReview) return;
    if (!currentReview.matchedProductId && products.length > 0) {
      setErrorMessage('Please select a device / product to link with this review.');
      return;
    }

    setIsImporting(true);
    setErrorMessage(null);

    try {
      const matchedProd = products.find((p) => p.id === currentReview.matchedProductId);
      await onSaveReview({
        productId: currentReview.matchedProductId,
        productIds: currentReview.matchedProductId ? [currentReview.matchedProductId] : [],
        productTitles: matchedProd ? [matchedProd.name] : [],
        title: currentReview.title,
        body: currentReview.body,
        authorName: currentReview.authorName || 'Verified Reviewer',
        rating: currentReview.rating || 5,
        pictures: currentReview.pictures,
      });

      setImportSuccessMessage(`Successfully imported "${currentReview.title}"!`);
      handleRemoveReview(selectedIndex);
    } catch (err: any) {
      setErrorMessage(`Failed to save review: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Import all pending reviews in batch
  const handleImportAll = async () => {
    if (parsedReviews.length === 0) return;
    setIsImporting(true);
    setErrorMessage(null);

    try {
      if (onSaveBatchReviews) {
        const batchPayload = parsedReviews.map((rev) => {
          const prodId = rev.matchedProductId || (products[0]?.id || '');
          const matchedProd = products.find((p) => p.id === prodId);
          return {
            productId: prodId,
            productIds: prodId ? [prodId] : [],
            productTitles: matchedProd ? [matchedProd.name] : [],
            title: rev.title,
            body: rev.body,
            authorName: rev.authorName || 'Verified Reviewer',
            rating: rev.rating || 5,
            pictures: rev.pictures,
          };
        });
        await onSaveBatchReviews(batchPayload);
      } else {
        for (const rev of parsedReviews) {
          const prodId = rev.matchedProductId || (products[0]?.id || '');
          const matchedProd = products.find((p) => p.id === prodId);
          await onSaveReview({
            productId: prodId,
            productIds: prodId ? [prodId] : [],
            productTitles: matchedProd ? [matchedProd.name] : [],
            title: rev.title,
            body: rev.body,
            authorName: rev.authorName || 'Verified Reviewer',
            rating: rev.rating || 5,
            pictures: rev.pictures,
          });
        }
      }

      setImportSuccessMessage(`Successfully batch imported ${parsedReviews.length} HTML reviews into catalog!`);
      setParsedReviews([]);
      setTimeout(() => {
        onClose();
      }, 1000);
    } catch (err: any) {
      setErrorMessage(`Failed during batch import: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsImporting(false);
    }
  };

  // Open review in the full-featured UnifiedReviewEditor
  const handleOpenInEditor = () => {
    if (!currentReview || !onOpenInEditor) return;
    const targetProdId = currentReview.matchedProductId || products[0]?.id;
    onOpenInEditor({
      title: currentReview.title,
      body: currentReview.body,
      authorName: currentReview.authorName,
      rating: currentReview.rating || 5,
      productId: targetProdId,
      productIds: targetProdId ? [targetProdId] : [],
      productTitles: targetProdId ? [products.find((p) => p.id === targetProdId)?.name || ''] : [],
      pictures: currentReview.pictures,
    });
    onClose();
  };

  return (
    <div
      id="import-html-review-modal"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95">
        {/* Header */}
        <header className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">HTML Batch Review Import</h2>
              <p className="text-xs text-slate-500">
                Batch import review folders, .ZIP archives, or individual HTML notes from UpNote & web
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Notifications */}
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{errorMessage}</span>
              </div>
              <button onClick={() => setErrorMessage(null)} className="text-rose-500 hover:text-rose-800">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {importSuccessMessage && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-xs text-emerald-800 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{importSuccessMessage}</span>
            </div>
          )}

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isDragOver
                ? 'border-indigo-500 bg-indigo-50/60 ring-4 ring-indigo-100'
                : 'border-slate-300 bg-slate-50/50 hover:bg-slate-50'
            }`}
          >
            {/* Hidden Input for Files & ZIP */}
            <input
              ref={fileInputRef}
              type="file"
              accept=".html,.htm,.zip"
              multiple
              onChange={handleFileInputChange}
              className="hidden"
              id="html-review-modal-file-input"
            />

            {/* Hidden Input for Folders */}
            <input
              ref={folderInputRef}
              type="file"
              // @ts-expect-error webkitdirectory is standard in browser engines
              webkitdirectory=""
              directory=""
              multiple
              onChange={handleFolderInputChange}
              className="hidden"
              id="html-review-modal-folder-input"
            />

            <div className="flex flex-col items-center justify-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center">
                <Upload className="w-6 h-6" />
              </div>

              <div>
                <p className="text-sm font-bold text-slate-800">
                  Drag and drop a <span className="text-indigo-600">Folder</span>, exported{' '}
                  <span className="text-indigo-600">.ZIP</span> archive, or HTML files here
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-lg mx-auto">
                  Each review folder becomes 1 review. Subfolders inside each review (like{' '}
                  <code className="bg-slate-200/60 px-1 py-0.5 rounded text-slate-700">images/</code>) are
                  automatically resolved as photo attachments.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-1 flex-wrap justify-center">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer"
                >
                  <Archive className="w-3.5 h-3.5" />
                  <span>Choose .ZIP or .HTML Files</span>
                </button>

                <button
                  type="button"
                  onClick={() => folderInputRef.current?.click()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-indigo-50 border border-slate-200 text-slate-700 hover:text-indigo-700 rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Folder className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Choose Folder</span>
                </button>
              </div>
            </div>
          </div>

          {/* Loading Indicator */}
          {isParsing && (
            <div className="p-4 bg-indigo-50 rounded-2xl flex items-center justify-center gap-2 text-xs text-indigo-700 font-medium">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Scanning review folders, linking local photos, and formatting tables...</span>
            </div>
          )}

          {/* Parsed List & Review Inspector */}
          {parsedReviews.length > 0 && (
            <div className="space-y-4">
              {/* Batch Selector Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-3">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1 max-w-full sm:max-w-[70%]">
                  {parsedReviews.map((rev, idx) => (
                    <button
                      key={rev.id || idx}
                      type="button"
                      onClick={() => setSelectedIndex(idx)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer flex items-center gap-1.5 ${
                        selectedIndex === idx
                          ? 'bg-indigo-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      <span>{rev.title || `Review #${idx + 1}`}</span>
                      {rev.imageCount > 0 && (
                        <span
                          className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                            selectedIndex === idx ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {rev.imageCount}📷
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={handleImportAll}
                  disabled={isImporting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors cursor-pointer shrink-0 disabled:opacity-50 flex items-center gap-1.5 self-end sm:self-auto"
                >
                  <Check className="w-4 h-4" />
                  <span>Batch Import All ({parsedReviews.length} Reviews)</span>
                </button>
              </div>

              {currentReview && (
                <div className="bg-slate-50/80 rounded-2xl border border-slate-200 p-5 space-y-4">
                  {/* Folder Source Identifier */}
                  <div className="flex items-center justify-between text-xs text-slate-500 pb-2 border-b border-slate-200/80">
                    <span className="flex items-center gap-1 font-mono text-[11px] text-indigo-700 font-semibold bg-indigo-50 px-2 py-0.5 rounded-md">
                      <Folder className="w-3.5 h-3.5 text-indigo-600" />
                      {currentReview.folderName}/ (Review #{selectedIndex + 1})
                    </span>
                    <span className="text-[11px] text-slate-400 font-mono truncate max-w-xs">
                      {currentReview.fileName}
                    </span>
                  </div>

                  {/* Top Meta Configuration */}
                  <div className="grid sm:grid-cols-2 gap-4">
                    {/* Review Title */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Review Title
                      </label>
                      <input
                        type="text"
                        value={currentReview.title}
                        onChange={(e) => updateCurrentReview({ title: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-900 outline-none focus:border-indigo-600"
                        placeholder="Review title"
                      />
                    </div>

                    {/* Matched Product Dropdown */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center justify-between">
                        <span>Target Product / Device</span>
                        {currentReview.matchedProductId && (
                          <span className="text-[10px] text-emerald-600 font-bold lowercase flex items-center gap-0.5">
                            <Sparkles className="w-3 h-3" /> auto-detected
                          </span>
                        )}
                      </label>
                      <select
                        value={currentReview.matchedProductId || ''}
                        onChange={(e) => updateCurrentReview({ matchedProductId: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:border-indigo-600 cursor-pointer"
                      >
                        <option value="">-- Select Product to Review --</option>
                        {sortedProducts.map((p) => (
                          <option key={p.id} value={p.id}>
                            {getCleanProductDisplayName(p)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Author Byline */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Review Author
                      </label>
                      <input
                        type="text"
                        value={currentReview.authorName || ''}
                        onChange={(e) => updateCurrentReview({ authorName: e.target.value })}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-medium text-slate-800 outline-none focus:border-indigo-600"
                        placeholder="Author name (e.g. Verified Reviewer)"
                      />
                    </div>

                    {/* Star Rating */}
                    <div className="space-y-1">
                      <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                        Rating Score
                      </label>
                      <div className="flex items-center gap-1.5 py-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            type="button"
                            onClick={() => updateCurrentReview({ rating: star })}
                            className="p-1 text-slate-300 hover:text-amber-400 cursor-pointer transition-colors"
                          >
                            <Star
                              className={`w-5 h-5 ${
                                star <= (currentReview.rating || 5)
                                  ? 'text-amber-500 fill-amber-500'
                                  : 'text-slate-200'
                              }`}
                            />
                          </button>
                        ))}
                        <span className="text-xs font-bold text-slate-700 ml-2">
                          {currentReview.rating || 5} / 5 Stars
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Summary Badges */}
                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-200/80 text-xs">
                    <span className="px-2.5 py-1 rounded-lg bg-indigo-100 text-indigo-800 font-semibold flex items-center gap-1 text-[11px]">
                      <TableIcon className="w-3.5 h-3.5" />
                      {currentReview.tableCount} {currentReview.tableCount === 1 ? 'Table' : 'Tables'}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 font-semibold flex items-center gap-1 text-[11px]">
                      <ImageIcon className="w-3.5 h-3.5" />
                      {currentReview.imageCount} {currentReview.imageCount === 1 ? 'Photo Resolved' : 'Photos Resolved'}
                    </span>
                    <span className="px-2.5 py-1 rounded-lg bg-slate-200/70 text-slate-700 font-semibold text-[11px]">
                      {currentReview.wordCount} words
                    </span>
                  </div>

                  {/* HTML Content Preview */}
                  <div className="space-y-1.5 pt-2">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
                      <Eye className="w-3.5 h-3.5" />
                      <span>Rich Content Preview (with resolved photos & tables)</span>
                    </label>
                    <div className="bg-white border border-slate-200 rounded-xl p-4 max-h-64 overflow-y-auto text-sm">
                      <FormattedReviewContent
                        content={currentReview.body}
                        pictures={currentReview.pictures}
                      />
                    </div>
                  </div>

                  {/* Action Bar for Current Review */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-200">
                    <button
                      type="button"
                      onClick={() => handleRemoveReview(selectedIndex)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Discard from list</span>
                    </button>

                    <div className="flex items-center gap-2">
                      {onOpenInEditor && (
                        <button
                          type="button"
                          onClick={handleOpenInEditor}
                          className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Open in Full Editor</span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={handleImportCurrent}
                        disabled={isImporting}
                        className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                      >
                        {isImporting ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Check className="w-4 h-4" />
                        )}
                        <span>Import This Review</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer className="px-6 py-3.5 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Exported from <span className="font-semibold text-slate-700">UpNote</span> or any browser as HTML folder / .zip.
          </p>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 text-xs font-semibold cursor-pointer"
          >
            Close
          </button>
        </footer>
      </div>
    </div>
  );
};
