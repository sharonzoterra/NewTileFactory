import { fromArrayBuffer } from 'geotiff';
import { latLngToCell, cellToLatLng, gridDisk } from 'h3-js';
import type { Tile, WorkerMessage, WorkerCommand, TileFeatures } from '../types/index';

const RESOLUTION = 12;
const READ_BATCH_ROWS = 50;
const PROGRESS_EVERY_ROWS = 50;

function mercatorToLatLng(x: number, y: number): [number, number] {
  const lng = (x / 20037508.34) * 180;
  let lat = (y / 20037508.34) * 180;
  lat = (180 / Math.PI) * (2 * Math.atan(Math.exp((lat * Math.PI) / 180)) - Math.PI / 2);
  return [lat, lng];
}

function buildEmptyFeatures(): TileFeatures {
  return { hasBuildings: false, hasRoads: false, streetNames: [] };
}

function createElevationTile(h3Id: string, height: number): Tile {
  const [lat, lng] = cellToLatLng(h3Id);
  const neighbors = gridDisk(h3Id, 1).filter((n) => n !== h3Id);
  return {
    H3ID: h3Id,
    TileName: '',
    TileCenterLongLat: [lng, lat],
    TileNeighbors: neighbors,
    TileEvents: [],
    TileFeatures: buildEmptyFeatures(),
    TileHeightMeters: height,
    TileScores: {},
    meta: { source: 'elevation' },
  };
}

