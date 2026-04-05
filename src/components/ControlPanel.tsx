import React, { useState, useCallback } from 'react';
import {
  Play,
  Download,
  Trash2,
  Loader2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { FileUpload } from './FileUpload';
import { StatsDisplay } from './StatsDisplay';
import type { ProcessingStats, ExportProgress } from '../types';

interface ControlPanelProps {
  stats: ProcessingStats;
  onProcessGeoJSON: (files: File[]) => Promise<void>;
  onProcessGeoTIFF: (file: File) => Promise<void>;
  onExport: (onProgress: (p: ExportProgress) => void) => Promise<void>;
  onClearAll: () => Promise<void>;
}

function ActionButton({
  onClick,
  disabled,
  loading,
  icon: Icon,
  label,
  variant = 'default',
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  variant?: 'default' | 'primary' | 'danger' | 'success';
}) {
  const variantStyles = {
    default: 'bg-slate-700 hover:bg-slate-600 border-slate-600 text-slate-200',
    primary: 'bg-sky-600 hover:bg-sky-500 border-sky-500 text-white',
    danger: 'bg-red-900/60 hover:bg-red-800/70 border-red-700/60 text-red-300',
    success: 'bg-emerald-700 hover:bg-emerald-600 border-emerald-600 text-white',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 rounded-lg border text-sm font-medium
        transition-all duration-150 ${variantStyles[variant]}
        disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {loading ? (
        <Loader2 size={14} className="animate-spin" />
      ) : (
        <Icon size={14} />
      )}
      {label}
    </button>
  );
}

export function ControlPanel({
  stats,
  onProcessGeoJSON,
  onProcessGeoTIFF,
  onExport,
  onClearAll,
}: ControlPanelProps) {
  const [geojsonFiles, setGeojsonFiles] = useState<File[]>([]);
  const [geotiffFiles, setGeotiffFiles] = useState<File[]>([]);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<ExportProgress | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [geojsonCollapsed, setGeojsonCollapsed] = useState(false);
  const [tiffCollapsed, setTiffCollapsed] = useState(false);

  const handleProcessGeoJSON = useCallback(async () => {
    if (!geojsonFiles.length) return;
    setError(null);
    try {
      for (const file of geojsonFiles) {
        await onProcessGeoJSON([file]);
      }
      setGeojsonFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GeoJSON processing failed');
    }
  }, [geojsonFiles, onProcessGeoJSON]);

  const handleProcessGeoTIFF = useCallback(async () => {
    if (!geotiffFiles.length) return;
    setError(null);
    try {
      await onProcessGeoTIFF(geotiffFiles[0]);
      setGeotiffFiles([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'GeoTIFF processing failed');
    }
  }, [geotiffFiles, onProcessGeoTIFF]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    try {
      await onExport((progress) => setExportProgress(progress));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setIsExporting(false);
      setExportProgress(null);
    }
  }, [onExport]);

  const handleClearAll = useCallback(async () => {
    if (!confirm('This will clear all tiles from memory. Continue?')) return;
    setIsClearing(true);
    setError(null);
    try {
      await onClearAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setIsClearing(false);
    }
  }, [onClearAll]);

  const isProcessing = stats.isProcessing;

  return (
    <div className="flex flex-col h-full overflow-y-auto space-y-4 p-4">
      <div>
        <h1 className="text-base font-bold text-slate-100">Tile Factory</h1>
        <p className="text-xs text-slate-500 mt-0.5">Client-side H3 tile processor</p>
      </div>

      {error && (
        <div className="bg-red-950/40 border border-red-700/50 rounded-lg px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <section className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700/40 transition-colors"
          onClick={() => setGeojsonCollapsed((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
            GeoJSON Vector Data
          </span>
          {geojsonCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {!geojsonCollapsed && (
          <div className="px-3 pb-3 space-y-2">
            <FileUpload
              label="Upload GeoJSON Files"
              accept=".geojson,.json"
              multiple
              files={geojsonFiles}
              onFilesChange={setGeojsonFiles}
              icon="geojson"
              disabled={isProcessing}
            />
            <ActionButton
              onClick={handleProcessGeoJSON}
              disabled={!geojsonFiles.length || isProcessing}
              loading={isProcessing}
              icon={Play}
              label={isProcessing ? 'Processing…' : `Process ${geojsonFiles.length} file${geojsonFiles.length !== 1 ? 's' : ''}`}
              variant="primary"
            />
          </div>
        )}
      </section>

      <section className="bg-slate-800/40 rounded-xl border border-slate-700/50 overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-semibold text-slate-300 hover:bg-slate-700/40 transition-colors"
          onClick={() => setTiffCollapsed((v) => !v)}
        >
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
            GeoTIFF Elevation Data
          </span>
          {tiffCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
        </button>
        {!tiffCollapsed && (
          <div className="px-3 pb-3 space-y-2">
            <FileUpload
              label="Upload GeoTIFF File"
              accept=".tiff,.tif,.geotiff"
              files={geotiffFiles}
              onFilesChange={setGeotiffFiles}
              icon="geotiff"
              disabled={isProcessing}
            />
            <ActionButton
              onClick={handleProcessGeoTIFF}
              disabled={!geotiffFiles.length || isProcessing}
              loading={isProcessing}
              icon={Play}
              label={isProcessing ? 'Processing…' : 'Process GeoTIFF'}
              variant="primary"
            />
          </div>
        )}
      </section>


      <div className="space-y-2">
        <ActionButton
          onClick={handleExport}
          disabled={isProcessing || isExporting || stats.cacheSize === 0}
          loading={isExporting}
          icon={Download}
          label={
            isExporting && exportProgress
              ? exportProgress.phase === 'compressing'
                ? `Compressing ${exportProgress.current}%`
                : `Generating ${exportProgress.current}/${exportProgress.total} files`
              : `Export ZIP (${stats.cacheSize.toLocaleString()} tiles)`
          }
          variant="success"
        />

        <ActionButton
          onClick={handleClearAll}
          disabled={isProcessing || isClearing}
          loading={isClearing}
          icon={Trash2}
          label="Clear All Data"
          variant="danger"
        />
      </div>

      <StatsDisplay stats={stats} />
    </div>
  );
}
