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

  // Upload form state per slot
  const [uploadTitles, setUploadTitles] = useState<Record<number, string>>({});
  const [uploadFiles, setUploadFiles] = useState<Record<number, File | null>>({});
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

  const handleFileChange = (slotId: number, file: File | null) => {
    setUploadFiles((prev) => ({ ...prev, [slotId]: file }));
  };

  const handleTitleChange = (slotId: number, title: string) => {
    setUploadTitles((prev) => ({ ...prev, [slotId]: title }));
  };

  const handleUpload = async (slotId: number) => {
    const title = uploadTitles[slotId];
    const file = uploadFiles[slotId];

    if (!title || !title.trim()) {
      alert('Please specify a title for the manual.');
      return;
    }
    if (!file) {
      alert('Please select a PDF file to upload.');
      return;
    }

    setUploadingSlotId(slotId);
    setUploadSuccess(null);

    try {
      await adminUploadManual(slotId, title.trim(), file);
      setUploadSuccess(`Slot ${slotId} updated successfully!`);
      // Reset input state for slot
      setUploadFiles((prev) => ({ ...prev, [slotId]: null }));
      setUploadTitles((prev) => ({ ...prev, [slotId]: '' }));
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
      <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 max-w-sm w-full shadow-2xl text-center">
          <div className="w-12 h-12 rounded-xl bg-purple-950/80 text-purple-400 border border-purple-800 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-6 h-6" />
          </div>
          <h2 className="text-lg font-bold text-slate-100">Admin PIN Required</h2>
          <p className="text-xs text-slate-400 mt-1 mb-5">
            Enter the administrator PIN to manage document slots and auditing.
          </p>

          <form onSubmit={handleVerifyPin} className="space-y-4">
            <input
              type="password"
              autoFocus
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              placeholder="Enter PIN"
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-center text-lg tracking-widest text-slate-100 focus:outline-none focus:border-purple-500 font-mono"
            />

            {pinError && <p className="text-xs text-rose-400">{pinError}</p>}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="w-1/2 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-750 text-slate-300 text-sm font-medium transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="w-1/2 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium transition-colors shadow-md"
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
      <div className="flex items-center justify-between border-b border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-100 tracking-tight flex items-center gap-2">
            <span>Admin Management Portal</span>
            <span className="text-xs bg-purple-950 text-purple-300 border border-purple-800 px-2 py-0.5 rounded">
              Slots 1–10
            </span>
          </h2>
          <p className="text-xs md:text-sm text-slate-400 mt-0.5">
            Manage live manual versions, audit historical revisions, and review station feedback.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadSlots}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors border border-slate-700 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoadingSlots ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onClose}
            className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 rounded-lg transition-colors border border-slate-700"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {uploadSuccess && (
        <div className="p-3 bg-emerald-950/70 border border-emerald-800 text-emerald-300 rounded-xl text-xs md:text-sm font-medium flex items-center gap-2">
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
              className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 shadow-md flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold px-2 py-0.5 bg-blue-900/40 text-blue-400 border border-blue-800 rounded">
                      SLOT {slot.slot_id}
                    </span>
                    {doc ? (
                      <span className="text-xs font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-800 px-2 py-0.5 rounded">
                        Active Rev v{doc.version}
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500 bg-slate-800 px-2 py-0.5 rounded">
                        Empty Slot
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openHistory(slot.slot_id)}
                      className="flex items-center gap-1 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 px-2 py-1 rounded transition-colors border border-slate-750 cursor-pointer"
                    >
                      <History className="w-3.5 h-3.5" />
                      <span>Revisions ({slot.total_revisions})</span>
                    </button>

                    <button
                      onClick={() => openAudit(slot.slot_id)}
                      className="flex items-center gap-1 text-xs text-amber-400 hover:text-amber-300 bg-amber-950/40 border border-amber-900 px-2 py-1 rounded transition-colors cursor-pointer"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Feedback ({slot.total_feedback})</span>
                    </button>
                  </div>
                </div>

                {doc ? (
                  <div className="bg-slate-850 p-3 rounded-lg border border-slate-800 mb-3 text-xs space-y-1">
                    <div className="font-semibold text-slate-100 text-sm truncate">{doc.title}</div>
                    <div className="text-slate-400 flex items-center justify-between">
                      <span className="truncate max-w-[200px]">{doc.original_filename}</span>
                      <span className="font-mono text-[10px] text-slate-500">MD5: {doc.file_hash}</span>
                    </div>
                    <div className="text-slate-500 text-[11px] flex items-center justify-between pt-1">
                      <span>Uploaded {new Date(doc.upload_date).toLocaleString()}</span>
                      <a
                        href={doc.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-400 hover:underline flex items-center gap-0.5"
                      >
                        <Download className="w-3 h-3" />
                        <span>Download PDF</span>
                      </a>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-850/50 p-3 rounded-lg border border-slate-800/80 mb-3 text-xs text-slate-500 text-center">
                    No manual currently active in this slot.
                  </div>
                )}
              </div>

              {/* Upload New Version Widget */}
              <div className="bg-slate-850 p-3 rounded-lg border border-slate-800">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
                  {doc ? 'Upload New Revision' : 'Upload Initial Manual'}
                </div>
                <div className="space-y-2">
                  <input
                    type="text"
                    value={uploadTitles[slot.slot_id] || ''}
                    onChange={(e) => handleTitleChange(slot.slot_id, e.target.value)}
                    placeholder={doc ? `New revision title (default: ${doc.title})` : 'Manual Title'}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-blue-500"
                  />

                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      accept="application/pdf"
                      id={`file-${slot.slot_id}`}
                      className="hidden"
                      onChange={(e) => handleFileChange(slot.slot_id, e.target.files?.[0] || null)}
                    />
                    <label
                      htmlFor={`file-${slot.slot_id}`}
                      className="flex-1 bg-slate-800 hover:bg-slate-750 text-slate-300 border border-slate-750 px-2.5 py-1.5 rounded-lg text-xs truncate cursor-pointer text-center"
                    >
                      {uploadFiles[slot.slot_id]?.name || 'Select PDF File'}
                    </label>

                    <button
                      onClick={() => handleUpload(slot.slot_id)}
                      disabled={isSlotUploading}
                      className="flex items-center gap-1 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-50 text-white text-xs font-medium px-3 py-1.5 rounded-lg transition-colors shadow-sm cursor-pointer"
                    >
                      <Upload className={`w-3.5 h-3.5 ${isSlotUploading ? 'animate-bounce' : ''}`} />
                      <span>{isSlotUploading ? 'Saving...' : 'Deploy'}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Revision History Modal */}
      {historySlotId !== null && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                  <span>Slot {historySlotId} Revision History</span>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {revisions.length} total
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setHistorySlotId(null)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {isLoadingHistory ? (
                <div className="text-center py-8 text-slate-500 text-xs">Loading revisions...</div>
              ) : revisions.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">No revisions found.</div>
              ) : (
                revisions.map((rev) => (
                  <div
                    key={rev.id}
                    className={`p-3.5 rounded-xl border text-xs flex flex-col md:flex-row md:items-center justify-between gap-3 ${
                      rev.is_live
                        ? 'bg-slate-850 border-emerald-800/80'
                        : 'bg-slate-900 border-slate-800 opacity-80'
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-slate-100">Version {rev.version}</span>
                        {rev.is_live ? (
                          <span className="bg-emerald-950 text-emerald-300 border border-emerald-800 text-[10px] font-bold px-1.5 py-0.5 rounded">
                            CURRENT LIVE
                          </span>
                        ) : (
                          <span className="bg-slate-800 text-slate-400 border border-slate-700 text-[10px] font-medium px-1.5 py-0.5 rounded">
                            OBSOLETE
                          </span>
                        )}
                        <span className="font-semibold text-slate-300">{rev.title}</span>
                      </div>

                      <div className="text-slate-400 mt-1 space-y-0.5 text-[11px]">
                        <div>Original File: {rev.original_filename}</div>
                        <div>MD5 Hash: <span className="font-mono text-slate-500">{rev.file_hash}</span></div>
                        <div className="text-slate-500">
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
                      className="shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-400 hover:text-blue-300 border border-slate-700 text-xs font-medium transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Download PDF</span>
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
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                  <span>Slot {auditSlotId} Feedback Audit</span>
                  <span className="text-xs bg-slate-800 text-slate-400 px-2 py-0.5 rounded">
                    {auditFeedback.length} comments
                  </span>
                </h3>
              </div>
              <button
                onClick={() => setAuditSlotId(null)}
                className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 overflow-y-auto space-y-3">
              {isLoadingAudit ? (
                <div className="text-center py-8 text-slate-500 text-xs">Loading feedback...</div>
              ) : auditFeedback.length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">No feedback submitted for this slot yet.</div>
              ) : (
                auditFeedback.map((fb) => (
                  <div
                    key={fb.id}
                    className="p-3.5 rounded-xl border border-slate-800 bg-slate-850 text-xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{fb.author}</span>
                        <span className="bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded text-[11px]">
                          {fb.station_id}
                        </span>
                        <span className="bg-blue-950/70 text-blue-300 border border-blue-900 px-1.5 py-0.5 rounded text-[11px]">
                          Page {fb.page_ref}
                        </span>
                        <span className="text-slate-500 text-[11px]">
                          {new Date(fb.timestamp).toLocaleString()}
                        </span>
                      </div>

                      {/* Status management buttons */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleUpdateStatus(fb.id, 'open')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                            fb.status === 'open'
                              ? 'bg-amber-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                          }`}
                        >
                          Open
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(fb.id, 'reviewed')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                            fb.status === 'reviewed'
                              ? 'bg-sky-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                          }`}
                        >
                          Reviewed
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(fb.id, 'resolved')}
                          className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase transition-colors ${
                            fb.status === 'resolved'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-slate-800 text-slate-400 hover:bg-slate-750'
                          }`}
                        >
                          Resolved
                        </button>
                      </div>
                    </div>

                    {fb.text_comment && (
                      <p className="text-slate-300 whitespace-pre-line">{fb.text_comment}</p>
                    )}

                    {fb.photo_urls && fb.photo_urls.length > 0 && (
                      <div className="flex gap-2">
                        {fb.photo_urls.map((p, idx) => (
                          <a
                            key={idx}
                            href={p}
                            target="_blank"
                            rel="noreferrer"
                            className="w-12 h-12 rounded border border-slate-700 overflow-hidden"
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
                          className="inline-flex items-center gap-1 text-emerald-400 hover:underline text-[11px]"
                        >
                          <Download className="w-3 h-3" />
                          <span>View Video Clip ({fb.video_filename})</span>
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
