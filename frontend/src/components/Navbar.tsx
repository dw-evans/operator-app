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
    <header className="sticky top-0 z-40 bg-zinc-900/90 backdrop-blur border-b border-zinc-800 px-4 py-3 flex items-center justify-between shadow-sm">
      <div className="flex items-center gap-3">
        {currentSlotId !== null ? (
          <button
            onClick={onBackToSlots}
            className="flex items-center gap-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-100 px-3 py-1.5 rounded-md font-medium text-xs transition-colors cursor-pointer border border-zinc-700"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>All Manuals</span>
          </button>
        ) : (
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-md bg-zinc-100 text-zinc-900 flex items-center justify-center font-bold">
              <Wrench className="w-3.5 h-3.5" />
            </div>
            <div>
              <h1 className="font-semibold text-sm text-zinc-100 tracking-tight leading-none">
                Assembly PWA
              </h1>
              <p className="text-[11px] text-zinc-400 leading-none mt-1">
                Shop Floor System
              </p>
            </div>
          </div>
        )}

        {currentSlotId !== null && (
          <div className="flex items-center gap-2 pl-3 border-l border-zinc-800">
            <span className="bg-zinc-800 text-zinc-200 border border-zinc-700 text-xs font-mono font-medium px-2 py-0.5 rounded-md">
              Slot {currentSlotId}
            </span>
            <span className="font-medium text-xs text-zinc-200 truncate max-w-xs md:max-w-md">
              {currentSlotTitle || `Manual ${currentSlotId}`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2.5">
        {/* Sync Status Badge */}
        {syncState.pendingCount > 0 ? (
          <button
            onClick={() => syncManager.triggerSync()}
            disabled={syncState.isSyncing || !syncState.isOnline}
            title={syncState.isOnline ? 'Click to sync now' : 'Offline: will sync automatically when connected'}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-zinc-800 text-amber-400 border border-zinc-700 hover:bg-zinc-750 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncState.isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {syncState.isSyncing
                ? 'Syncing...'
                : `${syncState.pendingCount} Queued`}
            </span>
          </button>
        ) : (
          <div className="hidden sm:flex items-center gap-1 text-[11px] text-zinc-400 font-medium px-2.5 py-1 rounded-md bg-zinc-900 border border-zinc-800">
            <span>All Synced</span>
          </div>
        )}

        {/* Network Indicator */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium border ${
            syncState.isOnline
              ? 'bg-zinc-900 text-emerald-400 border-zinc-800'
              : 'bg-zinc-900 text-rose-400 border-zinc-800'
          }`}
        >
          {syncState.isOnline ? (
            <>
              <Wifi className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="w-3.5 h-3.5" />
              <span>Offline</span>
            </>
          )}
        </div>

        {/* Admin Portal Toggle */}
        <button
          onClick={onToggleAdmin}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer border ${
            isAdmin
              ? 'bg-zinc-100 text-zinc-900 border-zinc-200 shadow-sm'
              : 'bg-zinc-900 hover:bg-zinc-800 text-zinc-300 border-zinc-800'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>{isAdmin ? 'Exit Admin' : 'Admin'}</span>
        </button>
      </div>
    </header>
  );
};
