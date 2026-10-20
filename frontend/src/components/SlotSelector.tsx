import { useState, useEffect } from "react";
import type { FC } from "react";
import {
  ChevronRight,
  MessageSquare,
  AlertCircle,
  Clock,
  RefreshCw,
} from "lucide-react";
import type { SlotSummary } from "../types";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { pdfCacheManager } from "../services/pdfCache";

interface SlotSelectorProps {
  slots: SlotSummary[];
  onSelectSlot: (slotId: number) => void;
  isLoading: boolean;
}

export const SlotSelector: FC<SlotSelectorProps> = ({
  slots,
  onSelectSlot,
  isLoading,
}) => {
  const [cacheStatus, setCacheStatus] = useState(pdfCacheManager.getState());

  useEffect(() => {
    return pdfCacheManager.subscribe(setCacheStatus);
  }, []);

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-6 text-center md:text-left">
        <h2 className="text-xl md:text-2xl font-bold text-foreground tracking-tight">
          Assembly Manuals
        </h2>
        <p className="text-muted-foreground text-sm mt-1">
          Select any of the 10 document slots to view instructions and submit
          comments.
        </p>
      </div>

      {isLoading && slots.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 rounded-xl bg-muted/40 animate-pulse border border-border"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {slots.map((slot) => {
            const hasDoc = Boolean(slot.live_document);
            const doc = slot.live_document;
            const isCached =
              hasDoc && doc?.url
                ? Boolean(cacheStatus.cachedUrls[doc.url])
                : false;

            return (
              <Card
                key={slot.slot_id}
                onClick={() => {
                  if (hasDoc) onSelectSlot(slot.slot_id);
                }}
                className={cn(
                  "group relative flex flex-col justify-between text-left p-4 transition-all duration-150",
                  hasDoc
                    ? "cursor-pointer hover:border-ring/50 hover:bg-accent/40 active:scale-[0.99] shadow-sm"
                    : "opacity-50 cursor-not-allowed bg-muted/20 border-dashed",
                )}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <Badge
                      variant={hasDoc ? "outline" : "secondary"}
                      className="text-xs font-mono font-medium"
                    >
                      SLOT{" "}
                      {slot.slot_id < 10 ? `0${slot.slot_id}` : slot.slot_id}
                    </Badge>

                    <div className="flex items-center gap-1.5">
                      {hasDoc && isCached && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono px-1.5 py-0 h-4.5 border-emerald-500/40 bg-emerald-500/10 text-emerald-400 gap-1 font-medium"
                          title="PDF is stored locally for offline use"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_4px_rgba(16,185,129,0.8)]" />
                          <span>Stored</span>
                        </Badge>
                      )}
                      {hasDoc && cacheStatus.isCaching && !isCached && (
                        <Badge
                          variant="outline"
                          className="text-[10px] font-mono px-1.5 py-0 h-4.5 border-blue-500/40 bg-blue-500/10 text-blue-400 gap-1 font-medium animate-pulse"
                          title="Downloading PDF for offline storage..."
                        >
                          <RefreshCw className="w-2.5 h-2.5 animate-spin text-blue-400" />
                          <span>Storing...</span>
                        </Badge>
                      )}
                      {hasDoc && doc?.version && (
                        <Badge
                          variant="secondary"
                          className="text-[11px] font-mono font-medium"
                        >
                          v{doc.version}
                        </Badge>
                      )}
                    </div>
                  </div>

                  <h3 className="font-medium text-sm text-card-foreground line-clamp-2 leading-snug">
                    {hasDoc ? doc?.title : "No Manual Uploaded"}
                  </h3>

                  {hasDoc && doc?.upload_date && (
                    <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-2">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span>
                        {new Date(doc.upload_date).toLocaleDateString()}
                      </span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-border flex items-center justify-between">
                  {hasDoc ? (
                    <>
                      <div className="flex items-center gap-2">
                        {slot.total_feedback > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{slot.total_feedback}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">
                            Ready
                          </span>
                        )}
                      </div>
                      <div className="flex items-center text-xs font-medium text-muted-foreground group-hover:text-foreground">
                        <span>Open</span>
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Empty</span>
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
};
