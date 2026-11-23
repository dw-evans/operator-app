import { useState, useRef, useEffect, useMemo } from 'react';
import type { FC } from 'react';
import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

interface CreatableComboboxProps {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  placeholder?: string;
  emptyLabel?: string;
  className?: string;
}

/**
 * Custom shadcn-styled Combobox that supports selecting from existing options
 * OR typing/creating a brand-new value, with browser autofill disabled.
 */
export const CreatableCombobox: FC<CreatableComboboxProps> = ({
  value,
  onChange,
  options,
  placeholder = 'Select or type...',
  emptyLabel = 'No matches yet — type to create',
  className,
}) => {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!open) return;
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [open]);

  const trimmed = value.trim();

  const filtered = useMemo(() => {
    if (!trimmed) return options;
    const q = trimmed.toLowerCase();
    return options.filter((opt) => opt.toLowerCase().includes(q));
  }, [options, trimmed]);

  const hasExactMatch = useMemo(() => {
    if (!trimmed) return true;
    const q = trimmed.toLowerCase();
    return options.some((opt) => opt.toLowerCase() === q);
  }, [options, trimmed]);

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <div className="relative flex items-center">
        <Input
          type="text"
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setOpen(false);
            } else if (e.key === 'Enter' && open) {
              e.preventDefault();
              if (filtered.length === 1 && !hasExactMatch) {
                onChange(trimmed);
              }
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          className="h-8 text-xs pr-12"
        />

        <div className="absolute right-1 flex items-center gap-0.5">
          {value && (
            <button
              type="button"
              onClick={() => {
                onChange('');
                setOpen(true);
              }}
              className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
              title="Clear"
              tabIndex={-1}
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setOpen((prev) => !prev)}
            className="p-1 text-muted-foreground hover:text-foreground rounded cursor-pointer"
            title="Toggle options"
            tabIndex={-1}
          >
            <ChevronsUpDown className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {open && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-50 max-h-48 overflow-y-auto rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {filtered.length === 0 && !trimmed && (
            <div className="px-2.5 py-2 text-xs text-muted-foreground">
              {emptyLabel}
            </div>
          )}

          {filtered.map((opt) => {
            const isSelected = opt.toLowerCase() === trimmed.toLowerCase();
            return (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt);
                  setOpen(false);
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-md text-xs text-left cursor-pointer transition-colors',
                  isSelected
                    ? 'bg-accent text-accent-foreground font-medium'
                    : 'hover:bg-muted text-foreground'
                )}
              >
                <span className="truncate">{opt}</span>
                {isSelected && <Check className="w-3.5 h-3.5 shrink-0 text-primary" />}
              </button>
            );
          })}

          {trimmed && !hasExactMatch && (
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                onChange(trimmed);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs text-left cursor-pointer hover:bg-muted text-primary font-medium',
                filtered.length > 0 && 'mt-1 border-t border-border/60 pt-2'
              )}
            >
              <Plus className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">Create &ldquo;{trimmed}&rdquo;</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};
