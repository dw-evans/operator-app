import { useState, useEffect, useCallback } from 'react';

const OPERATOR_NAME_KEY = 'assembly_operator_name';
const LEGACY_AUTHOR_KEY = 'assembly_author';
const OPERATOR_CHANGED_EVENT = 'assembly:operator_changed';

export function getOperatorName(): string {
  if (typeof window === 'undefined') return '';
  try {
    return (
      localStorage.getItem(OPERATOR_NAME_KEY) ||
      localStorage.getItem(LEGACY_AUTHOR_KEY) ||
      ''
    );
  } catch {
    return '';
  }
}

export function setOperatorName(name: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(OPERATOR_NAME_KEY, name);
    localStorage.setItem(LEGACY_AUTHOR_KEY, name);
  } catch (err) {
    console.error('Failed to save operator name to localStorage:', err);
  }

  // Notify all components in the current window
  window.dispatchEvent(
    new CustomEvent(OPERATOR_CHANGED_EVENT, { detail: name })
  );
}

export function useOperatorName(): [string, (name: string) => void] {
  const [name, setNameState] = useState<string>(getOperatorName);

  useEffect(() => {
    const handleUpdate = () => {
      setNameState(getOperatorName());
    };

    window.addEventListener(OPERATOR_CHANGED_EVENT, handleUpdate);
    window.addEventListener('storage', handleUpdate);

    return () => {
      window.removeEventListener(OPERATOR_CHANGED_EVENT, handleUpdate);
      window.removeEventListener('storage', handleUpdate);
    };
  }, []);

  const update = useCallback((newName: string) => {
    setOperatorName(newName);
    setNameState(newName);
  }, []);

  return [name, update];
}
