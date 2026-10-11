import { useEffect, useState } from 'react';
import type { FC } from 'react';
import { Wifi, WifiOff, RefreshCw, ArrowLeft, Shield, Wrench, Download, CheckCircle2 } from 'lucide-react';
import { syncManager } from '../services/sync';
import { pdfCacheManager } from '../services/pdfCache';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface NavbarProps {
  currentSlotId: number | null;
  onBackToSlots: () => void;
  isAdmin: boolean;
  onToggleAdmin: () => void;
}

export const Navbar: FC<NavbarProps> = ({
  currentSlotId,
  onBackToSlots,
  isAdmin,
  onToggleAdmin,
}) => {
  const [syncState, setSyncState] = useState({
    isOnline: true,
    isSyncing: false,
    pendingCount: 0,
  });
  const [pdfCacheStatus, setPdfCacheStatus] = useState(pdfCacheManager.getState());

  useEffect(() => {
    const unsubSync = syncManager.subscribe(setSyncState);
    const unsubPdf = pdfCacheManager.subscribe(setPdfCacheStatus);
    return () => {
      unsubSync();
      unsubPdf();
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-background/95 border-b px-3 sm:px-4 py-2 flex items-center justify-between shrink-0">
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

        {/* PDF Offline Storage Indicator */}
        {pdfCacheStatus.totalDocs > 0 && (
          <Badge
            variant="outline"
            className={cn(
              "gap-1 text-xs font-mono font-medium transition-colors",
              pdfCacheStatus.allCached
                ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-400"
                : "border-blue-500/40 bg-blue-500/10 text-blue-400"
            )}
            title={
              pdfCacheStatus.allCached
                ? `All ${pdfCacheStatus.totalDocs} active PDF manuals are stored locally for offline use`
                : `Storing PDF manuals offline (${pdfCacheStatus.cachedDocs}/${pdfCacheStatus.totalDocs})...`
            }
          >
            {pdfCacheStatus.allCached ? (
              <>
                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                <span className="hidden sm:inline">PDFs Stored</span>
                <span className="sm:hidden">PDFs</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-3 w-3 text-blue-400 animate-spin" />
                <span className="hidden sm:inline">
                  Storing PDFs ({pdfCacheStatus.cachedDocs}/{pdfCacheStatus.totalDocs})
                </span>
                <span className="sm:hidden">
                  {pdfCacheStatus.cachedDocs}/{pdfCacheStatus.totalDocs}
                </span>
              </>
            )}
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

        {/* Certificate Download Button */}
        <a
          href="/api/v1/cert/ca.crt"
          download="assembly-pwa-ca.crt"
          className={buttonVariants({
            variant: 'outline',
            size: 'sm',
            className: 'gap-1.5 text-xs',
          })}
          title="Download Root CA Certificate for Android"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download Cert</span>
        </a>

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
