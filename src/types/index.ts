export interface TileFeatures {
  hasBuildings: boolean;
  hasRoads: boolean;
  streetNames: string[];
}

export interface Tile {
  H3ID: string;
  TileName: string;
  TileCenterLongLat: [number, number];
  TileNeighbors: string[];
  TileEvents: unknown[];
  TileFeatures: TileFeatures;
  TileHeightMeters: number | null;
  TileScores: Record<string, number>;
  meta: Record<string, unknown>;
}

export type LayerType = 'buildings' | 'roads' | 'places' | 'unknown';

export type WorkerMessageType = 'TILES_BATCH' | 'PROGRESS' | 'COMPLETE' | 'ERROR';

export interface WorkerProgressStats {
  features?: number;
  pixels?: number;
  rows?: number;
  totalRows?: number;
  totalFeatures?: number;
}

export interface WorkerMessage {
  type: WorkerMessageType;
  tiles?: Tile[];
  stats?: WorkerProgressStats;
  error?: string;
}

export interface WorkerCommand {
  type: 'PROCESS_GEOJSON' | 'PROCESS_GEOTIFF';
  buffer: ArrayBuffer;
  filename?: string;
}

export interface ProcessingStats {
  cacheSize: number;
  uniqueTileCount: number;
  processedFeatures: number;
  processedPixels: number;
  processedRows: number;
  totalRows: number;
  elapsedMs: number;
  isProcessing: boolean;
}

export interface ExportProgress {
  current: number;
  total: number;
  phase: 'grouping' | 'generating' | 'compressing' | 'done';
}
