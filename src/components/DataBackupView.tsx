import React, { useState, useRef, useEffect } from 'react';
import {
  HardDrive,
  Download,
  Upload,
  FileJson,
  Archive,
  Trash2,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  X,
  AlertTriangle,
  Check,
  RefreshCw,
} from 'lucide-react';
import { DatabaseState } from '../types';
import {
  createFullBackupArchive,
  exportDatabaseJsonBlob,
  restoreBackupFile,
  triggerFileDownload,
  BackupProgress,
} from '../lib/backupService';
import { getAllMediaRecords, clearAllMediaBlobs } from '../lib/indexedDbMedia';
import { clearLocalDatabase, saveLocalDatabase, localAddReview, localAddReviewsBatch } from '../lib/localDatabase';
import { rehydrateMediaFromIndexedDb } from '../utils/imageCompressor';
import { cleanupOrphanMediaBlobs } from '../utils/mediaStorageCleaner';
import { parseHtmlReviewFile } from '../utils/htmlReviewParser';
import {
  parseBatchFromZip,
  parseBatchFromDirectoryFiles,
  readDroppedFilesRecursively,
} from '../utils/htmlBatchParser';
import JSZip from 'jszip';

interface DataBackupViewProps {
  database: DatabaseState;
  onRestoreDatabase?: (restored: DatabaseState) => void;
  onLoadSeedData?: () => void;
  onClearData?: () => void;
}

