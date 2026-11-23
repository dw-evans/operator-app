import { useState } from 'react';
import type { FC } from 'react';
import { RotateCcw, Clock, User, ArrowRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { useOperatorName } from '@/services/settings';
import { undoTransaction } from '../api';
import type { InventoryTransaction } from '../types';

interface TransactionHistoryProps {
  transactions: InventoryTransaction[];
  isLoading: boolean;
  isOffline: boolean;
  onUndone: () => void;
}

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
};

export const TransactionHistory: FC<TransactionHistoryProps> = ({
  transactions,
  isLoading,
  isOffline,
  onUndone,
}) => {
  const [operatorName] = useOperatorName();
  const [undoingId, setUndoingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleUndo = async (tx: InventoryTransaction) => {
    setError(null);
    const op = operatorName.trim();
    if (!op) {
      setError('Please configure your Operator Name in Settings (top-right ⚙ menu) before undoing.');
      return;
    }
    setUndoingId(tx.id);
    try {
      await undoTransaction(tx.id, op);
      onUndone();
    } catch (err: any) {
      setError(err?.message || 'Failed to undo transaction');
    } finally {
      setUndoingId(null);
    }
  };

  if (isLoading && transactions.length === 0) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground">
        Loading transaction history...
      </div>
    );
  }

  if (transactions.length === 0) {
    return (
      <Card className="p-8 text-center text-sm text-muted-foreground">
        No stock adjustments recorded yet.
      </Card>
    );
  }

  return (
    <div className="space-y-2.5">
      {error && (
        <div className="p-2.5 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs">
          {error}
        </div>
      )}

      {transactions.map((tx) => {
        const isUndoEntry = tx.reverts_transaction_id !== null && tx.reverts_transaction_id !== undefined;
        return (
          <Card
            key={tx.id}
            className={cn(
              'p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs',
              tx.is_reverted && 'opacity-65'
            )}
          >
            <div className="space-y-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge
                  variant="outline"
                  className={cn(
                    'font-mono font-bold text-xs px-1.5',
                    tx.delta < 0
                      ? 'text-amber-400 border-amber-500/40 bg-amber-500/10'
                      : 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
                  )}
                >
                  {tx.delta > 0 ? `+${tx.delta}` : tx.delta}
                </Badge>

                <span className="font-semibold text-foreground">
                  {tx.common_name || tx.part_name}
                </span>

                <Badge variant="secondary" className="font-mono text-[10px]">
                  {tx.part_number} Rev {tx.revision}
                  {tx.iteration ? `.${tx.iteration}` : ''}
                </Badge>

                <Badge variant="outline" className="font-mono text-[10px]">
                  Batch {tx.batch_number}
                </Badge>

                {isUndoEntry && (
                  <Badge variant="outline" className="text-[10px] text-blue-400 border-blue-500/30">
                    Undo #{tx.reverts_transaction_id}
                  </Badge>
                )}

                {tx.is_reverted && (
                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                    Undone
                  </Badge>
                )}
              </div>

              <div className="flex items-center gap-3 text-[11px] text-muted-foreground flex-wrap">
                <span className="font-mono flex items-center gap-1 text-foreground/80">
                  {tx.quantity_before} <ArrowRight className="w-3 h-3" />{' '}
                  <strong className={tx.quantity_after < 0 ? 'text-amber-400' : ''}>
                    {tx.quantity_after}
                  </strong>
                </span>
                {tx.reason && <span>• {tx.reason}</span>}
                <span className="flex items-center gap-1">
                  <User className="w-3 h-3" />
                  {tx.operator}
                </span>
                <span className="flex items-center gap-1 font-mono">
                  <Clock className="w-3 h-3" />
                  {formatTimestamp(tx.timestamp)}
                </span>
              </div>
            </div>

            <div className="shrink-0 flex items-center">
              {!tx.is_reverted && !isUndoEntry && (
                <Button
                  type="button"
                  variant="outline"
                  size="xs"
                  disabled={isOffline || undoingId === tx.id}
                  onClick={() => handleUndo(tx)}
                  className="gap-1 text-xs cursor-pointer"
                  title="Reverse this adjustment with a compensating ledger entry"
                >
                  <RotateCcw className="w-3 h-3" />
                  <span>{undoingId === tx.id ? 'Undoing...' : 'Undo'}</span>
                </Button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
};
