import { useEffect, useState } from "react";
import type { FC } from "react";
import {
  Wifi,
  WifiOff,
  RefreshCw,
  ArrowLeft,
  Shield,
  Wrench,
  Download,
} from "lucide-react";
import { syncManager, type SyncState } from "../services/sync";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface NavbarProps {
  currentSlotId: number | null;
  onBackToSlots: () => void;
  isAdmin: boolean;
  onToggleAdmin: () => void;
}

const formatSyncDateTime = (date: Date): string => {
  const d = new Date(date);
  const datePart = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  return `${datePart}, ${timePart}`;
};

export const Navbar: FC<NavbarProps> = ({
  currentSlotId,
  onBackToSlots,
  isAdmin,
  onToggleAdmin,
}) => {
  const [syncState, setSyncState] = useState<SyncState>(syncManager.getState());

  useEffect(() => {
    return syncManager.subscribe(setSyncState);
  }, []);

  return (
    <header className="sticky top-0 z-40 bg-background/95 border-b px-3 sm:px-4 py-2 flex items-center justify-between shrink-0">
      <div className="flex items-center gap-3">
        {currentSlotId !== null ? (
          <Button
            variant="outline"
            size="icon"
            onClick={onBackToSlots}
            title="All Manuals"
            aria-label="All Manuals"
          >
            <ArrowLeft className="h-4 w-4" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold">
              <Wrench className="h-4 w-4" />
            </div>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2">
        {/* Lengthened Sync Button with Datetime of Successful Sync */}
        {syncState.pendingCount > 0 ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncManager.triggerSync()}
            disabled={syncState.isSyncing || !syncState.isOnline}
            title={
              syncState.isOnline
                ? "Click to sync queued notes now"
                : "Offline: will sync automatically when reconnected"
            }
            className="gap-1.5 text-xs font-mono font-medium text-amber-500 border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 shadow-sm"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncState.isSyncing ? "animate-spin" : ""}`}
            />
            <span>
              {syncState.isSyncing
                ? "Syncing..."
                : `${syncState.pendingCount} Queued`}
            </span>
            {syncState.lastSyncedAt && (
              <span className="text-[11px] text-amber-500/80 border-l border-amber-500/30 pl-1.5 hidden md:inline">
                Last: {formatSyncDateTime(syncState.lastSyncedAt)}
              </span>
            )}
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncManager.triggerSync()}
            disabled={syncState.isSyncing || !syncState.isOnline}
            title={
              syncState.lastSyncedAt
                ? `Successfully synced with server: ${syncState.lastSyncedAt.toLocaleString()}. Click to re-sync.`
                : "All synced with server. Click to re-sync."
            }
            className="gap-1.5 text-xs font-mono font-medium text-muted-foreground hover:text-foreground border-border/80 bg-muted/20 hover:bg-muted/40 cursor-pointer shadow-sm transition-colors"
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5 text-emerald-400",
                syncState.isSyncing && "animate-spin text-primary",
              )}
            />
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-foreground">Synced</span>
              {syncState.lastSyncedAt && (
                <span className="text-muted-foreground text-[11px] font-normal">
                  {formatSyncDateTime(syncState.lastSyncedAt)}
                </span>
              )}
            </span>
          </Button>
        )}

        {/* Network Indicator */}
        <Badge
          variant={syncState.isOnline ? "outline" : "destructive"}
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
            variant: "outline",
            size: "sm",
            className: "gap-1.5 text-xs",
          })}
          title="Download Root CA Certificate for Android"
        >
          <Download className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Download Cert</span>
        </a>

        {/* Admin Portal Toggle */}
        <Button
          variant={isAdmin ? "default" : "outline"}
          size="sm"
          onClick={onToggleAdmin}
          className="gap-1.5 text-xs"
        >
          <Shield className="h-3.5 w-3.5" />
          <span>{isAdmin ? "Exit Admin" : "Admin"}</span>
        </Button>
      </div>
    </header>
  );
};
