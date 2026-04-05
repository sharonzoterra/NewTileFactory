import {
  latLngToCell,
  cellToLatLng,
  gridDisk,
  gridPathCells,
  polygonToCells,
} from 'h3-js';
import type { Tile, LayerType, WorkerMessage, WorkerCommand, TileFeatures } from '../types/index';

const RESOLUTION = 12;
const BATCH_SIZE = 50;

function detectFeatureType(feature: GeoJSON.Feature): LayerType {
  const props = feature.properties || {};
  if (props.building || props.shop) return 'buildings';
  if (props.amenity) return 'buildings';
  if (props.highway || props.road || props.street) return 'roads';
  if (props.place || props.admin_level || props.landuse) return 'places';
  return 'unknown';
}

function getFeatureName(feature: GeoJSON.Feature, layerType: LayerType): string {
  const props = feature.properties || {};
  if (layerType === 'roads') {
    return props.name || props.highway || props.road || '';
  }
  if (layerType === 'places') {
    return props.name || props.place || '';
  }
  return props.name || props.title || '';
}

function getH3CellsForGeometry(geometry: GeoJSON.Geometry): string[] {
  const cells: string[] = [];

  if (geometry.type === 'Point') {
    const [lng, lat] = geometry.coordinates as [number, number];
    try {
      cells.push(latLngToCell(lat, lng, RESOLUTION));
    } catch {/* skip invalid */}

  } else if (geometry.type === 'LineString') {
    const coords = geometry.coordinates as [number, number][];
    let prevCell: string | null = null;
    for (const [lng, lat] of coords) {
      try {
        const cell = latLngToCell(lat, lng, RESOLUTION);
        if (prevCell && prevCell !== cell) {
          try {
            const path = gridPathCells(prevCell, cell);
            cells.push(...path);
          } catch {
            cells.push(cell);
          }
        } else {
          cells.push(cell);
        }
        prevCell = cell;
      } catch {/* skip */}
    }

  } else if (geometry.type === 'MultiLineString') {
    for (const line of geometry.coordinates as [number, number][][]) {
      const lineGeom: GeoJSON.LineString = { type: 'LineString', coordinates: line };
      cells.push(...getH3CellsForGeometry(lineGeom));
    }

  } else if (geometry.type === 'Polygon') {
    const coords = geometry.coordinates as [number, number][][];
    try {
      const outer = coords[0].map(([lng, lat]) => [lat, lng] as [number, number]);
      const holes = coords.slice(1).map((ring) =>
        ring.map(([lng, lat]) => [lat, lng] as [number, number])
      );
      const h3Polygon = { outer, holes: holes.length > 0 ? holes : [] };
      const found = polygonToCells(h3Polygon, RESOLUTION);
      cells.push(...found);
      if (found.length === 0) {
        const centroid = computeCentroid(coords[0]);
        cells.push(latLngToCell(centroid[1], centroid[0], RESOLUTION));
      }
    } catch {/* skip */}

  } else if (geometry.type === 'MultiPolygon') {
    for (const poly of geometry.coordinates as [number, number][][][]) {
      const polyGeom: GeoJSON.Polygon = { type: 'Polygon', coordinates: poly };
      cells.push(...getH3CellsForGeometry(polyGeom));
    }

  } else if (geometry.type === 'GeometryCollection') {
    for (const g of geometry.geometries) {
      cells.push(...getH3CellsForGeometry(g));
    }
  }

  return [...new Set(cells)];
}

function computeCentroid(coords: [number, number][]): [number, number] {
  let sumLng = 0, sumLat = 0;
  for (const [lng, lat] of coords) {
    sumLng += lng;
    sumLat += lat;
  }
  return [sumLng / coords.length, sumLat / coords.length];
}

function buildEmptyFeatures(): TileFeatures {
  return { hasBuildings: false, hasRoads: false, streetNames: [] };
}

function createTile(h3Id: string, name: string, features: TileFeatures): Tile {
  const [lat, lng] = cellToLatLng(h3Id);
  const neighbors = gridDisk(h3Id, 1).filter((n) => n !== h3Id);
  return {
    H3ID: h3Id,
    TileName: name,
    TileCenterLongLat: [lng, lat],
    TileNeighbors: neighbors,
    TileEvents: [],
    TileFeatures: features,
    TileHeightMeters: null,
    TileScores: {},
    meta: {},
  };
}

function mergeTileFeatures(existing: TileFeatures, incoming: TileFeatures): TileFeatures {
  return {
    hasBuildings: existing.hasBuildings || incoming.hasBuildings,
    hasRoads: existing.hasRoads || incoming.hasRoads,
    streetNames: Array.from(new Set([...existing.streetNames, ...incoming.streetNames])),
  };
}

function namePriority(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return a;
}

self.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const { buffer } = event.data;

  try {
    const text = new TextDecoder().decode(buffer);
    const geojson = JSON.parse(text) as GeoJSON.FeatureCollection;

    if (!geojson.features || !Array.isArray(geojson.features)) {
      throw new Error('Invalid GeoJSON: expected FeatureCollection with features array');
    }

    const features = geojson.features;
    const tileMap = new Map<string, Tile>();

    const totalFeatures = features.length;
    let processedFeatures = 0;

    for (let i = 0; i < features.length; i += BATCH_SIZE) {
      const batch = features.slice(i, i + BATCH_SIZE);

      for (const feature of batch) {
        if (!feature.geometry) continue;

        const featureType = detectFeatureType(feature);
        const name = getFeatureName(feature, featureType);
        const featureFlags: TileFeatures = {
          hasBuildings: featureType === 'buildings',
          hasRoads: featureType === 'roads',
          streetNames: featureType === 'roads' && name ? [name] : [],
        };

        let cells: string[];
        try {
          cells = getH3CellsForGeometry(feature.geometry);
        } catch {
          continue;
        }

        for (const cell of cells) {
          const existing = tileMap.get(cell);
          if (existing) {
            existing.TileFeatures = mergeTileFeatures(existing.TileFeatures, featureFlags);
            existing.TileName = namePriority(
              featureType === 'roads' ? name : existing.TileName,
              featureType === 'roads' ? existing.TileName : name
            );
          } else {
            tileMap.set(cell, createTile(cell, name, { ...featureFlags }));
          }
        }

        processedFeatures++;
      }

      const newTiles = Array.from(tileMap.values());
      tileMap.clear();

      const progressMsg: WorkerMessage = {
        type: 'TILES_BATCH',
        tiles: newTiles,
        stats: {
          features: processedFeatures,
          totalFeatures,
        },
      };
      self.postMessage(progressMsg);
    }

    const completeMsg: WorkerMessage = {
      type: 'COMPLETE',
      stats: { features: processedFeatures, totalFeatures },
    };
    self.postMessage(completeMsg);

  } catch (err) {
    const errorMsg: WorkerMessage = {
      type: 'ERROR',
      error: err instanceof Error ? err.message : String(err),
    };
    self.postMessage(errorMsg);
  }
};
