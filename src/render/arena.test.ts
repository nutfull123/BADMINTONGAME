import { describe, expect, it } from 'vitest';
import {
  AD_BRANDS,
  ARENA_ASSETS,
  COURT_MAT_COLOR,
  HALL_DIMENSIONS,
  HALL_FLOOR_COLOR,
  anisotropyForQuality,
  buildAdBoardPlacements,
  buildStandSeats,
  computeSpectatorSwayY,
  computeSurfaceRepeat,
  shouldUpdateSway,
  spectatorCountForQuality,
} from './arena';
import { COURT } from '../physics';

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function linearLuminance(hex: number): number {
  const r = srgbToLinear(((hex >> 16) & 0xff) / 255);
  const g = srgbToLinear(((hex >> 8) & 0xff) / 255);
  const b = srgbToLinear((hex & 0xff) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function hsvSaturation(hex: number): number {
  const r = ((hex >> 16) & 0xff) / 255;
  const g = ((hex >> 8) & 0xff) / 255;
  const b = (hex & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return max === 0 ? 0 : (max - min) / max;
}

describe('arena pure layout & quality helpers', () => {
  it('defines hall dimensions around 30 m wide, 44 m long, 12 m ceiling', () => {
    expect(HALL_DIMENSIONS.halfWidth).toBe(15);
    expect(HALL_DIMENSIONS.halfLength).toBe(22);
    expect(HALL_DIMENSIONS.ceilingHeight).toBe(12);
  });

  it('places every seat outside the court + 2 m run-off, inside the hall, and never in the near camera corridor', () => {
    const seats = buildStandSeats();
    expect(seats.length).toBeGreaterThanOrEqual(48);

    const minCourtRunoffX = COURT.halfWidthDoubles + 2; // 3.05 + 2 = 5.05 m
    const minCourtRunoffZ = COURT.halfLength + 2;       // 6.7 + 2 = 8.7 m

    for (const s of seats) {
      // Inside the hall
      expect(Math.abs(s.x)).toBeLessThan(HALL_DIMENSIONS.halfWidth);
      expect(Math.abs(s.z)).toBeLessThan(HALL_DIMENSIONS.halfLength);
      expect(s.y).toBeGreaterThan(0);
      expect(s.y).toBeLessThan(HALL_DIMENSIONS.ceilingHeight - 1.5);

      // Outside the court + 2 m run-off
      const outsideX = Math.abs(s.x) >= minCourtRunoffX;
      const outsideZ = Math.abs(s.z) >= minCourtRunoffZ;
      expect(outsideX || outsideZ).toBe(true);

      // Never in the near camera corridor (|x| < 6 and z > 6.7)
      const inNearCameraCorridor = Math.abs(s.x) < 6 && s.z > COURT.halfLength;
      expect(inNearCameraCorridor).toBe(false);

      // Side stands start around |x| >= 7; far stand starts around z <= -10.5
      if (s.stand === 'west' || s.stand === 'east') {
        expect(Math.abs(s.x)).toBeGreaterThanOrEqual(7);
      } else {
        expect(s.stand).toBe('far');
        expect(s.z).toBeLessThanOrEqual(-10.5);
      }
    }
  });

  it('raises seat rows as they move further away from the court', () => {
    const seats = buildStandSeats();
    for (const stand of ['west', 'east', 'far'] as const) {
      const byRow = new Map<number, { dist: number; y: number }>();
      for (const s of seats.filter((seat) => seat.stand === stand)) {
        const dist = stand === 'far' ? -s.z : Math.abs(s.x);
        const prev = byRow.get(s.row);
        if (!prev) {
          byRow.set(s.row, { dist, y: s.y });
        } else {
          expect(s.y).toBeCloseTo(prev.y, 5);
          expect(dist).toBeCloseTo(prev.dist, 5);
        }
      }
      const rows = [...byRow.entries()].sort((a, b) => a[0] - b[0]);
      expect(rows.length).toBeGreaterThanOrEqual(3);
      for (let i = 1; i < rows.length; i++) {
        expect(rows[i][1].dist).toBeGreaterThan(rows[i - 1][1].dist);
        expect(rows[i][1].y).toBeGreaterThan(rows[i - 1][1].y);
      }
    }
  });

  it('interleaves seats across stands and rows so the first half covers every row of every stand evenly', () => {
    const seats = buildStandSeats();
    const halfCount = spectatorCountForQuality('medium', seats.length);
    const firstHalf = seats.slice(0, halfCount);

    const counts = { west: 0, east: 0, far: 0 };
    const rowsByStand = {
      west: new Set<number>(),
      east: new Set<number>(),
      far: new Set<number>(),
    };
    const allRowsByStand = {
      west: new Set<number>(),
      east: new Set<number>(),
      far: new Set<number>(),
    };
    for (const s of seats) allRowsByStand[s.stand].add(s.row);
    for (const s of firstHalf) {
      counts[s.stand]++;
      rowsByStand[s.stand].add(s.row);
    }

    expect(counts.west).toBeGreaterThan(0);
    expect(counts.east).toBeGreaterThan(0);
    expect(counts.far).toBeGreaterThan(0);
    // West and east stands are symmetric and should have near-equal representation in the first half
    expect(Math.abs(counts.west - counts.east)).toBeLessThanOrEqual(2);
    // Every row of every stand must be populated in the first half (not only the front rows)
    expect(rowsByStand.west.size).toBe(allRowsByStand.west.size);
    expect(rowsByStand.east.size).toBe(allRowsByStand.east.size);
    expect(rowsByStand.far.size).toBe(allRowsByStand.far.size);
  });

  it('returns spectator count per quality: low = 0, medium = about half, high = all', () => {
    const total = 96;
    expect(spectatorCountForQuality('low', total)).toBe(0);
    const medium = spectatorCountForQuality('medium', total);
    expect(medium).toBeGreaterThanOrEqual(Math.floor(total * 0.45));
    expect(medium).toBeLessThanOrEqual(Math.ceil(total * 0.55));
    expect(spectatorCountForQuality('high', total)).toBe(total);
  });

  it('places fictional advertising boards outside the court and clear of the near camera corridor across their full extent', () => {
    expect(AD_BRANDS).toEqual(['BADMINTON 3D', 'SHUTTLE CUP', 'SMASH ARENA', 'NET KINGS']);
    const boards = buildAdBoardPlacements();
    expect(boards.length).toBeGreaterThanOrEqual(6);
    for (const b of boards) {
      expect(b.height).toBeCloseTo(0.9, 2);
      // A board rotated by rotY = ±PI/2 spans along Z by ±width/2; rotY = 0 spans along X by ±width/2.
      const halfSpanX = Math.abs(Math.cos(b.rotY)) * (b.width * 0.5);
      const halfSpanZ = Math.abs(Math.sin(b.rotY)) * (b.width * 0.5);
      const minX = b.x - halfSpanX;
      const maxX = b.x + halfSpanX;
      const maxZ = b.z + halfSpanZ;

      // Every board must end at z <= 6.7 (COURT.halfLength) and never overlap the near camera corridor (|x| < 6, z > 6.7)
      expect(maxZ).toBeLessThanOrEqual(COURT.halfLength);
      const overlapsCorridorX = minX < 6 && maxX > -6;
      const inNearCameraCorridor = overlapsCorridorX && maxZ > COURT.halfLength;
      expect(inNearCameraCorridor).toBe(false);
    }
  });

  it('computes bounded idle sway offset for high-quality spectator motion', () => {
    const y0 = computeSpectatorSwayY(0, 0);
    const y1 = computeSpectatorSwayY(0.8, 3);
    expect(Math.abs(y0)).toBeLessThanOrEqual(0.05);
    expect(Math.abs(y1)).toBeLessThanOrEqual(0.05);
    expect(y1).not.toBeCloseTo(y0, 4);
  });

  it('keeps the wood hall floor darker and less saturated than the green court mat', () => {
    expect(linearLuminance(HALL_FLOOR_COLOR)).toBeLessThan(linearLuminance(COURT_MAT_COLOR));
    expect(hsvSaturation(HALL_FLOOR_COLOR)).toBeLessThan(hsvSaturation(COURT_MAT_COLOR));
  });

  it('resets the sway timer when elapsed restarts at a smaller value instead of freezing', () => {
    expect(shouldUpdateSway(0, -1, 0.22)).toBe(true);
    expect(shouldUpdateSway(10.1, 10.0, 0.22)).toBe(false);
    expect(shouldUpdateSway(10.25, 10.0, 0.22)).toBe(true);
    // Restart: elapsed drops from 10.0 back to 0.05 -> must update immediately and reset timer
    expect(shouldUpdateSway(0.05, 10.0, 0.22)).toBe(true);
  });

  it('caps texture anisotropy by quality (low = 1, medium <= 4, high <= 8) and hardware max', () => {
    expect(anisotropyForQuality('low', 16)).toBe(1);
    expect(anisotropyForQuality('medium', 16)).toBe(4);
    expect(anisotropyForQuality('high', 16)).toBe(8);
    expect(anisotropyForQuality('high', 2)).toBe(2);
    expect(anisotropyForQuality('medium', 2)).toBe(2);
  });

  it('computes real-scale 2 m texture repeat counts and references the approved CC0 asset paths', () => {
    const floorRepeat = computeSurfaceRepeat(HALL_DIMENSIONS.halfWidth * 2, HALL_DIMENSIONS.halfLength * 2, 2);
    expect(floorRepeat).toEqual({ x: 15, y: 22 });

    const matW = COURT.halfWidthDoubles * 2 + 1.8;
    const matL = COURT.halfLength * 2 + 1.8;
    const matRepeat = computeSurfaceRepeat(matW, matL, 2);
    expect(matRepeat.x).toBeCloseTo(matW / 2, 3);
    expect(matRepeat.y).toBeCloseTo(matL / 2, 3);

    expect(ARENA_ASSETS.hdri).toBe('/assets/hdri/gym_01_1k.hdr');
    expect(ARENA_ASSETS.woodDiff).toBe('/assets/textures/wooden_floor_01_diff_1k.jpg');
    expect(ARENA_ASSETS.woodNor).toBe('/assets/textures/wooden_floor_01_nor_gl_1k.jpg');
    expect(ARENA_ASSETS.woodRough).toBe('/assets/textures/wooden_floor_01_rough_1k.jpg');
    expect(ARENA_ASSETS.matNor).toBe('/assets/textures/linoleum_brown_nor_gl_1k.jpg');
    expect(ARENA_ASSETS.matRough).toBe('/assets/textures/linoleum_brown_rough_1k.jpg');
  });
});
