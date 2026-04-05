import React, { useEffect, useRef } from 'react';
import L from 'leaflet';
import { isValidCell } from 'h3-js';
import type { Tile } from '../types';

interface MapViewProps {
  renderTrigger: number;
  tileCount: number;
  getAllTiles: () => Tile[];
  getTilesInBounds: (north: number, south: number, east: number, west: number, limit: number) => Tile[];
}

const MAX_RENDER = 3000;
const CIRCLE_RADIUS_M = 10;

function getColorPriority(tile: Tile): number {
  if (tile.TileFeatures.hasRoads) return 2;
  if (tile.TileFeatures.hasBuildings) return 1;
  return 0;
}

const ELEVATION_STOPS: Array<{ h: number; r: number; g: number; b: number }> = [
  { h: -20,   r: 32,  g: 100, b: 180 },
  { h: 0,     r: 100, g: 180, b: 100 },
  { h: 300,   r: 180, g: 220, b: 80  },
  { h: 800,   r: 240, g: 200, b: 60  },
  { h: 1500,  r: 210, g: 120, b: 40  },
  { h: 2300,  r: 160, g: 60,  b: 30  },
  { h: 3000,  r: 255, g: 255, b: 255 },
];

function getTileColor(tile: Tile): string {
  if (tile.TileFeatures.hasRoads) return '#000000';
  if (tile.TileFeatures.hasBuildings) return '#6b7280';

  const h = tile.TileHeightMeters;
  if (h === null || h === undefined) return '#6b7280';

  const stops = ELEVATION_STOPS;
  if (h <= stops[0].h) return `rgb(${stops[0].r},${stops[0].g},${stops[0].b})`;
  if (h >= stops[stops.length - 1].h) {
    const s = stops[stops.length - 1];
    return `rgb(${s.r},${s.g},${s.b})`;
  }

  let lo = stops[0], hi = stops[1];
  for (let i = 1; i < stops.length; i++) {
    if (h <= stops[i].h) { lo = stops[i - 1]; hi = stops[i]; break; }
  }

  const t = (h - lo.h) / (hi.h - lo.h);
  const r = Math.round(lo.r + (hi.r - lo.r) * t);
  const g = Math.round(lo.g + (hi.g - lo.g) * t);
  const b = Math.round(lo.b + (hi.b - lo.b) * t);
  return `rgb(${r},${g},${b})`;
}

function metersToPixelRadius(map: L.Map, lat: number, meters: number): number {
  const zoom = map.getZoom();
  const metersPerPixel = (156543.03392 * Math.cos((lat * Math.PI) / 180)) / Math.pow(2, zoom);
  const r = meters / metersPerPixel;
  return Math.max(3, Math.min(r, 12));
}

