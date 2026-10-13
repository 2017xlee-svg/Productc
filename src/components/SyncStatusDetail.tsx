import React from 'react';
import {
  ArrowUpCircle,
  ArrowDownCircle,
  CheckCircle2,
  AlertCircle,
  Clock,
  Sparkles,
  Database,
  Layers,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';
import { SyncProgress, SyncHistoryLog } from '../types';

interface SyncStatusDetailProps {
  isSyncing: boolean;
  isSyncingTo: boolean;
  isSyncingFrom: boolean;
  currentProgress: SyncProgress | null;
  lastLogs: SyncHistoryLog[];
  onTriggerPush?: () => void;
  onTriggerPull?: () => void;
}

export const SyncStatusDetail: React.FC<SyncStatusDetailProps> = ({
  isSyncing,
  isSyncingTo,
  isSyncingFrom,
  currentProgress,
  lastLogs,
  onTriggerPush,
  onTriggerPull,
}) => {
  const activeAction = isSyncingTo ? 'push' : isSyncingFrom ? 'pull' : currentProgress?.action;

  return (
    <div id="sync-status-detail-panel" className="space-y-4">
      {/* 1. Live Progress Card (Active when syncing or just finished) */}
      {isSyncing && (
        <div
          id="sync-live-progress-card"
          className={`p-4 rounded-2xl border transition-all animate-in fade-in duration-200 ${
            activeAction === 'push'
              ? 'bg-indigo-50/80 border-indigo-200 text-indigo-950'
              : 'bg-slate-900 border-slate-800 text-white shadow-lg'
          }`}
        >
          {/* Header Row */}
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              <div
                className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                  activeAction === 'push'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-indigo-500 text-white'
                }`}
              >
                {activeAction === 'push' ? (
                  <ArrowUpCircle className="w-4 h-4 animate-spin" />
                ) : (
                  <ArrowDownCircle className="w-4 h-4 animate-spin" />
                )}
              </div>
              <div>
                <span className="font-bold text-xs sm:text-sm">
                  {activeAction === 'push'
                    ? 'Syncing to Google Cloud Firestore...'
                    : 'Pulling from Google Cloud Firestore...'}
                </span>
                <p
                  className={`text-[11px] ${
                    activeAction === 'push' ? 'text-indigo-700' : 'text-slate-400'
                  }`}
                >
                  Step {currentProgress?.stepNumber || 1} of {currentProgress?.totalSteps || (activeAction === 'push' ? 6 : 5)}: {currentProgress?.stage || 'Connecting...'}
                </p>
              </div>
            </div>

            <div className="text-right">
              <span
                className={`text-sm sm:text-base font-extrabold font-mono ${
                  activeAction === 'push' ? 'text-indigo-600' : 'text-indigo-400'
                }`}
              >
                {currentProgress ? `${Math.round(currentProgress.percent)}%` : 'Working...'}
              </span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-slate-200/60 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden my-2">
            <div
              className={`h-full transition-all duration-300 rounded-full ${
                activeAction === 'push'
                  ? 'bg-gradient-to-r from-indigo-500 to-indigo-600'
                  : 'bg-gradient-to-r from-indigo-400 to-blue-500'
              }`}
              style={{ width: `${Math.min(100, Math.max(8, currentProgress?.percent || 15))}%` }}
            />
          </div>

          {/* Status message & processed count detail */}
          <div className="flex items-center justify-between text-[11px] mt-2 pt-1.5 border-t border-indigo-200/40 dark:border-slate-800">
            <span className="truncate pr-2 font-medium flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-ping inline-block" />
              {currentProgress?.detail || 'Processing documents...'}
            </span>

            {typeof currentProgress?.itemsProcessed === 'number' && (
              <span className="font-mono font-semibold shrink-0">
                {currentProgress.itemsProcessed}
                {currentProgress.itemsTotal ? ` / ${currentProgress.itemsTotal}` : ''} items
              </span>
            )}
          </div>
        </div>
      )}

      {/* 2. Step-by-Step Sync Workflow Breakdown */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-slate-800 flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            <span>Sync Architecture & Safety Flow</span>
          </span>
          <span className="text-[10px] text-slate-500 font-mono">
            Direct Native Firestore SDK
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
          <div className="p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-1">
            <div className="font-semibold text-indigo-700 flex items-center gap-1">
              <ArrowUpCircle className="w-3.5 h-3.5" />
              <span>Push (Sync to Cloud)</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              1. Uploads media & large payloads to Firebase Cloud Storage.<br />
              2. Batches lightweight document nodes with CDN URLs.<br />
              3. Synchronizes spec rows & user reviews.<br />
              4. Atomic commit with automated doc-level fallback.
            </p>
          </div>

          <div className="p-2.5 bg-white rounded-lg border border-slate-200/80 space-y-1">
            <div className="font-semibold text-slate-800 flex items-center gap-1">
              <ArrowDownCircle className="w-3.5 h-3.5 text-indigo-600" />
              <span>Pull (Pull from Cloud)</span>
            </div>
            <p className="text-slate-600 leading-relaxed">
              1. Queries Firestore collections /products, /specs, /reviews.<br />
              2. Resolves Cloud Storage URLs and document metadata.<br />
              3. Instant zero-loss update for offline readiness.<br />
              4. High-performance cache directly in local database.
            </p>
          </div>
        </div>
      </div>

      {/* 3. Sync History & Audit Log */}
      <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
        <div className="px-4 py-2.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
          <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>Recent Sync Audit Log</span>
          </span>
          <span className="text-[10px] text-slate-500">
            {lastLogs.length} session{lastLogs.length === 1 ? '' : 's'} recorded
          </span>
        </div>

        {lastLogs.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500">
            No sync operations logged in this session yet. Trigger a Push or Pull to view live telemetry.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 max-h-56 overflow-y-auto">
            {lastLogs.map((log) => (
              <div key={log.id} className="p-3 text-xs flex items-start justify-between gap-3 hover:bg-slate-50/60 transition-colors">
                <div className="space-y-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold text-[10px] ${
                        log.action === 'push'
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      {log.action === 'push' ? (
                        <ArrowUpCircle className="w-3 h-3" />
                      ) : (
                        <ArrowDownCircle className="w-3 h-3" />
                      )}
                      {log.action === 'push' ? 'PUSH (TO CLOUD)' : 'PULL (FROM CLOUD)'}
                    </span>

                    <span
                      className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        log.status === 'success'
                          ? 'text-emerald-700 bg-emerald-50'
                          : log.status === 'failed'
                          ? 'text-rose-700 bg-rose-50'
                          : 'text-amber-700 bg-amber-50'
                      }`}
                    >
                      {log.status === 'success' && <CheckCircle2 className="w-3 h-3" />}
                      {log.status === 'failed' && <AlertCircle className="w-3 h-3" />}
                      {log.status.toUpperCase()}
                    </span>

                    {log.durationMs && (
                      <span className="text-[10px] text-slate-400 font-mono">
                        {(log.durationMs / 1000).toFixed(1)}s
                      </span>
                    )}
                  </div>

                  <p className="text-slate-700 font-medium text-[11px] leading-relaxed break-words">
                    {log.message}
                  </p>

                  {/* Summary counts badge row */}
                  {log.counts && (
                    <div className="flex items-center gap-2 pt-0.5 text-[10px] text-slate-500 font-mono">
                      {typeof log.counts.products === 'number' && (
                        <span>{log.counts.products} products</span>
                      )}
                      {typeof log.counts.specifications === 'number' && (
                        <span>• {log.counts.specifications} specs</span>
                      )}
                      {typeof log.counts.reviews === 'number' && (
                        <span>• {log.counts.reviews} reviews</span>
                      )}
                      {typeof log.counts.images === 'number' && log.counts.images > 0 && (
                        <span>• {log.counts.images} photos</span>
                      )}
                    </div>
                  )}

                  {/* Step detail bullet toggle or snippet */}
                  {log.details && log.details.length > 0 && (
                    <div className="pt-1 text-[10px] text-slate-500 space-y-0.5">
                      {log.details.slice(0, 3).map((d, i) => (
                        <div key={i} className="flex items-center gap-1">
                          <span className="w-1 h-1 rounded-full bg-slate-300" />
                          <span className="truncate">{d}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="text-[10px] text-slate-400 font-mono shrink-0 whitespace-nowrap pt-1">
                  {new Date(log.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
