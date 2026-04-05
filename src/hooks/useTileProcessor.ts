import { useRef, useState, useCallback, useEffect, type MutableRefObject } from 'react';
import type { ProcessingStats, WorkerMessage } from '../types';
import {
  createCache,
  addTilesToCache,
  getCacheSize,
  clearCache,
  type CacheState,
} from '../services/cache';

export interface TileProcessorReturn {
  stats: ProcessingStats;
  renderTrigger: number;
  cacheRef: MutableRefObject<CacheState>;
  processGeoJSON: (file: File) => Promise<void>;
  processGeoTIFF: (file: File) => Promise<void>;
  resetUniqueTileCount: () => void;
}

const INITIAL_STATS: ProcessingStats = {
  cacheSize: 0,
  uniqueTileCount: 0,
  processedFeatures: 0,
  processedPixels: 0,
  processedRows: 0,
  totalRows: 0,
  elapsedMs: 0,
  isProcessing: false,
};

export function useTileProcessor(): TileProcessorReturn {
  const cacheRef = useRef<CacheState>(createCache());
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [stats, setStats] = useState<ProcessingStats>(INITIAL_STATS);
  const [renderTrigger, setRenderTrigger] = useState<number>(0);

  const updateStats = useCallback((overrides: Partial<ProcessingStats>) => {
    setStats((prev) => ({
      ...prev,
      cacheSize: getCacheSize(cacheRef.current),
      uniqueTileCount: cacheRef.current.newTileCount,
      elapsedMs: startTimeRef.current ? Date.now() - startTimeRef.current : prev.elapsedMs,
      ...overrides,
    }));
  }, []);

  const startTimer = useCallback(() => {
    startTimeRef.current = Date.now();
    timerRef.current = setInterval(() => {
      updateStats({});
    }, 1000);
  }, [updateStats]);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const processGeoJSON = useCallback(
    async (file: File) => {
      updateStats({ isProcessing: true, processedFeatures: 0 });
      startTimer();

      const buffer = await file.arrayBuffer();

      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(
          new URL('../workers/geojson.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const { type, tiles, stats: workerStats } = event.data;

          if (type === 'TILES_BATCH' && tiles) {
            addTilesToCache(cacheRef.current, tiles);
            updateStats({ processedFeatures: workerStats?.features ?? 0 });
          } else if (type === 'PROGRESS') {
            updateStats({ processedFeatures: workerStats?.features ?? 0 });
          } else if (type === 'COMPLETE') {
            stopTimer();
            updateStats({
              isProcessing: false,
              processedFeatures: workerStats?.features ?? 0,
            });
            setRenderTrigger((n) => n + 1);
            worker.terminate();
            resolve();
          } else if (type === 'ERROR') {
            stopTimer();
            updateStats({ isProcessing: false });
            worker.terminate();
            reject(new Error(event.data.error));
          }
        };

        worker.onerror = (err) => {
          stopTimer();
          updateStats({ isProcessing: false });
          worker.terminate();
          reject(err);
        };

        worker.postMessage({ type: 'PROCESS_GEOJSON', buffer, filename: file.name }, [buffer]);
      });
    },
    [updateStats, startTimer, stopTimer]
  );

  const processGeoTIFF = useCallback(
    async (file: File) => {
      updateStats({ isProcessing: true, processedPixels: 0, processedRows: 0, totalRows: 0 });
      startTimer();

      const buffer = await file.arrayBuffer();

      return new Promise<void>((resolve, reject) => {
        const worker = new Worker(
          new URL('../workers/geotiff.worker.ts', import.meta.url),
          { type: 'module' }
        );

        worker.onmessage = (event: MessageEvent<WorkerMessage>) => {
          const { type, tiles, stats: workerStats } = event.data;

          if (type === 'TILES_BATCH' && tiles) {
            addTilesToCache(cacheRef.current, tiles);
            updateStats({
              processedPixels: workerStats?.pixels ?? 0,
              processedRows: workerStats?.rows ?? 0,
              totalRows: workerStats?.totalRows ?? 0,
            });
          } else if (type === 'PROGRESS') {
            updateStats({
              processedPixels: workerStats?.pixels ?? 0,
              processedRows: workerStats?.rows ?? 0,
              totalRows: workerStats?.totalRows ?? 0,
            });
          } else if (type === 'COMPLETE') {
            stopTimer();
            updateStats({
              isProcessing: false,
              processedPixels: workerStats?.pixels ?? 0,
              processedRows: workerStats?.rows ?? 0,
              totalRows: workerStats?.totalRows ?? 0,
            });
            setRenderTrigger((n) => n + 1);
            worker.terminate();
            resolve();
          } else if (type === 'ERROR') {
            stopTimer();
            updateStats({ isProcessing: false });
            worker.terminate();
            reject(new Error(event.data.error));
          }
        };

        worker.onerror = (err) => {
          stopTimer();
          updateStats({ isProcessing: false });
          worker.terminate();
          reject(err);
        };

        worker.postMessage(
          { type: 'PROCESS_GEOTIFF', buffer },
          [buffer]
        );
      });
    },
    [updateStats, startTimer, stopTimer]
  );

  const resetUniqueTileCount = useCallback(() => {
    clearCache(cacheRef.current);
    setStats((prev) => ({ ...prev, cacheSize: 0, uniqueTileCount: 0 }));
    setRenderTrigger(0);
  }, []);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    stats,
    renderTrigger,
    cacheRef,
    processGeoJSON,
    processGeoTIFF,
    resetUniqueTileCount,
  };
}