export const DataBackupView: React.FC<DataBackupViewProps> = ({
  database,
  onRestoreDatabase,
  onLoadSeedData,
  onClearData,
}) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'seed' | 'storage'>('backup');

  // Progress & notice states
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    text: string;
  } | null>(null);

  // Confirm dialogs
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Media count in IndexedDB
  const [cachedMediaCount, setCachedMediaCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getAllMediaRecords()
      .then((records) => setCachedMediaCount(records.length))
      .catch(() => setCachedMediaCount(0));
  }, [database]);

  const productsCount = database.products?.length || 0;
  const specsCount = database.specifications?.length || 0;
  const reviewsCount = database.reviews?.length || 0;
  const usersCount = database.users?.length || 0;
  const [isCleaningMedia, setIsCleaningMedia] = useState(false);

  // Clean unused orphan images from IndexedDB
  const handleCleanStorage = async () => {
    setIsCleaningMedia(true);
    try {
      const removedCount = await cleanupOrphanMediaBlobs(database);
      const records = await getAllMediaRecords();
      setCachedMediaCount(records.length);
      setStatusNotice({
        type: 'success',
        title: 'Storage Optimization Complete',
        text:
          removedCount > 0
            ? `Freed up local space! Removed ${removedCount} unused image blobs from IndexedDB.`
            : 'All stored images are active and in use. No orphan images found.',
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        title: 'Cleanup Error',
        text: err?.message || 'Could not clean storage.',
      });
    } finally {
      setIsCleaningMedia(false);
    }
  };

  // Handle Full ZIP Export
  const handleExportZip = async () => {
    setIsExportingZip(true);
    setStatusNotice(null);
    try {
      const { blob, fileName, manifest } = await createFullBackupArchive(database, (p) => {
        setBackupProgress(p);
      });
      const saveResult = await triggerFileDownload(blob, fileName);
      setStatusNotice({
        type: 'success',
        title: saveResult.savedToNativePath ? 'Backup Saved & Ready to Share' : 'Full Backup Downloaded Successfully',
        text: saveResult.savedToNativePath
          ? `Saved to iOS Documents folder (${fileName}). You can open it in the iOS Files app or share it via AirDrop / Drive.`
          : `Exported ${manifest.productCount} products, ${manifest.specificationCount} specifications, ${manifest.reviewCount} reviews, and ${manifest.mediaFileCount} photos into ${fileName}.`,
      });
    } catch (err: any) {
      console.error('Failed to create ZIP backup:', err);
      setStatusNotice({
        type: 'error',
        title: 'Export Failed',
        text: err?.message || 'Could not package the ZIP backup archive.',
      });
    } finally {
      setIsExportingZip(false);
      setTimeout(() => setBackupProgress(null), 3000);
    }
  };

  // Handle JSON Export (Clean URL only, zero base64)
  const handleExportJson = async () => {
    try {
      const { blob, fileName } = exportDatabaseJsonBlob(database);
      const saveResult = await triggerFileDownload(blob, fileName);
      setStatusNotice({
        type: 'success',
        title: saveResult.savedToNativePath ? 'JSON Saved & Ready to Share' : 'Clean JSON Database Exported',
        text: saveResult.savedToNativePath
          ? `Saved ${fileName} to Documents. Accessible via the Files app or native Share Sheet.`
          : `Exported clean database catalog (URLs only, zero base64 strings) to ${fileName}. File size is significantly reduced.`,
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        title: 'Export Failed',
        text: err?.message || 'Could not export JSON database.',
      });
    }
  };

  // Handle File Restore (ZIP, JSON, or HTML Note)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setStatusNotice(null);

    // If HTML review / note file
    if (file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')) {
      try {
        const parsed = await parseHtmlReviewFile(file, database.products);
        const prodId = parsed.matchedProductId || (database.products[0]?.id || '');
        const matchedProd = database.products.find((p) => p.id === prodId);
        const updatedDb = localAddReview(database, {
          productId: prodId,
          productIds: prodId ? [prodId] : [],
          productTitles: matchedProd ? [matchedProd.name] : [],
          title: parsed.title,
          body: parsed.body,
          authorName: parsed.authorName || 'Verified Reviewer',
          rating: parsed.rating || 5,
          pictures: parsed.pictures,
        });

        if (onRestoreDatabase) {
          onRestoreDatabase(updatedDb);
        } else {
          saveLocalDatabase(updatedDb);
        }

        const records = await getAllMediaRecords();
        setCachedMediaCount(records.length);

        setStatusNotice({
          type: 'success',
          title: 'HTML Review Imported Successfully',
          text: `Imported "${parsed.title}" (${parsed.tableCount} tables, ${parsed.imageCount} photos) linked to ${
            matchedProd ? matchedProd.name : 'catalog'
          }.`,
        });
      } catch (htmlErr: any) {
        setStatusNotice({
          type: 'error',
          title: 'HTML Import Failed',
          text: htmlErr?.message || 'Could not parse HTML review file.',
        });
      } finally {
        setIsRestoring(false);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
      return;
    }

    // If ZIP file, check if it's an HTML batch export or a database backup
    if (file.name.toLowerCase().endsWith('.zip')) {
      try {
        const zip = await JSZip.loadAsync(file);
        const hasDb = !!zip.file('database.json');
        if (!hasDb) {
          const batchReviews = await parseBatchFromZip(file, database.products);
          if (batchReviews.length > 0) {
            const batchPayload = batchReviews.map((rev) => {
              const prodId = rev.matchedProductId || (database.products[0]?.id || '');
              const matchedProd = database.products.find((p) => p.id === prodId);
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
            const updatedDb = localAddReviewsBatch(database, batchPayload);
            if (onRestoreDatabase) {
              onRestoreDatabase(updatedDb);
            } else {
              saveLocalDatabase(updatedDb);
            }
            const records = await getAllMediaRecords();
            setCachedMediaCount(records.length);
            setStatusNotice({
              type: 'success',
              title: 'HTML Batch ZIP Imported Successfully',
              text: `Batch imported ${batchReviews.length} reviews from ZIP archive with all photos and tables.`,
            });
            return;
          }
        }
      } catch (zipInspectErr) {
        console.warn('Zip inspect note:', zipInspectErr);
      }
    }

    try {
      const result = await restoreBackupFile(file, (p) => {
        setBackupProgress(p);
      });

      if (onRestoreDatabase) {
        onRestoreDatabase(result.database);
      } else {
        saveLocalDatabase(result.database);
      }

      await rehydrateMediaFromIndexedDb(result.database);
      const records = await getAllMediaRecords();
      setCachedMediaCount(records.length);

      setStatusNotice({
        type: 'success',
        title: 'Restore Completed Successfully',
        text: result.message,
      });
    } catch (err: any) {
      console.error('Failed to restore backup:', err);
      setStatusNotice({
        type: 'error',
        title: 'Restore Failed',
        text: err?.message || 'Could not read or parse the selected backup file.',
      });
    } finally {
      setIsRestoring(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTimeout(() => setBackupProgress(null), 3000);
    }
  };

  // Handle Seed Data
  const handleTriggerSeed = () => {
    setConfirmSeedOpen(false);
    if (onLoadSeedData) {
      onLoadSeedData();
      setStatusNotice({
        type: 'success',
        title: 'Benchmark Catalog Loaded',
        text: 'Sample smartphones, specifications, and reviews have been loaded into your catalog.',
      });
    }
  };

  // Handle Clear Data
  const handleTriggerClear = async () => {
    setConfirmClearOpen(false);
    try {
      const emptyState = clearLocalDatabase();
      await clearAllMediaBlobs();
      setCachedMediaCount(0);

      if (onClearData) {
        onClearData();
      } else if (onRestoreDatabase) {
        onRestoreDatabase(emptyState);
      }

      setStatusNotice({
        type: 'info',
        title: 'Catalog Cleared',
        text: 'All products, specifications, and reviews have been cleared. You now have a clean blank catalog.',
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        title: 'Could Not Clear Catalog',
        text: err?.message || 'An error occurred while clearing data.',
      });
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
      {/* Header Banner */}
      <div className="p-5 sm:p-7 border-b border-slate-100 bg-gradient-to-r from-slate-50 via-indigo-50/20 to-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                100% Local-App Architecture
              </span>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                IndexedDB & Local Archive
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 flex items-center gap-2 mt-1.5">
              <HardDrive className="w-6 h-6 text-indigo-600" />
              <span>Data & Backup Hub</span>
            </h2>
            <p className="text-xs sm:text-sm text-slate-500 max-w-2xl leading-relaxed">
              Lightweight URL-only database records, full ZIP archive export & restore with true offline images, and complete IndexedDB local storage.
            </p>
          </div>
        </div>

        {/* Catalog Summary Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5">
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Products</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{productsCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Catalog devices</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Specifications</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{specsCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Benchmarks & specs</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">User Reviews</div>
            <div className="text-2xl font-black text-slate-900 mt-0.5">{reviewsCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Written reviews & notes</div>
          </div>
          <div className="bg-white p-3.5 rounded-xl border border-slate-200/80 shadow-2xs">
            <div className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Photos in IndexedDB</div>
            <div className="text-2xl font-black text-indigo-600 mt-0.5">{cachedMediaCount}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Raw high-res blobs</div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div className="px-5 sm:px-7 border-b border-slate-200 flex gap-4 text-xs font-semibold text-slate-600 bg-white shrink-0 overflow-x-auto">
        <button
          onClick={() => setActiveTab('backup')}
          className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'backup'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Download className="w-4 h-4" />
          <span>Local Export (ZIP / JSON)</span>
        </button>
        <button
          onClick={() => setActiveTab('restore')}
          className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'restore'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Upload className="w-4 h-4" />
          <span>Restore File</span>
        </button>
        <button
          onClick={() => setActiveTab('seed')}
          className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'seed'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Sample Catalog / Reset</span>
        </button>
        <button
          onClick={() => setActiveTab('storage')}
          className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap ${
            activeTab === 'storage'
              ? 'border-indigo-600 text-indigo-600 font-bold'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Storage & URL Optimization</span>
        </button>
      </div>

      {/* Body Area */}
      <div className="p-5 sm:p-7 space-y-6">
        {/* Status Notice */}
        {statusNotice && (
          <div
            className={`p-4 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150 ${
              statusNotice.type === 'success'
                ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                : statusNotice.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-900'
                : 'bg-blue-50 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-start gap-2.5">
              {statusNotice.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              ) : statusNotice.type === 'error' ? (
                <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              ) : (
                <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
              )}
              <div>
                <div className="font-bold">{statusNotice.title}</div>
                <div className="mt-0.5 leading-relaxed">{statusNotice.text}</div>
              </div>
            </div>
            <button
              onClick={() => setStatusNotice(null)}
              className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Global Backup/Restore Progress Bar */}
        {backupProgress && (
          <div className="p-4 bg-indigo-50/80 border border-indigo-200 rounded-xl space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold text-indigo-950">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                <span>{backupProgress.stage}</span>
              </span>
              <span>{backupProgress.percent}%</span>
            </div>
            <div className="w-full bg-indigo-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-indigo-600 h-2 rounded-full transition-all duration-300"
                style={{ width: `${backupProgress.percent}%` }}
              />
            </div>
            <div className="text-[11px] text-indigo-700">{backupProgress.detail}</div>
          </div>
        )}

        {/* TAB 1: LOCAL EXPORT BACKUP */}
        {activeTab === 'backup' && (
          <div className="space-y-5">
            <div className="bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 p-6 rounded-2xl border border-indigo-100 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div>
                  <span className="px-2.5 py-1 rounded-md bg-indigo-100 text-indigo-800 font-semibold text-[10px] uppercase tracking-wider">
                    Complete Local Offline Archive
                  </span>
                  <h3 className="text-lg font-bold text-slate-900 mt-2">
                    Complete ZIP Archive (Database + All Pictures & Reviews)
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-600 mt-1 max-w-2xl leading-relaxed">
                    Packages your entire catalog database into a timestamped <code className="font-mono bg-white px-1.5 py-0.5 rounded border text-indigo-600 font-semibold">.zip</code> archive. Images are stored as true compressed files in the <code className="font-mono text-indigo-600">images/</code> folder, keeping <code className="font-mono text-indigo-600">database.json</code> lightweight and fast.
                  </p>
                </div>
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Archive className="w-6 h-6" />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-3">
                <button
                  id="tab-export-full-zip-btn"
                  onClick={handleExportZip}
                  disabled={isExportingZip || isRestoring}
                  className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />
                  <span>{isExportingZip ? 'Packaging Full Archive...' : 'Export Complete Backup (.ZIP)'}</span>
                </button>

                <button
                  id="tab-export-database-json-btn"
                  onClick={handleExportJson}
                  disabled={isExportingZip || isRestoring}
                  className="flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs sm:text-sm font-semibold rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                >
                  <FileJson className="w-4 h-4 text-slate-500" />
                  <span>Export Database Only (.JSON - Lightweight)</span>
                </button>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1.5">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Zero Base64 in JSON</span>
              </div>
              <p className="text-[11px] leading-relaxed">
                Your <code className="font-mono text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">database.json</code> now stores only clean URLs and IndexedDB identifiers. The massive 25MB base64 payload is stripped, keeping your database swift, lightweight, and clean.
              </p>
            </div>
          </div>
        )}

        {/* TAB 2: RESTORE & IMPORT */}
        {activeTab === 'restore' && (
          <div className="space-y-5">
            <div className="p-8 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/60 hover:bg-slate-50 transition-colors text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                <Upload className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Select File to Restore or Import</h3>
                <p className="text-xs sm:text-sm text-slate-500 mt-1 max-w-lg mx-auto">
                  Upload a previously exported <span className="font-semibold text-slate-700">.ZIP</span> archive, a <span className="font-semibold text-slate-700">.JSON</span> database file, or an <span className="font-semibold text-slate-700">.HTML</span> note/review from UpNote or web.
                </p>
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json,.html,.htm"
                  onChange={handleFileUpload}
                  className="hidden"
                  id="backup-file-input"
                />
                <label
                  htmlFor="backup-file-input"
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Upload className="w-4 h-4" />
                  <span>Choose Backup File (.zip, .json, or .html)</span>
                </label>
              </div>

              <div className="text-[11px] text-slate-400">
                Supports full .zip archives, lightweight .json, and rich .html note imports.
              </div>
            </div>
          </div>
        )}

        {/* TAB 3: SAMPLE CATALOG & RESET */}
        {activeTab === 'seed' && (
          <div className="space-y-4">
            <div className="p-5 rounded-2xl border border-indigo-200 bg-indigo-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded">
                  Sample Catalog
                </span>
                <h3 className="text-sm font-bold text-indigo-950 mt-1">
                  Load Benchmark Smartphone Catalog
                </h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Populates the catalog with flagship devices (Pixel 9 Pro, Galaxy S25 Ultra, iPhone 16 Pro), benchmark specs, and detailed review write-ups.
                </p>
              </div>

              <button
                id="tab-load-seed-catalog-btn"
                onClick={() => setConfirmSeedOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Load Sample Catalog</span>
              </button>
            </div>

            <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-wider text-rose-700 bg-rose-100 px-2 py-0.5 rounded">
                  Start Blank
                </span>
                <h3 className="text-sm font-bold text-rose-950 mt-1">
                  Clear All Catalog Data
                </h3>
                <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                  Wipes all products, specifications, reviews, and cached images. Allows you to build your personal product comparison catalog entirely from scratch.
                </p>
              </div>

              <button
                id="tab-clear-all-data-btn"
                onClick={() => setConfirmClearOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Clear All Catalog Data</span>
              </button>
            </div>
          </div>
        )}

        {/* TAB 4: STORAGE HEALTH & URL OPTIMIZATION */}
        {activeTab === 'storage' && (
          <div className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Storage Engine</div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Local IndexedDB + URL Only</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  High-capacity IndexedDB for multi-megabyte photos. The JSON database records contain pure URLs and zero base64 payload.
                </p>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Local Archive Storage</div>
                <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Archive className="w-4 h-4 text-indigo-600" />
                  <span>Full Offline Export & Restore</span>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Backups package the entire catalog with compressed photos into standard .zip archives for complete portability.
                </p>
              </div>
            </div>

            <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
              <div className="text-xs font-bold text-slate-800">Database Inventory</div>
              <div className="divide-y divide-slate-100 text-xs">
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total Products</span>
                  <span className="font-bold text-slate-900">{productsCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total Specifications</span>
                  <span className="font-bold text-slate-900">{specsCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Total User Reviews</span>
                  <span className="font-bold text-slate-900">{reviewsCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">App Users</span>
                  <span className="font-bold text-slate-900">{usersCount}</span>
                </div>
                <div className="py-2.5 flex items-center justify-between">
                  <span className="text-slate-600">Cached Photo Blobs (IndexedDB)</span>
                  <span className="font-bold text-indigo-600">{cachedMediaCount} files</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <p className="text-[11px] text-slate-500">
                  Delete orphan images that are no longer linked to any review or product.
                </p>
                <button
                  type="button"
                  onClick={handleCleanStorage}
                  disabled={isCleaningMedia}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isCleaningMedia ? 'animate-spin' : ''}`} />
                  <span>{isCleaningMedia ? 'Cleaning...' : 'Free Up Storage Space'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Confirmation Modal: Load Seed Data */}
      {confirmSeedOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600" />
              <span>Load Sample Benchmark Catalog?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              This will populate your catalog with default benchmark smartphones, specs, and reviews. If you have any custom products you want to keep, make sure you have exported a ZIP backup first.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmSeedOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerSeed}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer shadow-xs"
              >
                Yes, Load Sample Data
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation Modal: Clear All Data */}
      {confirmClearOpen && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-2xs">
          <div className="bg-white rounded-2xl p-5 max-w-md w-full shadow-2xl border border-slate-200 space-y-3">
            <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600" />
              <span>Clear All Catalog Data?</span>
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Are you sure you want to clear all products, specifications, and reviews? This will reset your catalog to empty so you can start blank. This action cannot be undone unless you have a backup file.
            </p>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setConfirmClearOpen(false)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleTriggerClear}
                className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg cursor-pointer shadow-xs"
              >
                Yes, Clear Everything
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
