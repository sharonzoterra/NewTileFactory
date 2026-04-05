import type { Tile } from '../types';

export interface CacheState {
  tiles: Map<string, Tile>;
  newTileCount: number;
}

export function createCache(): CacheState {
  return {
    tiles: new Map(),
    newTileCount: 0,
  };
}

export function addTilesToCache(state: CacheState, incoming: Tile[]): void {
  for (const tile of incoming) {
    const existing = state.tiles.get(tile.H3ID);
    if (existing) {
      state.tiles.set(tile.H3ID, mergeCachedTile(existing, tile));
    } else {
      state.tiles.set(tile.H3ID, tile);
      state.newTileCount++;
    }
  }
}

export function clearCache(state: CacheState): void {
  state.tiles.clear();
  state.newTileCount = 0;
}

export function resetNewTileCount(state: CacheState): void {
  state.newTileCount = 0;
}

export function getCacheSize(state: CacheState): number {
  return state.tiles.size;
}

export function getAllCachedTiles(state: CacheState): Tile[] {
  return Array.from(state.tiles.values());
}

export function getTilesInBounds(
  state: CacheState,
  north: number,
  south: number,
  east: number,
  west: number,
  limit: number
): Tile[] {
  const results: Tile[] = [];
  for (const tile of state.tiles.values()) {
    const [lng, lat] = tile.TileCenterLongLat;
    if (lat >= south && lat <= north && lng >= west && lng <= east) {
      results.push(tile);
      if (results.length >= limit) break;
    }
  }
  return results;
}

function mergeCachedTile(existing: Tile, incoming: Tile): Tile {
  return {
    ...existing,
    TileName: incoming.TileName || existing.TileName,
    TileHeightMeters: incoming.TileHeightMeters ?? existing.TileHeightMeters,
    TileFeatures: {
      hasBuildings: existing.TileFeatures.hasBuildings || incoming.TileFeatures.hasBuildings,
      hasRoads: existing.TileFeatures.hasRoads || incoming.TileFeatures.hasRoads,
      streetNames: Array.from(
        new Set([...existing.TileFeatures.streetNames, ...incoming.TileFeatures.streetNames])
      ),
    },
    TileNeighbors:
      incoming.TileNeighbors.length > 0 ? incoming.TileNeighbors : existing.TileNeighbors,
    TileScores: { ...existing.TileScores, ...incoming.TileScores },
    meta: { ...existing.meta, ...incoming.meta },
  };
}
