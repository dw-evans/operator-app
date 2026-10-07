import { useState, useEffect } from 'react';
import type { FC, FormEvent } from 'react';
import {
  Upload,
  History,
  CheckCircle,
  Download,
  X,
  Lock,
  MessageSquare,
  RefreshCw,
} from 'lucide-react';
import type { DocumentRevision, FeedbackItem, SlotSummary } from '../types';
import {
  fetchSlots,
  fetchSlotHistory,
  adminUploadManual,
  checkPinStatus,
  verifyPin,
  fetchSlotFeedback,
  updateFeedbackStatus,
} from '../services/api';

interface AdminPortalProps {
  onClose: () => void;
  onSlotsUpdated: () => void;
}

export const AdminPortal: FC<AdminPortalProps> = ({ onClose, onSlotsUpdated }) => {
  const [isPinLocked, setIsPinLocked] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [pinError, setPinError] = useState<string | null>(null);

  const [slots, setSlots] = useState<SlotSummary[]>([]);
  const [isLoadingSlots, setIsLoadingSlots] = useState(false);

  // Selected slot for revision history modal
  const [historySlotId, setHistorySlotId] = useState<number | null>(null);
  const [revisions, setRevisions] = useState<DocumentRevision[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  // Upload state per slot
  const [uploadingSlotId, setUploadingSlotId] = useState<number | null>(null);
  const [uploadSuccess, setUploadSuccess] = useState<string | null>(null);

  // Feedback audit state
  const [auditSlotId, setAuditSlotId] = useState<number | null>(null);
  const [auditFeedback, setAuditFeedback] = useState<FeedbackItem[]>([]);
  const [isLoadingAudit, setIsLoadingAudit] = useState(false);

  useEffect(() => {
    checkPin();
    loadSlots();
  }, []);

  const checkPin = async () => {
    try {
      const res = await checkPinStatus();
      if (res.pin_required) {
        const sessionUnlocked = sessionStorage.getItem('assembly_admin_unlocked') === 'true';
        setIsPinLocked(!sessionUnlocked);
      } else {
        setIsPinLocked(false);
      }
    } catch {
      setIsPinLocked(false);
    }
  };

  const handleVerifyPin = async (e: FormEvent) => {
    e.preventDefault();
    setPinError(null);
    try {
      const res = await verifyPin(pinInput);
      if (res.valid) {
        setIsPinLocked(false);
        sessionStorage.setItem('assembly_admin_unlocked', 'true');
      } else {
        setPinError('Incorrect PIN. Please try again.');
      }
    } catch {
      setPinError('Failed to verify PIN with server.');
    }
  };

  const loadSlots = async () => {
    setIsLoadingSlots(true);
    try {
      const data = await fetchSlots();
      setSlots(data);
    } catch (err) {
      console.error('Failed to load slots in admin:', err);
    } finally {
      setIsLoadingSlots(false);
    }
  };

  const handleUpload = async (slotId: number, file: File) => {
    setUploadingSlotId(slotId);
    setUploadSuccess(null);

    try {
      await adminUploadManual(slotId, file);
      setUploadSuccess(`Slot ${slotId} updated with ${file.name}`);
      await loadSlots();
      onSlotsUpdated();
    } catch (err: any) {
      alert(`Upload failed: ${err.message}`);
    } finally {
      setUploadingSlotId(null);
    }
  };

  const openHistory = async (slotId: number) => {
    setHistorySlotId(slotId);
    setIsLoadingHistory(true);
    try {
      const history = await fetchSlotHistory(slotId);
      setRevisions(history);
    } catch (err) {
      console.error('Failed to load history:', err);
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const openAudit = async (slotId: number) => {
    setAuditSlotId(slotId);
    setIsLoadingAudit(true);
    try {
      const items = await fetchSlotFeedback(slotId);
      setAuditFeedback(items);
    } catch (err) {
      console.error('Failed to load audit feedback:', err);
    } finally {
      setIsLoadingAudit(false);
    }
  };

  const handleUpdateStatus = async (fbId: string, newStatus: 'open' | 'reviewed' | 'resolved') => {
    try {
      await updateFeedbackStatus(fbId, newStatus);
      setAuditFeedback((prev) =>
        prev.map((item) => (item.id === fbId ? { ...item, status: newStatus } : item))
      );
      await loadSlots();
      onSlotsUpdated();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  if (isPinLocked) {
    return (
      <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="bg-zinc-900 border border-zinc-800 rounded-lg p-6 max-w-sm w-full shadow-lg text-center">
          <div className="w-10 h-10 rounded-md bg-zinc-800 text-zinc-200 border border-zinc-700 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-5 h-5" />
          </div>
          <h2 className="text-base font-semibold text-zinc-100">Admin PIN Required</h2>
          <p className="text-xs text-zinc-400 mt-1 mb-4">
            Enter administrator PIN to access document and station management.
          </p>

          <form onSubmit={handleVerifyPin} className="space-y-3">
            <input
              type="password"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="PIN"
              className="w-full bg-zinc-950 border border-zinc-800 rounded-md px-4 py-2 text-center text-lg tracking-widest text-zinc-100 focus:outline-none focus:border-zinc-500 font-mono"
            />

            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 py-2 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-medium transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-2 rounded-md bg-zinc-100 hover:bg-zinc-200 text-zinc-900 text-xs font-medium transition-colors shadow-sm cursor-pointer"
              >
                Unlock
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-6 space-y-6">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-xl md:text-2xl font-semibold text-zinc-100 tracking-tight flex items-center gap-2">
            <span>Management Portal</span>
            <span className="text-xs font-mono font-medium bg-zinc-800 text-zinc-300 border border-zinc-700 px-2 py-0.5 rounded-md">
              Slots 1–10
            </span>
          </h2>
          <p className="text-xs text-zinc-400 mt-1">
            Manage manual versions, audit revisions, and review station feedback.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSlots}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs rounded-md transition-colors border border-zinc-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSlots ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 rounded-md transition-colors border border-zinc-700 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {uploadSuccess && (
        <div className="p-3 bg-zinc-900 border border-zinc-800 text-emerald-400 rounded-md text-xs md:text-sm font-medium flex items-center gap-2">
          <CheckCircle className="w-4 h-4 shrink-0" />
          <span>{uploadSuccess}</span>
        </div>
      )}

      {/* 10 Slots Management Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {slots.map((slot) => {
          const doc = slot.live_document;
          const isSlotUploading = uploadingSlotId === slot.slot_id;

          return (
            <div
              key={slot.slot_id}
              className="bg-zinc-900 border border-zinc-800 rounded-lg p-4 shadow-sm flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono font-medium px-2 py-0.5 bg-zinc-800 text-zinc-200 border border-zinc-700 rounded-md">
                      SLOT {slot.slot_id}
                    </span>
                    {doc ? (
                      <span className="text-xs font-mono font-medium bg-zinc-800 text-zinc-100 border border-zinc-700 px-2 py-0.5 rounded-md">
                        Rev v{doc.version}
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500 bg-zinc-950 px-2 py-0.5 rounded-md border border-zinc-850">
                        Empty
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => openHistory(slot.slot_id)}
                      className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-750 px-2.5 py-1 rounded-md transition-colors border border-zinc-700 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Revisions ({slot.total_revisions})</span>
                    </button>

                    <button
                      onClick={() => openAudit(slot.slot_id)}
                      className="flex items-center gap-1 text-xs text-zinc-300 hover:text-zinc-100 bg-zinc-800 hover:bg-zinc-750 border border-zinc-700 px-2.5 py-1 rounded-md transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Notes ({slot.total_feedback})</span>
                    </button>
                  </div>
                </div>

                {doc ? (
                  <div className="bg-zinc-950 p-3 rounded-md border border-zinc-800/90 mb-3 text-xs space-y-1">
                    <div className="font-medium text-zinc-100 text-sm truncate">{doc.title}</div>
                    <div className="text-zinc-400 flex items-center justify-between">
                      <span className="truncate max-w-[200px]">{doc.original_filename}</span>
                      <span className="font-mono text-[10px] text-zinc-500">MD5: {doc.file_hash}</span>
                    </div>
                    <div className="text-zinc-500 text-[11px] flex items-center justify-between pt-1">
                      <span>Uploaded {new Date(doc.upload_date).toLocaleDateString()}</span>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-zinc-300 hover:text-zinc-100 underline flex items-center gap-1"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="bg-zinc-950/60 p-3 rounded-md border border-zinc-800/60 mb-3 text-xs text-zinc-500 text-center">
                    No manual currently active in this slot.
                  </div>
                )}
              </div>

              {/* File Upload Only */}
              <div className="bg-zinc-950 p-2.5 rounded-md border border-zinc-800">
                <input
                  type="file"
                  accept="application/pdf"
                  id={`file-${slot.slot_id}`}
                  className="hidden"
                  disabled={isSlotUploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleUpload(slot.slot_id, file);
                    }
                    e.target.value = '';
                  }}
                />
                <label
                  htmlFor={`file-${slot.slot_id}`}
                  className="w-full flex items-center justify-center gap-2 bg-zinc-900 hover:bg-zinc-850 text-zinc-200 border border-zinc-750 px-3 py-2 rounded-md text-xs font-medium cursor-pointer transition-colors shadow-sm active:scale-[0.99]"
                >
                  <Upload className={`w-3.5 h-3.5 ${isSlotUploading ? 'animate-bounce' : ''}`} />
                  <span>
                    {isSlotUploading
                      ? 'Uploading & Saving PDF...'
                      : doc
                      ? 'Replace with new PDF'
                      : 'Upload PDF File'}
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revision History Modal */}
      {historySlotId !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-zinc-100 text-base flex items-center gap-2">
                  <span>Slot {historySlotId} Revision History</span>
                  <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md">
                    {revisions.length} total
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setHistorySlotId(null)}
                className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {isLoadingHistory ? (
                <div className="text-center py-8 text-zinc-500 text-xs">Loading revisions...</div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">No revisions found.</div>
              ) : (
                revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className={`p-3.5 rounded-md border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      rev.is_live
                        ? 'bg-zinc-950 border-zinc-700'
                        : 'bg-zinc-950/50 border-zinc-850 opacity-70'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-zinc-100">Version {rev.version}</span>
                        {rev.is_live ? (
                          <span className="bg-zinc-800 text-zinc-100 border border-zinc-700 text-[10px] font-mono px-1.5 py-0.5 rounded-md">
                            CURRENT LIVE
                          </span>
                        ) : (
                          <span className="bg-zinc-900 text-zinc-400 border border-zinc-800 text-[10px] font-mono px-1.5 py-0.5 rounded-md">
                            OBSOLETE
                          </span>
                        )}
                        <span className="font-medium text-zinc-300">{rev.title}</span>
                      </div>

                      <div className="text-zinc-400 mt-1 space-y-0.5 text-[11px]">
                        <div>Original File: {rev.original_filename}</div>
                        <div>MD5 Hash: <span className="font-mono text-zinc-500">{rev.file_hash}</span></div>
                        <div className="text-zinc-500">
                          Uploaded: {new Date(rev.upload_date).toLocaleString()}
                          {rev.obsolescence_date && (
                            <> • Obsoleted: {new Date(rev.obsolescence_date).toLocaleString()}</>
                          )}
                        </div>
                      </div>
                    </div>

                    <a
                      href={rev.url}
                      target="_blank"
                      rel="noreferrer"
                      className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 text-xs font-medium transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download</span>
                    </a>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Feedback Audit Modal */}
      {auditSlotId !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-zinc-900 border border-zinc-800 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col shadow-xl">
            <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-zinc-100 text-base flex items-center gap-2">
                  <span>Slot {auditSlotId} Notes Audit</span>
                  <span className="text-xs font-mono bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded-md">
                    {auditFeedback.length} comments
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setAuditSlotId(null)}
                className="p-1 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {isLoadingAudit ? (
                <div className="text-center py-8 text-zinc-500 text-xs">Loading feedback...</div>
              ) : auditFeedback.length === 0 ? (
                <div className="text-center py-8 text-zinc-500 text-xs">No feedback submitted for this slot yet.</div>
              ) : (
                auditFeedback.map((fb) => (
                  <div
                    key={fb.id}
                    className="p-3.5 rounded-md border border-zinc-800 bg-zinc-950 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-zinc-200">{fb.author}</span>
                        <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 py-0.5 rounded text-[11px] border border-zinc-700">
                          {fb.station_id}
                        </span>
                        <span className="bg-zinc-800 text-zinc-300 font-mono px-1.5 py-0.5 rounded text-[11px] border border-zinc-700">
                          Page {fb.page_ref}
                        </span>
                        <span className="text-zinc-500 text-[11px] font-mono">
                          {new Date(fb.timestamp).toLocaleDateString()}
                        </span>
                      </div>

                      {/* Status management buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateStatus(fb.id, 'open')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium uppercase transition-colors cursor-pointer border ${
                            fb.status === 'open'
                              ? 'bg-zinc-800 text-amber-400 border-zinc-700'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                          }`}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(fb.id, 'reviewed')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium uppercase transition-colors cursor-pointer border ${
                            fb.status === 'reviewed'
                              ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                          }`}
                        >
                          Reviewed
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(fb.id, 'resolved')}
                          className={`px-2 py-0.5 rounded-md text-[10px] font-mono font-medium uppercase transition-colors cursor-pointer border ${
                            fb.status === 'resolved'
                              ? 'bg-zinc-800 text-emerald-400 border-zinc-700'
                              : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:text-zinc-300'
                          }`}
                        >
                          Resolved
                        </button>
                      </div>
                    </div>

                    {fb.text_comment && (
                      <p className="text-zinc-300 whitespace-pre-line">{fb.text_comment}</p>
                    )}

                    {fb.photo_urls && fb.photo_urls.length > 0 && (
                      <div className="flex gap-2">
                        {fb.photo_urls.map((p, idx) => (
                          <a
                            key={idx}
                            href={p}
                            target="_blank"
                            rel="noreferrer"
                            className="w-12 h-12 rounded-md border border-zinc-800 overflow-hidden"
                          >
                            <img src={p} alt="photo" className="w-full h-full object-cover" />
                          </a>
                        ))}
                      </div>
                    )}

                    {fb.video_url && (
                      <div className="mt-1">
                        <a
                          href={fb.video_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 text-zinc-300 hover:text-zinc-100 underline text-[11px]"
                        >
                          <Download className="w-3 h-3" />
                          <span>View Video ({fb.video_filename})</span>
                        </a>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
