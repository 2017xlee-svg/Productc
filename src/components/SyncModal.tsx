import React, { useState, useRef, useEffect } from 'react';
import {
  Database,
  CheckCircle2,
  AlertCircle,
  X,
  HardDrive,
  Check,
  Download,
  Upload,
  FileJson,
  Archive,
  RefreshCw,
  Trash2,
  Sparkles,
  ShieldCheck,
  Layers,
  Image as ImageIcon,
  HelpCircle,
  AlertTriangle,
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
import { loadSeedCatalog, clearLocalDatabase, saveLocalDatabase, normalizeDatabaseState } from '../lib/localDatabase';
import { rehydrateMediaFromIndexedDb } from '../utils/imageCompressor';

interface SyncModalProps {
  database: DatabaseState;
  onClose: () => void;
  onRestoreDatabase?: (restored: DatabaseState) => void;
  onLoadSeedData?: () => void;
  onClearData?: () => void;
}

export const SyncModal: React.FC<SyncModalProps> = ({
  database,
  onClose,
  onRestoreDatabase,
  onLoadSeedData,
  onClearData,
}) => {
  const [activeTab, setActiveTab] = useState<'backup' | 'restore' | 'seed' | 'storage'>('backup');
  
  // Progress states
  const [isExportingZip, setIsExportingZip] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [backupProgress, setBackupProgress] = useState<BackupProgress | null>(null);

  // Status notification
  const [statusNotice, setStatusNotice] = useState<{
    type: 'success' | 'error' | 'info';
    title: string;
    text: string;
  } | null>(null);

  // Confirmation dialogs
  const [confirmSeedOpen, setConfirmSeedOpen] = useState(false);
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Media count in IndexedDB
  const [cachedMediaCount, setCachedMediaCount] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load IndexedDB media count on mount
  useEffect(() => {
    getAllMediaRecords()
      .then((records) => setCachedMediaCount(records.length))
      .catch(() => setCachedMediaCount(0));
  }, [database]);

  // Safe normalized counts
  const productsCount = database.products?.length || 0;
  const specsCount = database.specifications?.length || 0;
  const reviewsCount = database.reviews?.length || 0;
  const usersCount = database.users?.length || 0;

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

  // Handle JSON Export
  const handleExportJson = async () => {
    try {
      const { blob, fileName } = exportDatabaseJsonBlob(database);
      const saveResult = await triggerFileDownload(blob, fileName);
      setStatusNotice({
        type: 'success',
        title: saveResult.savedToNativePath ? 'JSON Saved & Ready to Share' : 'JSON Database Exported',
        text: saveResult.savedToNativePath
          ? `Saved ${fileName} to Documents. Accessible via the Files app or native Share Sheet.`
          : `Exported database catalog to ${fileName}.`,
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        title: 'Export Failed',
        text: err?.message || 'Could not export JSON database.',
      });
    }
  };

  // Handle File Restore (ZIP or JSON)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsRestoring(true);
    setStatusNotice(null);

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
        title: 'Backup Restored Successfully',
        text: result.message,
      });
    } catch (err: any) {
      console.error('Failed to restore backup:', err);
      setStatusNotice({
        type: 'error',
        title: 'Restore Failed',
        text: err?.message || 'Invalid or damaged backup archive.',
      });
    } finally {
      setIsRestoring(false);
      setTimeout(() => setBackupProgress(null), 3000);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // Handle Seed Data (Explicit Separate Button)
  const handleTriggerSeed = async () => {
    setConfirmSeedOpen(false);
    try {
      const seedState = loadSeedCatalog();
      if (onLoadSeedData) {
        onLoadSeedData();
      } else if (onRestoreDatabase) {
        onRestoreDatabase(seedState);
      }
      await rehydrateMediaFromIndexedDb(seedState);
      const records = await getAllMediaRecords();
      setCachedMediaCount(records.length);

      setStatusNotice({
        type: 'success',
        title: 'Sample Benchmark Catalog Loaded',
        text: `Loaded ${seedState.products.length} benchmark devices, ${seedState.specifications.length} specifications, and ${seedState.reviews.length} reviews.`,
      });
    } catch (err: any) {
      setStatusNotice({
        type: 'error',
        title: 'Could Not Load Seed Data',
        text: err?.message || 'An error occurred while loading sample catalog.',
      });
    }
  };

  // Handle Clear Data (Explicit Separate Button)
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 flex flex-col max-h-[92vh] overflow-hidden">
        
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900">Data & Backup Hub</h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800 border border-emerald-200">
                  100% Local-App
                </span>
              </div>
              <p className="text-xs text-slate-500">
                Safe on-device persistence · Full ZIP backups with all photos & reviews
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="px-5 border-b border-slate-100 flex gap-4 text-xs font-semibold text-slate-600 bg-white shrink-0 overflow-x-auto">
          <button
            onClick={() => setActiveTab('backup')}
            className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'backup'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export Backup</span>
          </button>
          <button
            onClick={() => setActiveTab('restore')}
            className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'restore'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Restore & Import</span>
          </button>
          <button
            onClick={() => setActiveTab('seed')}
            className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'seed'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Sample Catalog / Reset</span>
          </button>
          <button
            onClick={() => setActiveTab('storage')}
            className={`py-2.5 border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'storage'
                ? 'border-indigo-600 text-indigo-600 font-bold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Storage Health</span>
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          
          {/* Status Message */}
          {statusNotice && (
            <div
              className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 text-xs animate-in fade-in duration-150 ${
                statusNotice.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                  : statusNotice.type === 'error'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : 'bg-blue-50 border-blue-200 text-blue-900'
              }`}
            >
              <div className="flex items-start gap-2.5">
                {statusNotice.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                ) : statusNotice.type === 'error' ? (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                ) : (
                  <HelpCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                )}
                <div>
                  <div className="font-bold">{statusNotice.title}</div>
                  <div className="mt-0.5 text-[11px] opacity-90">{statusNotice.text}</div>
                </div>
              </div>
              <button
                onClick={() => setStatusNotice(null)}
                className="text-slate-400 hover:text-slate-600 p-0.5 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Progress Indicator */}
          {backupProgress && (
            <div className="p-4 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-indigo-900">{backupProgress.stage}</span>
                <span className="font-mono text-indigo-700 font-semibold">{backupProgress.percent}%</span>
              </div>
              <div className="w-full h-2 bg-indigo-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 transition-all duration-300 rounded-full"
                  style={{ width: `${backupProgress.percent}%` }}
                />
              </div>
              <div className="text-[11px] text-indigo-700 truncate">{backupProgress.detail}</div>
            </div>
          )}

          {/* TAB 1: EXPORT BACKUP */}
          {activeTab === 'backup' && (
            <div className="space-y-4">
              <div className="bg-gradient-to-br from-indigo-50/80 via-white to-slate-50 p-5 rounded-2xl border border-indigo-100 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <span className="px-2 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-semibold text-[10px] uppercase tracking-wider">
                      Recommended Full Backup
                    </span>
                    <h3 className="text-base font-bold text-slate-900 mt-1">
                      Complete ZIP Archive (Full Database + All Images & Reviews)
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Packages your entire catalog database into a single file together with every raw photo, picture, and attachment stored in high fidelity.
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                    <Archive className="w-5 h-5" />
                  </div>
                </div>

                {/* Current Data Counts */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-1">
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] uppercase font-semibold text-slate-400">Products</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5">{productsCount}</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] uppercase font-semibold text-slate-400">Specs</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5">{specsCount}</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] uppercase font-semibold text-slate-400">Reviews</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5">{reviewsCount}</div>
                  </div>
                  <div className="bg-white p-3 rounded-xl border border-slate-200/80 shadow-2xs">
                    <div className="text-[10px] uppercase font-semibold text-slate-400">Images Cached</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5">{cachedMediaCount}</div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3 pt-2">
                  <button
                    id="export-full-zip-btn"
                    onClick={handleExportZip}
                    disabled={isExportingZip || isRestoring}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    <span>{isExportingZip ? 'Packaging Backup...' : 'Export Complete Backup (.ZIP)'}</span>
                  </button>

                  <button
                    id="export-database-json-btn"
                    onClick={handleExportJson}
                    disabled={isExportingZip || isRestoring}
                    className="flex items-center gap-2 px-3.5 py-2.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-semibold rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <FileJson className="w-4 h-4 text-slate-500" />
                    <span>Export Database Only (.JSON)</span>
                  </button>
                </div>
              </div>

              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1.5">
                <div className="font-bold text-slate-800 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span>Why export to ZIP?</span>
                </div>
                <p className="text-[11px] leading-relaxed">
                  The ZIP format bundles <code className="font-mono text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">database.json</code> with an <code className="font-mono text-slate-800 bg-white px-1 py-0.5 rounded border border-slate-200">images/</code> directory containing all your high-resolution phone renders, spec charts, and user review snapshots. Restoring the ZIP restores both text and visual attachments in one step.
                </p>
              </div>
            </div>
          )}

          {/* TAB 2: RESTORE & IMPORT */}
          {activeTab === 'restore' && (
            <div className="space-y-4">
              <div className="p-5 border-2 border-dashed border-slate-300 rounded-2xl bg-slate-50/60 hover:bg-slate-50 transition-colors text-center space-y-3">
                <div className="w-12 h-12 mx-auto rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center">
                  <Upload className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Select Backup File to Restore</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                    Upload a previously exported <span className="font-semibold text-slate-700">.ZIP</span> archive (restores all catalog data & photos) or a <span className="font-semibold text-slate-700">.JSON</span> database file.
                  </p>
                </div>

                <div className="pt-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".zip,.json"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="restore-file-input"
                  />
                  <label
                    htmlFor="restore-file-input"
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                  >
                    <Upload className="w-4 h-4" />
                    <span>Choose Backup File (.zip or .json)</span>
                  </label>
                </div>
                <div className="text-[10px] text-slate-400">
                  Supported formats: .zip (full archive) and .json (records)
                </div>
              </div>

              <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl flex items-start gap-2.5 text-xs text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold">Restore Notice</div>
                  <div className="text-[11px] mt-0.5 leading-relaxed">
                    Restoring a backup will replace your current in-app catalog with the contents of the file. Any photos in the archive will be extracted and saved into on-device IndexedDB.
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: SEED DATA / RESET (SEPARATE BUTTON AS REQUESTED) */}
          {activeTab === 'seed' && (
            <div className="space-y-4">
              {/* Seed Card */}
              <div className="p-5 rounded-2xl border border-slate-200 bg-white space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span>Load Sample / Benchmark Catalog</span>
                    </h3>
                    <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                      Populate your catalog with benchmark smartphones (such as Samsung Galaxy Fold 8, Pixel 9 Pro, iPhone 16 Pro Max, DDR5 RAM benchmarks), detailed specifications, and user reviews.
                    </p>
                  </div>
                </div>

                <div className="p-3 bg-indigo-50/60 border border-indigo-100 rounded-xl text-[11px] text-indigo-900 leading-relaxed">
                  <span className="font-bold">Manual Trigger Only:</span> This action is completely separate from app startup. The app will never overwrite your catalog automatically on reload.
                </div>

                <button
                  id="load-sample-seed-btn"
                  onClick={() => setConfirmSeedOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Load Sample Benchmark Data</span>
                </button>
              </div>

              {/* Clear Catalog Card */}
              <div className="p-5 rounded-2xl border border-rose-200 bg-rose-50/30 space-y-3">
                <div>
                  <h3 className="text-sm font-bold text-rose-950 flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4 text-rose-600" />
                    <span>Clear All Data (Start Blank)</span>
                  </h3>
                  <p className="text-xs text-rose-800 mt-1 leading-relaxed">
                    Wipes all products, specifications, reviews, and cached images. Allows you to build your personal product comparison catalog entirely from scratch.
                  </p>
                </div>

                <button
                  id="clear-all-data-btn"
                  onClick={() => setConfirmClearOpen(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear All Catalog Data</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: STORAGE HEALTH */}
          {activeTab === 'storage' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Active Storage Engine</div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>Local IndexedDB + localStorage</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    Operates 100% on your device with high-capacity IndexedDB for multi-megabyte photos and offline speed.
                  </p>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Cloud Status</div>
                  <div className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Zero Cloud Dependencies</span>
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">
                    No Firebase, Cloud Storage, or external databases are required. Your data never leaves your browser unless you export it.
                  </p>
                </div>
              </div>

              {/* Inventory Summary */}
              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                <div className="text-xs font-bold text-slate-800">Database Inventory</div>
                <div className="divide-y divide-slate-100 text-xs">
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Total Products</span>
                    <span className="font-bold text-slate-900">{productsCount}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Total Specifications</span>
                    <span className="font-bold text-slate-900">{specsCount}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Total User Reviews</span>
                    <span className="font-bold text-slate-900">{reviewsCount}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">App Users</span>
                    <span className="font-bold text-slate-900">{usersCount}</span>
                  </div>
                  <div className="py-2 flex items-center justify-between">
                    <span className="text-slate-600">Cached Photo Blobs (IndexedDB)</span>
                    <span className="font-bold text-indigo-600">{cachedMediaCount} files</span>
                  </div>
                </div>
              </div>
            </div>
          )}

        </div>

        {/* Modal Footer */}
        <div className="px-5 py-3.5 border-t border-slate-100 bg-slate-50/70 flex items-center justify-between shrink-0 text-xs">
          <span className="text-slate-500 text-[11px]">
            ProductCompare Hub · Local Storage Mode
          </span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold rounded-lg transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>

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