self.onmessage = async (event: MessageEvent<WorkerCommand>) => {
  const { buffer } = event.data;

  try {
    const tiff = await fromArrayBuffer(buffer);
    const image = await tiff.getImage();

    const width = image.getWidth();
    const height = image.getHeight();
    const fileDir = image.fileDirectory;

    const noDataValue: number | null = image.getGDALNoData();

    const tiepoint = await fileDir.loadValue('ModelTiepoint') as number[] | undefined;
    const pixelScale = await fileDir.loadValue('ModelPixelScale') as number[] | undefined;
    const modelTransformation = await fileDir.loadValue('ModelTransformation') as number[] | undefined;

    let tpPixelX = 0, tpPixelY = 0;
    let tpGeoX = 0, tpGeoY = 0;
    let xScale = 1, yScale = 1;
    let hasAffine = false;
    let affineA = 0, affineB = 0, affineC = 0, affineD = 0, affineE = 0, affineF = 0;

    if (tiepoint && tiepoint.length >= 6 && pixelScale && pixelScale.length >= 2) {
      tpPixelX = tiepoint[0];
      tpPixelY = tiepoint[1];
      tpGeoX = tiepoint[3];
      tpGeoY = tiepoint[4];
      xScale = pixelScale[0];
      yScale = pixelScale[1];
    } else if (modelTransformation && modelTransformation.length >= 12) {
      hasAffine = true;
      affineA = modelTransformation[0];
      affineB = modelTransformation[1];
      affineC = modelTransformation[3];
      affineD = modelTransformation[4];
      affineE = modelTransformation[5];
      affineF = modelTransformation[7];
    } else {
      const fallbackOrigin = image.getOrigin();
      const fallbackResolution = image.getResolution();
      tpPixelX = 0;
      tpPixelY = 0;
      tpGeoX = fallbackOrigin[0];
      tpGeoY = fallbackOrigin[1];
      xScale = Math.abs(fallbackResolution[0]);
      yScale = Math.abs(fallbackResolution[1]);
    }

    const geoKeyDir = image.getGeoKeys() as Record<string, number> | null;
    let isWebMercator = false;
    if (geoKeyDir) {
      const projectedCSType = geoKeyDir.ProjectedCSTypeGeoKey;
      if (projectedCSType === 3857 || projectedCSType === 900913) {
        isWebMercator = true;
      }
    }

    const pixelIsArea = geoKeyDir?.GTRasterTypeGeoKey === 1;
    const pixelOffset = pixelIsArea ? 0.5 : 0;

    if (!isWebMercator && !hasAffine) {
      const approxWidth = xScale * width;
      const approxHeight = yScale * height;
      if (approxWidth > 720 || approxHeight > 360) {
        isWebMercator = true;
      }
    }

    const effectiveColEnd = width;
    const rowStep = 4;
    const totalRows = Math.ceil(height / rowStep);

    const heightAccumulator = new Map<string, { sum: number; count: number }>();

    function finalFlush(): Tile[] {
      const tiles: Tile[] = [];
      for (const [h3Id, { sum, count }] of heightAccumulator) {
        tiles.push(createElevationTile(h3Id, sum / count));
      }
      heightAccumulator.clear();
      return tiles;
    }

    function toLatLng(pixX: number, pixY: number): [number, number] {
      let geoX: number, geoY: number;

      if (hasAffine) {
        geoX = affineA * pixX + affineB * pixY + affineC;
        geoY = affineD * pixX + affineE * pixY + affineF;
      } else {
        const colOffset = (pixX - tpPixelX) + pixelOffset;
        const rowOffset = (pixY - tpPixelY) + pixelOffset;
        geoX = tpGeoX + colOffset * xScale;
        geoY = tpGeoY - rowOffset * yScale;
      }

      if (isWebMercator) {
        return mercatorToLatLng(geoX, geoY);
      }
      return [geoY, geoX];
    }

    let processedRows = 0;
    let processedPixels = 0;

    for (let rowStart = 0; rowStart < height; rowStart += READ_BATCH_ROWS * rowStep) {
      const rowEnd = Math.min(rowStart + READ_BATCH_ROWS * rowStep, height);

      const rasterData = await image.readRasters({
        window: [0, rowStart, effectiveColEnd, rowEnd],
        samples: [0],
      }) as unknown as [ArrayLike<number> & { length: number }];

      const band = rasterData[0];
      const batchWidth = effectiveColEnd;
      const batchHeight = rowEnd - rowStart;

      for (let localRow = 0; localRow < batchHeight; localRow += rowStep) {
        const row = rowStart + localRow;
        const rowOffset = localRow * batchWidth;

        for (let col = 0; col < effectiveColEnd; col += 4) {
          const pixelVal = band[rowOffset + col] as number;

          if (pixelVal === undefined || pixelVal === null) continue;
          if (noDataValue !== null && Math.abs(pixelVal - noDataValue) < 1) continue;
          if (!isFinite(pixelVal)) continue;

          const [centerLat, centerLng] = toLatLng(col, row);

          if (!isFinite(centerLat) || !isFinite(centerLng)) continue;
          if (centerLat < -90 || centerLat > 90 || centerLng < -180 || centerLng > 180) continue;

          let cell: string;
          try {
            cell = latLngToCell(centerLat, centerLng, RESOLUTION);
          } catch {
            continue;
          }

          const acc = heightAccumulator.get(cell);
          if (acc) {
            acc.sum += pixelVal;
            acc.count++;
          } else {
            heightAccumulator.set(cell, { sum: pixelVal, count: 1 });
          }

          processedPixels++;
        }

        processedRows++;

        if (processedRows % PROGRESS_EVERY_ROWS === 0) {
          const progressMsg: WorkerMessage = {
            type: 'PROGRESS',
            stats: { pixels: processedPixels, rows: processedRows, totalRows },
          };
          self.postMessage(progressMsg);
        }
      }
    }

    const finalTiles = finalFlush();
    if (finalTiles.length > 0) {
      const batchMsg: WorkerMessage = {
        type: 'TILES_BATCH',
        tiles: finalTiles,
        stats: { pixels: processedPixels, rows: processedRows, totalRows },
      };
      self.postMessage(batchMsg);
    }

    const completeMsg: WorkerMessage = {
      type: 'COMPLETE',
      stats: { pixels: processedPixels, rows: processedRows, totalRows },
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
