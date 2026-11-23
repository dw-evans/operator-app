import { useState, useEffect, useCallback, useMemo } from 'react';
import type { FC } from 'react';
import { Plus, Search, RefreshCw, AlertTriangle, WifiOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PhotoLightboxModal } from '@/components/PhotoLightboxModal';
import { fetchParts } from '@/apps/inventory/api';
import type { InventoryPart } from '@/apps/inventory/types';
import { fetchQualityIssues } from './api';
import type { QualityIssue } from './types';
import { QualityIssueTable } from './components/QualityIssueTable';
import { SubmitQualityIssueDialog } from './components/SubmitQualityIssueDialog';
import { QualityIssueDetailDialog } from './components/QualityIssueDetailDialog';

export const QualityApp: FC = () => {
  const [issues, setIssues] = useState<QualityIssue[]>([]);
  const [parts, setParts] = useState<InventoryPart[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedSubassembly, setSelectedSubassembly] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [selectedBatchNumber, setSelectedBatchNumber] = useState('');

  // Dialogs & Lightbox
  const [submitOpen, setSubmitOpen] = useState(false);
  const [detailIssueId, setDetailIssueId] = useState<number | null>(null);
  const [lightboxState, setLightboxState] = useState<{
    urls: string[];
    index: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const [issuesData, partsData] = await Promise.all([
        fetchQualityIssues(),
        fetchParts({ includeObsolete: true }),
      ]);
      setIssues(issuesData);
      setParts(partsData);
      setIsOffline(false);
    } catch (err: any) {
      setIsOffline(!navigator.onLine);
      setErrorMsg(
        err?.message || 'Unable to reach quality server. Check network connection.'
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Distinct filter options derived from issues
  const subassemblies = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) {
      if (i.subassembly) set.add(i.subassembly);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) {
      if (i.category) set.add(i.category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [issues]);

  const batchNumbers = useMemo(() => {
    const set = new Set<string>();
    for (const i of issues) {
      if (i.batch_number) set.add(i.batch_number);
    }
    return Array.from(set).sort((a, b) =>
      a.localeCompare(b, undefined, { numeric: true })
    );
  }, [issues]);

  const filteredIssues = useMemo(() => {
    const q = search.trim().toLowerCase();
    return issues.filter((issue) => {
      if (selectedSubassembly && issue.subassembly !== selectedSubassembly) {
        return false;
      }
      if (selectedCategory && issue.category !== selectedCategory) {
        return false;
      }
      if (selectedBatchNumber && issue.batch_number !== selectedBatchNumber) {
        return false;
      }
      if (q) {
        const hay = `${issue.part_name} ${issue.common_name || ''} ${issue.part_number} ${issue.batch_number} ${issue.batch_code || ''} ${issue.subassembly || ''} ${issue.category || ''} ${issue.description} ${issue.operator}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [issues, search, selectedSubassembly, selectedCategory, selectedBatchNumber]);

  const activeDetailIssue = useMemo(
    () => issues.find((i) => i.id === detailIssueId) || null,
    [issues, detailIssueId]
  );

  const handleIssueCreated = (created: QualityIssue) => {
    setIssues((prev) => [created, ...prev]);
  };

  const handleIssueUpdated = (updated: QualityIssue) => {
    setIssues((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  };

  const handleIssueDeleted = (issueId: number) => {
    setIssues((prev) => prev.filter((i) => i.id !== issueId));
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden bg-background">
      <div className="flex-1 min-h-0 w-full max-w-7xl mx-auto p-3 sm:p-5 flex flex-col gap-3 overflow-hidden">
        {/* Offline Warning Banner */}
        {isOffline && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <WifiOff className="w-4 h-4 shrink-0" />
              <span>
                Offline — Quality reports require a connection to the server.
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

        {/* Header Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-muted border border-border flex items-center justify-center text-foreground shrink-0">
              <AlertTriangle className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-semibold text-foreground leading-tight">
                  Quality Issues
                </h1>
                <Badge variant="secondary" className="text-[11px] font-mono">
                  {filteredIssues.length}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Track part & batch quality reports across production
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={loadData}
              disabled={isLoading}
              className="gap-1.5 cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => setSubmitOpen(true)}
              disabled={isOffline}
              className="gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Report Issue</span>
            </Button>
          </div>
        </div>

        {/* Filter Bar (matching Inventory style) */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, part #, batch, description..."
              className="pl-8 h-8 text-xs"
            />
          </div>

          <select
            value={selectedSubassembly}
            onChange={(e) => setSelectedSubassembly(e.target.value)}
            aria-label="Filter by subassembly"
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Subassemblies</option>
            {subassemblies.map((sub) => (
              <option key={sub} value={sub}>
                {sub}
              </option>
            ))}
          </select>

          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            aria-label="Filter by category"
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>

          <select
            value={selectedBatchNumber}
            onChange={(e) => setSelectedBatchNumber(e.target.value)}
            aria-label="Filter by batch number"
            className="h-8 rounded-md border border-input bg-background px-2.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">All Batches</option>
            {batchNumbers.map((bn) => (
              <option key={bn} value={bn}>
                Batch {bn}
              </option>
            ))}
          </select>
        </div>

        {/* Virtualized Quality Issues Table */}
        <QualityIssueTable
          issues={filteredIssues}
          isLoading={isLoading}
          onViewPhotos={(urls, index) => setLightboxState({ urls, index })}
          onOpenDetail={(issue) => setDetailIssueId(issue.id)}
        />
      </div>

      {/* Submit Quality Issue Dialog */}
      <SubmitQualityIssueDialog
        open={submitOpen}
        onOpenChange={setSubmitOpen}
        parts={parts}
        onCreated={handleIssueCreated}
      />

      {/* Quality Report Detail Dialog */}
      <QualityIssueDetailDialog
        issue={activeDetailIssue}
        onClose={() => setDetailIssueId(null)}
        onUpdated={handleIssueUpdated}
        onDeleted={handleIssueDeleted}
        onViewPhotos={(urls, index) => setLightboxState({ urls, index })}
      />

      {/* Shared Photo Carousel Lightbox */}
      <PhotoLightboxModal
        photoUrl={lightboxState ? lightboxState.urls[lightboxState.index] ?? null : null}
        photoUrls={lightboxState?.urls}
        initialIndex={lightboxState?.index ?? 0}
        onClose={() => setLightboxState(null)}
      />
    </div>
  );
};
