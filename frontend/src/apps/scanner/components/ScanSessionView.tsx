import { useState, useCallback } from 'react';
import type { FC, FormEvent } from 'react';
import { Check, X, ArrowLeft, Hand, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { CameraScanner } from './CameraScanner';
import { SLOT_NUMBERS, type ScanMode, type SlotNumber } from '../types';

interface ScanSessionViewProps {
  onFinish: (serials: Record<SlotNumber, string>) => void;
  onCancel: () => void;
}

export const ScanSessionView: FC<ScanSessionViewProps> = ({
  onFinish,
  onCancel,
}) => {
  const [serials, setSerials] = useState<Record<SlotNumber, string>>({
    1: '',
    2: '',
    3: '',
    4: '',
  });
  const [mode, setMode] = useState<ScanMode>('auto');
  const [activeSlot, setActiveSlot] = useState<SlotNumber | null>(1);
  const [manualInput, setManualInput] = useState('');
  const [lastScanned, setLastScanned] = useState<string | null>(null);

  const filledCount = SLOT_NUMBERS.filter((n) => serials[n].trim().length > 0).length;

  const assignCodeToSlot = useCallback(
    (code: string, targetSlot: SlotNumber | null, currentMode: ScanMode) => {
      if (!targetSlot) return;
      const value = code.trim();
      if (!value) return;

      setSerials((prev) => ({ ...prev, [targetSlot]: value }));
      setLastScanned(`#${targetSlot}: ${value}`);

      if (currentMode === 'auto') {
        if (targetSlot < 4) {
          setActiveSlot((targetSlot + 1) as SlotNumber);
        } else {
          // Completed slot 4 -> pause auto-scanning so user can review or hit Finish
          setActiveSlot(null);
        }
      }
    },
    []
  );

  const handleCameraDetected = useCallback(
    (rawText: string) => {
      assignCodeToSlot(rawText, activeSlot, mode);
    },
    [assignCodeToSlot, activeSlot, mode]
  );

  const handleManualEntrySubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    const slot = activeSlot ?? 1;
    assignCodeToSlot(manualInput, slot, mode);
    setManualInput('');
  };

  const handleSelectSlot = (slot: SlotNumber) => {
    setMode('manual');
    setActiveSlot(slot);
  };

  const handleClearSlot = (slot: SlotNumber) => {
    setSerials((prev) => ({ ...prev, [slot]: '' }));
    setActiveSlot(slot);
  };

  const statusLabel = activeSlot
    ? mode === 'auto'
      ? `Auto — Scanning #${activeSlot}`
      : `Manual — Scanning #${activeSlot}`
    : 'Scan complete — press Finish or tap a slot';

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      {/* Top Action Bar */}
      <div className="shrink-0 border-b border-border px-3 sm:px-4 py-2 flex items-center justify-between gap-2 bg-card/50">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            className="gap-1.5 text-xs h-8 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back</span>
          </Button>
          <span className="text-sm font-medium text-foreground">
            Scan New Leg
          </span>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-mono">
            {filledCount} / 4
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => onFinish(serials)}
            className="gap-1.5 text-xs h-8 px-3 cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            <span>Finish</span>
          </Button>
        </div>
      </div>

      {/* Main Split Area: Camera Left, 1/2/3/4 Slots Right */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row gap-3 p-3 sm:p-4 overflow-hidden">
        {/* Left Column: Camera View + Manual Text Fallback */}
        <div className="flex-1 min-h-0 flex flex-col gap-2">
          <div className="flex-1 min-h-0">
            <CameraScanner
              isActive={activeSlot !== null}
              statusLabel={statusLabel}
              onDetected={handleCameraDetected}
            />
          </div>

          <form
            onSubmit={handleManualEntrySubmit}
            className="shrink-0 flex items-center gap-2"
          >
            <Input
              value={manualInput}
              onChange={(e) => setManualInput(e.target.value)}
              placeholder={
                activeSlot
                  ? `Type code manually for #${activeSlot} (e.g. 123456-789)...`
                  : 'Select a slot (1–4) to type a code...'
              }
              className="h-8 text-xs font-mono"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              disabled={!manualInput.trim()}
              className="h-8 text-xs shrink-0 cursor-pointer"
            >
              Set
            </Button>
          </form>
        </div>

        {/* Right Column: Auto/Manual Toggle + Slots 1, 2, 3, 4 + Finish */}
        <div className="w-full md:w-80 lg:w-96 shrink-0 flex flex-col gap-3 overflow-y-auto">
          {/* Auto / Manual Mode Switcher */}
          <div className="grid grid-cols-2 gap-1 bg-muted/50 p-1 rounded-lg border border-border shrink-0">
            <button
              type="button"
              onClick={() => {
                setMode('auto');
                const firstEmpty = SLOT_NUMBERS.find((n) => !serials[n].trim());
                setActiveSlot(firstEmpty ?? null);
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                mode === 'auto'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Play className="w-3.5 h-3.5" />
              <span>Auto (1 → 4)</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('manual');
                if (activeSlot === null) setActiveSlot(1);
              }}
              className={cn(
                'flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                mode === 'manual'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <Hand className="w-3.5 h-3.5" />
              <span>Manual</span>
            </button>
          </div>

          {/* Slots 1, 2, 3, 4 */}
          <div className="space-y-2 flex-1">
            {SLOT_NUMBERS.map((slot) => {
              const value = serials[slot];
              const isCurrent = activeSlot === slot;
              return (
                <div
                  key={slot}
                  onClick={() => handleSelectSlot(slot)}
                  className={cn(
                    'flex items-center justify-between gap-3 px-3.5 py-3 rounded-xl border transition-all cursor-pointer',
                    isCurrent
                      ? 'border-primary bg-primary/10 ring-1 ring-primary/40'
                      : value
                        ? 'border-border bg-card hover:border-foreground/30'
                        : 'border-border/70 bg-muted/20 hover:border-foreground/30'
                  )}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={cn(
                        'w-8 h-8 rounded-lg flex items-center justify-center font-mono text-sm font-semibold shrink-0',
                        isCurrent
                          ? 'bg-primary text-primary-foreground'
                          : value
                            ? 'bg-muted text-foreground'
                            : 'bg-muted/60 text-muted-foreground'
                      )}
                    >
                      {slot}
                    </div>
                    <div className="min-w-0">
                      <div
                        className={cn(
                          'font-mono text-sm truncate',
                          value ? 'text-foreground' : 'text-muted-foreground/60'
                        )}
                      >
                        {value || (isCurrent ? 'Waiting for scan...' : '—')}
                      </div>
                    </div>
                  </div>

                  {value && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleClearSlot(slot);
                      }}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                      title={`Clear slot ${slot}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              );
            })}
          </div>

          {lastScanned && (
            <div className="text-[11px] text-muted-foreground font-mono text-center truncate">
              Last read: {lastScanned}
            </div>
          )}

          {/* Bottom Finish Button */}
          <Button
            type="button"
            onClick={() => onFinish(serials)}
            className="w-full h-10 gap-2 text-sm font-medium cursor-pointer shrink-0"
          >
            <Check className="w-4 h-4" />
            <span>{filledCount === 4 ? 'Finish Leg' : `Finish (${filledCount}/4)`}</span>
          </Button>
        </div>
      </div>
    </div>
  );
};
