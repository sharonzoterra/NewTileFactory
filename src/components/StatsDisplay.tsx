import React from 'react';
import { Cpu, Layers, Clock } from 'lucide-react';
import type { ProcessingStats } from '../types';

interface StatsDisplayProps {
  stats: ProcessingStats;
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toString();
}

function formatTime(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}h ${m % 60}m ${s % 60}s`;
  if (m > 0) return `${m}m ${s % 60}s`;
  return `${s}s`;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="bg-slate-800/60 rounded-xl p-3 border border-slate-700/50">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-slate-500 mb-0.5">{label}</p>
          <p className={`text-lg font-bold font-mono leading-none ${accent || 'text-slate-100'}`}>
            {value}
          </p>
          {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
        </div>
        <Icon size={16} className="text-slate-500 mt-0.5 shrink-0" />
      </div>
    </div>
  );
}

export function StatsDisplay({ stats }: StatsDisplayProps) {
  return (
    <div className="space-y-3">
      <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Statistics</h3>

      {stats.cacheSize > 0 && (
        <StatCard
          icon={Layers}
          label="Tiles in Memory"
          value={formatNumber(stats.cacheSize)}
          sub={stats.uniqueTileCount > 0 ? `${formatNumber(stats.uniqueTileCount)} new this session` : undefined}
          accent="text-sky-400"
        />
      )}

      {(stats.processedFeatures > 0 || stats.processedPixels > 0) && (
        <div className="grid grid-cols-2 gap-2">
          {stats.processedFeatures > 0 && (
            <StatCard
              icon={Cpu}
              label="Features"
              value={formatNumber(stats.processedFeatures)}
              accent="text-blue-400"
            />
          )}
          {stats.processedPixels > 0 && (
            <StatCard
              icon={Cpu}
              label="Pixels"
              value={formatNumber(stats.processedPixels)}
              sub={
                stats.totalRows > 0
                  ? `row ${stats.processedRows}/${stats.totalRows}`
                  : undefined
              }
              accent="text-teal-400"
            />
          )}
        </div>
      )}

      {stats.totalRows > 0 && (
        <div>
          <div className="flex justify-between text-xs text-slate-500 mb-1">
            <span>Rows processed</span>
            <span>
              {stats.processedRows}/{stats.totalRows}
            </span>
          </div>
          <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-teal-500 transition-all"
              style={{ width: `${(stats.processedRows / stats.totalRows) * 100}%` }}
            />
          </div>
        </div>
      )}

      {stats.isProcessing && (
        <StatCard
          icon={Clock}
          label="Elapsed"
          value={formatTime(stats.elapsedMs)}
          accent="text-slate-300"
        />
      )}
    </div>
  );
}
