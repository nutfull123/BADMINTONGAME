import { describe, expect, it } from 'vitest';
import {
  AD_BRANDS,
  HALL_DIMENSIONS,
  buildAdBoardPlacements,
  buildStandSeats,
  computeSpectatorSwayY,
  spectatorCountForQuality,
} from './arena';
import { COURT } from '../physics';

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

  it('interleaves seats across stands so the first half covers west, east and far stands evenly', () => {
    const seats = buildStandSeats();
    const halfCount = spectatorCountForQuality('medium', seats.length);
    const firstHalf = seats.slice(0, halfCount);

    const counts = { west: 0, east: 0, far: 0 };
    for (const s of firstHalf) counts[s.stand]++;

    expect(counts.west).toBeGreaterThan(0);
    expect(counts.east).toBeGreaterThan(0);
    expect(counts.far).toBeGreaterThan(0);
    // West and east stands are symmetric and should have near-equal representation in the first half
    expect(Math.abs(counts.west - counts.east)).toBeLessThanOrEqual(2);
  });

  it('returns spectator count per quality: low = 0, medium = about half, high = all', () => {
    const total = 96;
    expect(spectatorCountForQuality('low', total)).toBe(0);
    const medium = spectatorCountForQuality('medium', total);
    expect(medium).toBeGreaterThanOrEqual(Math.floor(total * 0.45));
    expect(medium).toBeLessThanOrEqual(Math.ceil(total * 0.55));
    expect(spectatorCountForQuality('high', total)).toBe(total);
  });

  it('places fictional advertising boards outside the court and clear of the near camera corridor', () => {
    expect(AD_BRANDS).toEqual(['BADMINTON 3D', 'SHUTTLE CUP', 'SMASH ARENA', 'NET KINGS']);
    const boards = buildAdBoardPlacements();
    expect(boards.length).toBeGreaterThanOrEqual(6);
    for (const b of boards) {
      expect(b.height).toBeCloseTo(0.9, 2);
      const inNearCameraCorridor = Math.abs(b.x) < 6 && b.z > COURT.halfLength;
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
});
