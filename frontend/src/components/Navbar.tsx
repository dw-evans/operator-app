import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { Wifi, WifiOff, RefreshCw, ArrowLeft, Shield, Wrench } from 'lucide-react';
import { syncManager } from '../services/sync';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

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
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-3">
        {currentSlotId !== null ? (
          <Button
            variant="outline"
            size="sm"
            onClick={onBackToSlots}
            className="gap-1.5"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>All Manuals</span>
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Wrench className="h-4 w-4" />
            </div>
            <div>
              <h1 className="font-semibold text-sm leading-none tracking-tight">
                Assembly PWA
              </h1>
              <p className="text-xs text-muted-foreground leading-none mt-1">
                Shop Floor System
              </p>
            </div>
          </div>
        )}

        {currentSlotId !== null && (
          <div className="flex items-center gap-2 pl-2">
            <Separator orientation="vertical" className="h-4" />
            <Badge variant="outline">Slot {currentSlotId}</Badge>
            <span className="font-medium text-xs truncate max-w-xs md:max-w-md">
              {currentSlotTitle || `Manual ${currentSlotId}`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Sync Status Badge */}
        {syncState.pendingCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncManager.triggerSync()}
            disabled={syncState.isSyncing || !syncState.isOnline}
            title={syncState.isOnline ? 'Click to sync now' : 'Offline: will sync automatically when connected'}
            className="gap-1.5 text-xs text-amber-500 border-amber-500/30 hover:bg-amber-500/10"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncState.isSyncing ? 'animate-spin' : ''}`} />
            <span>
              {syncState.isSyncing
                ? 'Syncing...'
                : `${syncState.pendingCount} Queued`}
            </span>
          </Button>
        ) : (
          <Badge variant="secondary" className="hidden sm:inline-flex text-xs">
            All Synced
          </Badge>
        )}

        {/* Network Indicator */}
        <Badge
          variant={syncState.isOnline ? 'outline' : 'destructive'}
          className="gap-1 text-xs"
        >
          {syncState.isOnline ? (
            <>
              <Wifi className="h-3 w-3" />
              <span className="hidden sm:inline">Online</span>
            </>
          ) : (
            <>
              <WifiOff className="h-3 w-3" />
              <span>Offline</span>
            </>
          )}
        </Badge>

        {/* Admin Portal Toggle */}
        <Button
          variant={isAdmin ? 'default' : 'outline'}
          size="sm"
          onClick={onToggleAdmin}
          className="gap-1.5 text-xs"
        >
          <Shield className="h-3.5 w-3.5" />
          <span>{isAdmin ? 'Exit Admin' : 'Admin'}</span>
        </Button>
      </div>
    </header>
  );
};
