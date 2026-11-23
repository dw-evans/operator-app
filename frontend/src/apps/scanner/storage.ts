import type { ScannedLeg } from './types';

const STORAGE_KEY = 'leg_scanner_scanned_legs_v1';

export function loadScannedLegs(): ScannedLeg[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveScannedLegs(legs: ScannedLeg[]): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(legs));
  } catch (err) {
    console.warn('Failed to save scanned legs to localStorage:', err);
  }
}
