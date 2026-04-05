import JSZip from 'jszip';
import { cellToParent } from 'h3-js';
import type { Tile, ExportProgress } from '../types';

const RES6 = 6;
const CSV_COLUMNS = [
  'MongoID',
  'H3ID',
  'TileName',
  'TileCenterLongLat',
  'TileNeighbors',
  'TileEvents',
  'TileFeatures',
  'TileHeightMeters',
  'TileScores',
  'meta',
];

function generateMongoId(): string {
  const timestamp = Math.floor(Date.now() / 1000).toString(16).padStart(8, '0');
  const random = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return timestamp + random;
}

function escapeCsvField(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function tileToRow(tile: Tile): string {
  const fields = [
    generateMongoId(),
    tile.H3ID,
    tile.TileName || '',
    JSON.stringify(tile.TileCenterLongLat),
    JSON.stringify(tile.TileNeighbors),
    JSON.stringify(tile.TileEvents),
    JSON.stringify(tile.TileFeatures),
    tile.TileHeightMeters !== null && tile.TileHeightMeters !== undefined
      ? String(tile.TileHeightMeters)
      : '',
    JSON.stringify(tile.TileScores),
    JSON.stringify(tile.meta),
  ];
  return fields.map(escapeCsvField).join(',');
}

function groupTilesByRes6(tiles: Tile[]): Map<string, Tile[]> {
  const groups = new Map<string, Tile[]>();
  for (const tile of tiles) {
    try {
      const parent = cellToParent(tile.H3ID, RES6);
      if (!groups.has(parent)) groups.set(parent, []);
      groups.get(parent)!.push(tile);
    } catch {
      const fallback = 'unknown';
      if (!groups.has(fallback)) groups.set(fallback, []);
      groups.get(fallback)!.push(tile);
    }
  }
  return groups;
}

function generateCsv(tiles: Tile[]): string {
  const header = CSV_COLUMNS.join(',');
  const rows = tiles.map(tileToRow);
  return [header, ...rows].join('\n');
}

export async function exportTilesToZip(
  tiles: Tile[],
  onProgress?: (progress: ExportProgress) => void
): Promise<void> {
  onProgress?.({ current: 0, total: 0, phase: 'grouping' });

  const allTiles = tiles;
  if (allTiles.length === 0) {
    throw new Error('No tiles to export');
  }

  const groups = groupTilesByRes6(allTiles);
  const totalGroups = groups.size;
  const zip = new JSZip();

  let processed = 0;
  onProgress?.({ current: 0, total: totalGroups, phase: 'generating' });

  for (const [res6Id, tiles] of groups) {
    const csv = generateCsv(tiles);
    zip.file(`${res6Id}.csv`, csv);
    processed++;
    onProgress?.({ current: processed, total: totalGroups, phase: 'generating' });
  }

  onProgress?.({ current: 0, total: 1, phase: 'compressing' });

  const blob = await zip.generateAsync(
    { type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } },
    (metadata) => {
      onProgress?.({
        current: Math.round(metadata.percent),
        total: 100,
        phase: 'compressing',
      });
    }
  );

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tiles_export_${Date.now()}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  onProgress?.({ current: 1, total: 1, phase: 'done' });
}
