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
        <h2 className="text-2xl font-bold text-slate-100 tracking-tight">
          Assembly Manuals
        </h2>
        <p className="text-slate-400 text-sm mt-1">
          Select any of the 10 document slots below to view instructions and submit feedback.
        </p>
      </div>

      {isLoading && slots.length === 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {Array.from({ length: 10 }).map((_, idx) => (
            <div
              key={idx}
              className="h-44 rounded-xl bg-slate-800/50 animate-pulse border border-slate-700/50"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {slots.map((slot) => {
            const hasDoc = Boolean(slot.live_document);
            const doc = slot.live_document;

            return (
              <button
                key={slot.slot_id}
                onClick={() => onSelectSlot(slot.slot_id)}
                disabled={!hasDoc}
                className={`relative flex flex-col justify-between text-left p-4 rounded-xl border transition-all duration-150 cursor-pointer ${
                  hasDoc
                    ? 'bg-slate-800/90 hover:bg-slate-750 border-slate-700 hover:border-blue-500/80 active:scale-[0.98] shadow-sm hover:shadow-md hover:shadow-blue-500/10'
                    : 'bg-slate-900/40 border-slate-800/70 opacity-60 cursor-not-allowed'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-2.5">
                    <span
                      className={`text-xs font-bold px-2 py-0.5 rounded tracking-wider ${
                        hasDoc
                          ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                          : 'bg-slate-800 text-slate-500 border border-slate-700'
                      }`}
                    >
                      SLOT {slot.slot_id < 10 ? `0${slot.slot_id}` : slot.slot_id}
                    </span>

                    {hasDoc && doc?.version && (
                      <span className="text-[11px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800/80 px-1.5 py-0.5 rounded">
                        v{doc.version}
                      </span>
                    )}
                  </div>

                  <h3 className="font-semibold text-sm md:text-base text-slate-100 line-clamp-2 leading-snug">
                    {hasDoc ? doc?.title : 'No Manual Uploaded'}
                  </h3>

                  {hasDoc && doc?.upload_date && (
                    <div className="flex items-center gap-1 text-[11px] text-slate-400 mt-2">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{new Date(doc.upload_date).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                <div className="mt-4 pt-3 border-t border-slate-750 flex items-center justify-between">
                  {hasDoc ? (
                    <>
                      <div className="flex items-center gap-2">
                        {slot.total_feedback > 0 ? (
                          <div className="flex items-center gap-1 text-xs text-amber-400">
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>{slot.total_feedback}</span>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-500">Ready</span>
                        )}
                      </div>
                      <div className="flex items-center text-xs font-medium text-blue-400 group-hover:text-blue-300">
                        <span>Open</span>
                        <ChevronRight className="w-4 h-4 ml-0.5" />
                      </div>
                    </>
                  ) : (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
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
