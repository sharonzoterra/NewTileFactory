import { useCallback } from 'react';
import { ControlPanel } from './components/ControlPanel';
import { MapView } from './components/MapView';
import { useTileProcessor } from './hooks/useTileProcessor';
import { exportTilesToZip } from './services/export';
import { getAllCachedTiles, getTilesInBounds } from './services/cache';
import type { ExportProgress } from './types';

export default function App() {
  const {
    stats,
    renderTrigger,
    cacheRef,
    processGeoJSON,
    processGeoTIFF,
    resetUniqueTileCount,
  } = useTileProcessor();

  const handleProcessGeoJSON = useCallback(
    async (files: File[]) => {
      for (const file of files) {
        await processGeoJSON(file);
      }
    },
    [processGeoJSON]
  );

  const handleProcessGeoTIFF = useCallback(
    async (file: File) => {
      await processGeoTIFF(file);
    },
    [processGeoTIFF]
  );

  const handleExport = useCallback(async (onProgress: (p: ExportProgress) => void) => {
    const tiles = getAllCachedTiles(cacheRef.current);
    await exportTilesToZip(tiles, onProgress);
  }, [cacheRef]);

  const handleClearAll = useCallback(async () => {
    resetUniqueTileCount();
  }, [resetUniqueTileCount]);

  const handleGetAllTiles = useCallback(() => {
    return getAllCachedTiles(cacheRef.current);
  }, [cacheRef]);

  const handleGetTilesInBounds = useCallback(
    (north: number, south: number, east: number, west: number, limit: number) => {
      return getTilesInBounds(cacheRef.current, north, south, east, west, limit);
    },
    [cacheRef]
  );

  return (
    <div className="h-screen w-screen bg-slate-950 flex overflow-hidden">
      <aside className="w-80 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
        <ControlPanel
          stats={stats}
          onProcessGeoJSON={handleProcessGeoJSON}
          onProcessGeoTIFF={handleProcessGeoTIFF}
          onExport={handleExport}
          onClearAll={handleClearAll}
        />
      </aside>

      <main className="flex-1 relative overflow-hidden">
        <MapView
          renderTrigger={renderTrigger}
          tileCount={stats.cacheSize}
          getAllTiles={handleGetAllTiles}
          getTilesInBounds={handleGetTilesInBounds}
        />
      </main>
    </div>
  );
}