export function MapView({ renderTrigger, tileCount, getAllTiles, getTilesInBounds }: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const canvasRendererRef = useRef<L.Canvas | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);
  const renderedIdsRef = useRef<Set<string>>(new Set());
  const circleMapRef = useRef<Map<string, L.CircleMarker>>(new Map());
  const tilePriorityRef = useRef<Map<string, number>>(new Map());
  const viewportLoadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addTilesToLayer = (tiles: Tile[]) => {
    if (!layerGroupRef.current || !mapRef.current || !canvasRendererRef.current) return;
    const map = mapRef.current;
    const group = layerGroupRef.current;
    const renderer = canvasRendererRef.current;

    for (const tile of tiles) {
      if (!isValidCell(tile.H3ID)) continue;

      const newPriority = getColorPriority(tile);
      const existingPriority = tilePriorityRef.current.get(tile.H3ID);

      if (renderedIdsRef.current.has(tile.H3ID)) {
        if (existingPriority !== undefined && newPriority <= existingPriority) continue;
        const oldCircle = circleMapRef.current.get(tile.H3ID);
        if (oldCircle) group.removeLayer(oldCircle);
        circleMapRef.current.delete(tile.H3ID);
        renderedIdsRef.current.delete(tile.H3ID);
      }

      const [lng, lat] = tile.TileCenterLongLat;
      const isBuiltFeature = tile.TileFeatures.hasRoads || tile.TileFeatures.hasBuildings;
      const radius = isBuiltFeature ? 1 : metersToPixelRadius(map, lat, CIRCLE_RADIUS_M);
      const color = getTileColor(tile);

      const circle = L.circleMarker([lat, lng], {
        radius,
        fillColor: color,
        fillOpacity: 1,
        stroke: false,
        interactive: false,
        renderer,
      });

      group.addLayer(circle);
      circleMapRef.current.set(tile.H3ID, circle);
      renderedIdsRef.current.add(tile.H3ID);
      tilePriorityRef.current.set(tile.H3ID, newPriority);
    }
  };

  const loadViewportTilesRef = useRef<() => void>(() => {});

  loadViewportTilesRef.current = () => {
    if (!mapRef.current) return;
    const bounds = mapRef.current.getBounds();
    if (mapRef.current.getZoom() < 10) return;

    const cacheTiles = getTilesInBounds(
      bounds.getNorth(),
      bounds.getSouth(),
      bounds.getEast(),
      bounds.getWest(),
      MAX_RENDER
    );

    const newTiles: Tile[] = [];
    for (const tile of cacheTiles) {
      const existingPriority = tilePriorityRef.current.get(tile.H3ID);
      const incomingPriority = getColorPriority(tile);
      if (existingPriority !== undefined && incomingPriority <= existingPriority) continue;
      newTiles.push(tile);
    }

    addTilesToLayer(newTiles);
  };

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [20, 0],
      zoom: 3,
      preferCanvas: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
    }).addTo(map);

    const renderer = L.canvas({ padding: 0.5 });
    const group = L.layerGroup().addTo(map);

    canvasRendererRef.current = renderer;
    layerGroupRef.current = group;
    mapRef.current = map;

    map.on('moveend zoomend', () => {
      if (viewportLoadTimerRef.current) clearTimeout(viewportLoadTimerRef.current);
      viewportLoadTimerRef.current = setTimeout(() => {
        loadViewportTilesRef.current();
      }, 400);
    });

    return () => {
      if (viewportLoadTimerRef.current) clearTimeout(viewportLoadTimerRef.current);
      map.remove();
      mapRef.current = null;
      canvasRendererRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (tileCount === 0) {
      renderedIdsRef.current.clear();
      circleMapRef.current.clear();
      tilePriorityRef.current.clear();
      if (layerGroupRef.current) layerGroupRef.current.clearLayers();
    }
  }, [tileCount]);

  useEffect(() => {
    if (renderTrigger === 0) return;

    const tiles = getAllTiles();
    if (!tiles.length) return;

    if (layerGroupRef.current) layerGroupRef.current.clearLayers();
    renderedIdsRef.current.clear();
    circleMapRef.current.clear();
    tilePriorityRef.current.clear();

    addTilesToLayer(tiles);

    if (mapRef.current) {
      const firstValid = tiles.find((t) => isValidCell(t.H3ID));
      if (firstValid && mapRef.current.getZoom() < 5) {
        const [lng, lat] = firstValid.TileCenterLongLat;
        mapRef.current.setView([lat, lng], 10, { animate: true });
      }
    }
  }, [renderTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="relative w-full h-full">
      <div ref={containerRef} className="w-full h-full" />

      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-3 bg-slate-900/90 backdrop-blur rounded-xl px-4 py-2 border border-slate-700/60 pointer-events-none z-[1000]">
        {[
          { color: '#000000', label: 'Road' },
          { color: '#6b7280', label: 'Built' },
          { color: 'rgb(32,100,180)', label: '<0m' },
          { color: 'rgb(100,180,100)', label: '0m' },
          { color: 'rgb(180,220,80)', label: '300m' },
          { color: 'rgb(240,200,60)', label: '800m' },
          { color: 'rgb(210,120,40)', label: '1500m' },
          { color: 'rgb(160,60,30)', label: '2300m' },
          { color: 'rgb(255,255,255)', label: '3000m' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
            <span className="text-xs text-slate-400">{label}</span>
          </div>
        ))}
      </div>

      {tileCount === 0 && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-[999]">
          <div className="text-center bg-slate-900/80 backdrop-blur rounded-2xl px-8 py-6 border border-slate-700/50">
            <div className="w-12 h-12 mx-auto mb-3 rounded-xl bg-slate-800 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-6 h-6 text-slate-500" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path d="M20.618 5.984A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <p className="text-sm font-medium text-slate-400">No tiles loaded</p>
            <p className="text-xs text-slate-600 mt-1">Upload and process files to see tiles</p>
          </div>
        </div>
      )}
    </div>
  );
}
