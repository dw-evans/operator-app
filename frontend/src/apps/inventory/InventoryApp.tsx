import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FC } from 'react';
import {
  Plus,
  Search,
  RefreshCw,
  Download,
  History,
  Boxes,
  WifiOff,
} from 'lucide-react';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  fetchCommonNames,
  fetchSubassemblies,
  fetchParts,
  fetchTransactions,
  getExportCsvUrl,
} from './api';
import type {
  CommonNameItem,
  SubassemblyItem,
  InventoryBatch,
  InventoryPart,
  InventoryTransaction,
} from './types';
import { PartList } from './components/PartList';
import { QuickAdjustModal } from './components/QuickAdjustModal';
import { AddEditPartModal } from './components/AddEditPartModal';
import { AddEditBatchModal } from './components/AddEditBatchModal';
import { TransactionHistory } from './components/TransactionHistory';

export const InventoryApp: FC = () => {
  const [activeTab, setActiveTab] = useState<'parts' | 'history'>('parts');
  const [parts, setParts] = useState<InventoryPart[]>([]);
  const [commonNames, setCommonNames] = useState<CommonNameItem[]>([]);
  const [subassemblies, setSubassemblies] = useState<SubassemblyItem[]>([]);
  const [transactions, setTransactions] = useState<InventoryTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedSubassembly, setSelectedSubassembly] = useState('');
  const [includeObsolete, setIncludeObsolete] = useState(true);

  // Modals
  const [adjustTarget, setAdjustTarget] = useState<InventoryPart | null>(null);
  const [partModalOpen, setPartModalOpen] = useState(false);
  const [editingPart, setEditingPart] = useState<InventoryPart | null>(null);
  const [batchModalTarget, setBatchModalTarget] = useState<{
    part: InventoryPart;
    batch: InventoryBatch | null;
  } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [partsData, cnData, subData, txData] = await Promise.all([
        fetchParts({
          search: search || undefined,
          category: selectedCategory || undefined,
          subassembly: selectedSubassembly || undefined,
          includeObsolete,
        }),
        fetchCommonNames(),
        fetchSubassemblies(),
        fetchTransactions({ limit: 150 }),
      ]);
      setParts(partsData);
      setCommonNames(cnData);
      setSubassemblies(subData);
      setTransactions(txData);
      setIsOffline(false);
    } catch (err: any) {
      setIsOffline(!navigator.onLine);
      setErrorMsg(
        err?.message || 'Unable to reach inventory server. Check network connection.'
      );
    } finally {
      setIsLoading(false);
    }
  }, [search, selectedCategory, selectedSubassembly, includeObsolete]);

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData();
    }, 150);
    return () => clearTimeout(timer);
  }, [loadData]);

  // Keep fresh on reconnect or window focus
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      loadData();
    };
    const handleOffline = () => setIsOffline(true);
    const handleFocus = () => {
      if (navigator.onLine) loadData();
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('focus', handleFocus);
    };
  }, [loadData]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    parts.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set).sort();
  }, [parts]);

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 min-h-0 w-full max-w-6xl mx-auto p-3 sm:p-5 flex flex-col gap-3 overflow-hidden">
        {/* Offline Warning Banner */}
        {isOffline && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>
                Offline — Inventory is online-only to keep shared stock counts accurate.
                Reconnect to make changes.
              </span>
            </div>
            <Button variant="outline" size="xs" onClick={loadData}>
              Retry
            </Button>
          </div>
        )}

        {errorMsg && !isOffline && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
            <span>{errorMsg}</span>
            <Button variant="outline" size="xs" onClick={loadData}>
              Retry
            </Button>
          </div>
        )}

        {/* Header & Primary Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="flex bg-muted/60 rounded-lg p-1 border border-border">
              <button
                type="button"
                onClick={() => setActiveTab('parts')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                  activeTab === 'parts'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <Boxes className="w-3.5 h-3.5" />
                <span>Parts & Batches</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {parts.length}
                </Badge>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('history')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-colors',
                  activeTab === 'history'
                    ? 'bg-background text-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                <History className="w-3.5 h-3.5" />
                <span>History Ledger</span>
                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">
                  {transactions.length}
                </Badge>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <RefreshCw className={cn('w-3.5 h-3.5', isLoading && 'animate-spin')} />
              <span>Refresh</span>
            </Button>

            <a
              href={getExportCsvUrl()}
              download="inventory_export.csv"
              className={cn(
                buttonVariants({ variant: 'outline', size: 'sm' }),
                'gap-1.5 text-xs'
              )}
            >
              <Download className="w-3.5 h-3.5" />
              <span>CSV</span>
            </a>

            <Button
              type="button"
              size="sm"
              disabled={isOffline}
              onClick={() => {
                setEditingPart(null);
                setPartModalOpen(true);
              }}
              className="gap-1.5 text-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Part / Version</span>
            </Button>
          </div>
        </div>

        {/* Search & Filter Bar (Parts Tab) */}
        {activeTab === 'parts' && (
          <div className="shrink-0 flex flex-col sm:flex-row gap-2 sm:items-center justify-between bg-card border border-border rounded-xl p-2.5">
            <div className="relative flex-1 min-w-0">
              <Search className="w-3.5 h-3.5 text-muted-foreground absolute left-2.5 top-1/2 -translate-y-1/2" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter by name..."
                className="pl-8 h-8 text-xs"
              />
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={selectedSubassembly}
                onChange={(e) => setSelectedSubassembly(e.target.value)}
                className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                aria-label="Filter by subassembly"
              >
                <option value="">All Subassemblies</option>
                {subassemblies.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
              </select>

              {categories.length > 0 && (
                <select
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="h-8 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  <option value="">All Categories</option>
                  {categories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              )}

              <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none px-1.5">
                <input
                  type="checkbox"
                  checked={includeObsolete}
                  onChange={(e) => setIncludeObsolete(e.target.checked)}
                  className="rounded border-border"
                />
                <span>Show Obsolete</span>
              </label>
            </div>
          </div>
        )}

        {/* Active Tab Content */}
        {activeTab === 'parts' ? (
          <PartList
            parts={parts}
            isLoading={isLoading}
            isOffline={isOffline}
            isSearching={search.trim().length > 0}
            onAdjustPart={(part) => setAdjustTarget(part)}
            onAddBatch={(part) => setBatchModalTarget({ part, batch: null })}
            onEditBatch={(part, batch) => setBatchModalTarget({ part, batch })}
            onEditPart={(part) => {
              setEditingPart(part);
              setPartModalOpen(true);
            }}
          />
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TransactionHistory
              transactions={transactions}
              isLoading={isLoading}
              isOffline={isOffline}
              onUndone={loadData}
            />
          </div>
        )}
      </div>

      {/* Modals */}
      <QuickAdjustModal
        open={adjustTarget !== null}
        onOpenChange={(open) => {
          if (!open) setAdjustTarget(null);
        }}
        part={adjustTarget}
        onSuccess={loadData}
      />

      <AddEditPartModal
        open={partModalOpen}
        onOpenChange={setPartModalOpen}
        editingPart={editingPart}
        commonNames={commonNames}
        subassemblies={subassemblies}
        onSuccess={loadData}
      />

      <AddEditBatchModal
        open={batchModalTarget !== null}
        onOpenChange={(open) => {
          if (!open) setBatchModalTarget(null);
        }}
        part={batchModalTarget?.part ?? null}
        editingBatch={batchModalTarget?.batch ?? null}
        onSuccess={loadData}
      />
    </div>
  );
};
