import type { FC } from 'react';
import { ChevronRight, MessageSquare, AlertCircle, Clock } from 'lucide-react';
import type { SlotSummary } from '../types';

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
  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6">
      <div className="mb-6 text-center md:text-left">
        <h2 className="text-xl md:text-2xl font-semibold text-zinc-100 tracking-tight">
          Assembly Manuals
        </h2>
        <p className="text-zinc-400 text-sm mt-1">
          Select any of the 10 document slots to view instructions and submit station notes.
        </p>
      </div>

      {isLoading && slots.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 rounded-lg bg-zinc-900/60 animate-pulse border border-zinc-800"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3.5">
          {slots.map((slot) => {
            const hasDoc = Boolean(slot.live_document);
            const doc = slot.live_document;

            return (
              <button
                key={slot.slot_id}
                onClick={() => onSelectSlot(slot.slot_id)}
                disabled={!hasDoc}
                className={`group relative flex flex-col justify-between text-left p-4 rounded-lg border transition-all duration-150 cursor-pointer ${
                  hasDoc
                    ? 'bg-zinc-900 hover:bg-zinc-850 border-zinc-800 hover:border-zinc-700 active:scale-[0.99] shadow-sm'
                    : 'bg-zinc-950/40 border-zinc-800/60 opacity-50 cursor-not-allowed'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span
                      className={`text-xs font-mono font-medium px-2 py-0.5 rounded-md ${
                        hasDoc
                          ? 'bg-zinc-800 text-zinc-200 border border-zinc-700'
                          : 'bg-zinc-900 text-zinc-500 border border-zinc-800'
                      }`}
                    >
                      SLOT {slot.slot_id < 10 ? `0${slot.slot_id}` : slot.slot_id}
                    </span>

                    {hasDoc && doc?.version && (
                      <span className="text-[11px] font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 px-1.5 py-0.5 rounded-md">
                        v{doc.version}
                      </span>
                    )}
                  </div>

                  <h3 className="font-medium text-sm text-zinc-100 line-clamp-2 leading-snug">
                    {hasDoc ? doc?.title : 'No Manual Uploaded'}
                  </h3>

                  {hasDoc && doc?.upload_date && (
                    <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 mt-2">
                      <Clock className="w-3 h-3 text-zinc-500" />
                      <span>{new Date(doc.upload_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-zinc-800 flex items-center justify-between">
                  {hasDoc ? (
                    <>
                      <div className="flex items-center gap-2">
                        {slot.total_feedback > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-zinc-300">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                            <span>{slot.total_feedback}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-zinc-500">Ready</span>
                        )}
                      </div>
                      <div className="flex items-center text-xs font-medium text-zinc-300 group-hover:text-zinc-100">
                        <span>Open</span>
                        <ChevronRight className="w-3.5 h-3.5 ml-0.5 transition-transform group-hover:translate-x-0.5" />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-zinc-500">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Empty</span>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
