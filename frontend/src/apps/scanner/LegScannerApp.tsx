import { useState, useEffect } from 'react';
import type { FC, KeyboardEvent } from 'react';
import { ScanLine, Trash2, Copy, Check, Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { ScanSessionView } from './components/ScanSessionView';
import { loadScannedLegs, saveScannedLegs } from './storage';
import { SLOT_NUMBERS, type ScannedLeg, type SlotNumber } from './types';

export const LegScannerApp: FC = () => {
  const [legs, setLegs] = useState<ScannedLeg[]>(loadScannedLegs);
  const [isScanning, setIsScanning] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingRow, setEditingRow] = useState<{
    legId: string;
    slot: SlotNumber;
  } | null>(null);
  const [editValue, setEditValue] = useState('');

  useEffect(() => {
    saveScannedLegs(legs);
  }, [legs]);

  const handleFinishScan = (serials: Record<SlotNumber, string>) => {
    const nextNumber = legs.length + 1;
    const newLeg: ScannedLeg = {
      id:
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : `leg_${Date.now()}`,
      label: `Leg #${nextNumber}`,
      scannedAt: new Date().toISOString(),
      serials,
    };
    setLegs((prev) => [newLeg, ...prev]);
    setIsScanning(false);
  };

  const handleDeleteLeg = (id: string) => {
    setLegs((prev) => prev.filter((l) => l.id !== id));
    if (editingRow?.legId === id) {
      setEditingRow(null);
      setEditValue('');
    }
  };

  const handleStartEdit = (leg: ScannedLeg, slot: SlotNumber) => {
    setEditingRow({ legId: leg.id, slot });
    setEditValue(leg.serials[slot] || '');
  };

  const handleCancelEdit = () => {
    setEditingRow(null);
    setEditValue('');
  };

  const handleSaveEdit = () => {
    if (!editingRow) return;
    const { legId, slot } = editingRow;
    const trimmed = editValue.trim();
    setLegs((prev) =>
      prev.map((leg) =>
        leg.id === legId
          ? { ...leg, serials: { ...leg.serials, [slot]: trimmed } }
          : leg,
      ),
    );
    setEditingRow(null);
    setEditValue('');
  };

  const handleEditKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancelEdit();
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Clear all scanned legs from this device?')) {
      setLegs([]);
    }
  };

  const handleCopyLeg = async (leg: ScannedLeg) => {
    const lines = SLOT_NUMBERS.map((n) => `${n}\t${leg.serials[n] || ''}`).join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setCopiedId(leg.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {
      // ignore clipboard errors
    }
  };

  if (isScanning) {
    return (
      <ScanSessionView
        onFinish={handleFinishScan}
        onCancel={() => setIsScanning(false)}
      />
    );
  }

  return (
    <div className="flex-1 min-h-0 overflow-y-auto bg-background">
      <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Top Action Section: Scan New Leg */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">
              Leg Serial Number Scanner
            </h1>
            <p className="text-xs text-muted-foreground">
              Scan 4 Data Matrix / Code 128 serial codes per leg (stored locally on this device)
            </p>
          </div>

          <Button
            type="button"
            onClick={() => setIsScanning(true)}
            className="gap-2 h-10 px-4 text-sm font-medium cursor-pointer shrink-0"
          >
            <ScanLine className="w-4 h-4" />
            <span>Scan New Leg</span>
          </Button>
        </div>

        {/* Scanned Legs Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium text-muted-foreground">
              Scanned Legs ({legs.length})
            </h2>
            {legs.length > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="xs"
                onClick={handleClearAll}
                className="text-xs text-muted-foreground hover:text-destructive cursor-pointer"
              >
                Clear All
              </Button>
            )}
          </div>

          {legs.length === 0 ? (
            <Card className="p-10 text-center text-sm text-muted-foreground">
              No scans
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {legs.map((leg) => (
                <Card key={leg.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">
                        {leg.label}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {new Date(leg.scannedAt).toLocaleString(undefined, {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false,
                        })}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleCopyLeg(leg)}
                        className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
                        title="Copy serials"
                      >
                        {copiedId === leg.id ? (
                          <Check className="w-3.5 h-3.5 text-emerald-400" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => handleDeleteLeg(leg.id)}
                        className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer"
                        title="Delete scan"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  </div>

                  {/* Table: # (1/2/3/4) | Serial ID | Edit */}
                  <div className="rounded-lg border border-border overflow-hidden text-xs">
                    <div className="grid grid-cols-[2.5rem_1fr_3.75rem] bg-muted/40 border-b border-border font-medium text-muted-foreground">
                      <div className="px-2.5 py-1.5 border-r border-border text-center">
                        #
                      </div>
                      <div className="px-3 py-1.5 border-r border-border">
                        Serial ID
                      </div>
                      <div className="px-1.5 py-1.5 text-center">Edit</div>
                    </div>
                    {SLOT_NUMBERS.map((slot) => {
                      const isEditing =
                        editingRow?.legId === leg.id && editingRow.slot === slot;
                      return (
                        <div
                          key={slot}
                          className="grid grid-cols-[2.5rem_1fr_3.75rem] items-center border-b last:border-b-0 border-border/60"
                        >
                          <div className="px-2.5 py-1.5 border-r border-border/60 text-center font-mono text-muted-foreground self-stretch flex items-center justify-center">
                            {slot}
                          </div>
                          <div className="px-2 py-1 border-r border-border/60 min-w-0">
                            {isEditing ? (
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onKeyDown={handleEditKeyDown}
                                autoFocus
                                placeholder="e.g. 123456-789"
                                className="h-6 px-2 py-0 text-xs font-mono"
                              />
                            ) : (
                              <div className="px-1 py-0.5 font-mono text-foreground truncate">
                                {leg.serials[slot] || (
                                  <span className="text-muted-foreground/50">
                                    —
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          <div className="px-1 py-1 flex items-center justify-center gap-0.5">
                            {isEditing ? (
                              <>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={handleSaveEdit}
                                  className="h-6 w-6 text-emerald-500 hover:text-emerald-400 cursor-pointer"
                                  title="Save"
                                >
                                  <Check className="w-3.5 h-3.5" />
                                </Button>
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon-xs"
                                  onClick={handleCancelEdit}
                                  className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                                  title="Cancel"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </Button>
                              </>
                            ) : (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon-xs"
                                onClick={() => handleStartEdit(leg, slot)}
                                className="h-6 w-6 text-muted-foreground hover:text-foreground cursor-pointer"
                                title={`Edit #${slot}`}
                              >
                                <Pencil className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
