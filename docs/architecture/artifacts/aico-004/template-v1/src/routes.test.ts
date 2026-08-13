import { describe, expect, it } from 'vitest';

import { adjacentRoute, normalizeHashPath, routes } from './routes';

describe('fixed primary flow', () => {
  it('contains exactly five stable client routes', () => {
    expect(routes.map(({ path }) => path)).toEqual([
      '/start',
      '/input',
      '/options',
      '/summary',
      '/complete',
    ]);
  });

  it('fails safely to the start route for an unknown hash', () => {
    expect(normalizeHashPath('#/unknown').id).toBe('start');
  });

  it('bounds previous and next navigation to the primary flow', () => {
    expect(adjacentRoute('start', 'previous').id).toBe('start');
    expect(adjacentRoute('start', 'next').id).toBe('input');
    expect(adjacentRoute('complete', 'next').id).toBe('complete');
  });
});
