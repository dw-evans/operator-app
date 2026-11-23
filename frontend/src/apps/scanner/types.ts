export type SlotNumber = 1 | 2 | 3 | 4;

export const SLOT_NUMBERS: SlotNumber[] = [1, 2, 3, 4];

export type ScanMode = 'auto' | 'manual';

export interface ScannedLeg {
  id: string;
  label: string;
  scannedAt: string;
  serials: Record<SlotNumber, string>;
}
