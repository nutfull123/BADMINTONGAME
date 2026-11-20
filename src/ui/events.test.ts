import { describe, it, expect } from 'vitest';
import { EVENTS, eventsFor, fitEvent } from './events';

describe('event filter by gender', () => {
  it('men get MS MD XD, women get WS WD XD', () => {
    expect(eventsFor('male')).toEqual(['MS', 'MD', 'XD']);
    expect(eventsFor('female')).toEqual(['WS', 'WD', 'XD']);
  });
  it('keeps a valid event and moves an invalid one to the first valid', () => {
    expect(fitEvent('XD', 'female')).toBe('XD');
    expect(fitEvent('MD', 'male')).toBe('MD');
    expect(fitEvent('MS', 'female')).toBe('WS');
    expect(fitEvent('WD', 'male')).toBe('MS');
  });
  it('has Thai and English labels for all five events', () => {
    expect(EVENTS.map((e) => e.value)).toEqual(['MS', 'WS', 'MD', 'WD', 'XD']);
    expect(EVENTS.find((e) => e.value === 'XD')!.label).toBe('คู่ผสม XD');
  });
});
