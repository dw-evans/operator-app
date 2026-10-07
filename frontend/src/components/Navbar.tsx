import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { Wifi, WifiOff, RefreshCw, ArrowLeft, Shield, Wrench } from 'lucide-react';
import { syncManager } from '../services/sync';

interface NavbarProps {
  currentSlotId: number | null;
  currentSlotTitle: string | null;
  onBackToSlots: () => void;
  isAdmin: boolean;
  onToggleAdmin: () => void;
}

export const Navbar: FC<NavbarProps> = ({
  currentSlotId,
  currentSlotTitle,
  onBackToSlots,
  isAdmin,
  onToggleAdmin,
}) => {
  const [syncState, setSyncState] = useState({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
  });

  useEffect(() => {
    return syncManager.subscribe(setSyncState);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-slate-900/95 backdrop-blur border-b border-slate-800 px-4 py-3 flex items-center justify-between shadow-md">
      <div className="flex items-center gap-3">
        {currentSlotId !== null ? (
          <button
            onClick={onBackToSlots}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-slate-200 px-3.5 py-2 rounded-lg font-medium text-sm transition-colors cursor-pointer border border-slate-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Manuals</span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center font-bold text-white shadow-inner">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h1 className="font-bold text-base text-slate-100 tracking-tight leading-none">
                Assembly PWA
              </h1>
              <p className="text-[11px] text-slate-400 leading-none mt-0.5">
                Shop Floor Station System
              </p>
            </div>
          </div>
        )}

        {currentSlotId !== null && (
          <div className="flex items-center gap-2 pl-2 border-l border-slate-800">
            <span className="bg-blue-900/50 text-blue-400 border border-blue-800 text-xs font-semibold px-2 py-0.5 rounded">
              Slot {currentSlotId}
            </span>
            <span className="font-semibold text-sm text-slate-200 truncate max-w-xs md:max-w-md">
              {currentSlotTitle || `Manual ${currentSlotId}`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {/* Sync Status Badge */}
        {syncState.pendingCount > 0 ? (
          <button
            onClick={() => syncManager.triggerSync()}
            disabled={syncState.isSyncing || !syncState.isOnline}
            title={syncState.isOnline ? 'Click to sync now' : 'Offline: will sync automatically when connected'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-950/80 text-amber-300 border border-amber-800 animate-pulse hover:bg-amber-900 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncState.isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {syncState.isSyncing
                ? 'Syncing...'
                : `${syncState.pendingCount} Queued`}
            </span>
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-slate-400 font-medium px-2 py-0.5 rounded bg-slate-800/60 border border-slate-800">
            <span>All Synced</span>
          </div>
        )}

        {/* Network Indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${
            syncState.isOnline
              ? 'bg-emerald-950/70 text-emerald-300 border-emerald-800/80'
              : 'bg-rose-950/70 text-rose-300 border-rose-800/80'
          }`}
        >
          {syncState.isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5 text-rose-400" />
              <span>Offline Mode</span>
            </>
          )}
        </div>

        {/* Admin Portal Toggle */}
        <button
          onClick={onToggleAdmin}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
            isAdmin
              ? 'bg-purple-600 text-white border-purple-500 shadow-sm'
              : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>{isAdmin ? 'Exit Admin' : 'Admin'}</span>
        </button>
      </div>
    </header>
  );
};
