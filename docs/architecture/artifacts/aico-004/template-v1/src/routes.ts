export const routes = [
  { id: 'start', path: '/start', label: 'Start' },
  { id: 'input', path: '/input', label: 'Input' },
  { id: 'options', path: '/options', label: 'Options' },
  { id: 'summary', path: '/summary', label: 'Summary' },
  { id: 'complete', path: '/complete', label: 'Complete' },
] as const;

export type RouteId = (typeof routes)[number]['id'];
export type RouteDefinition = (typeof routes)[number];

export const normalizeHashPath = (hash: string): RouteDefinition => {
  const path = hash.replace(/^#/, '') || '/start';
  return routes.find((route) => route.path === path) ?? routes[0]!;
};

export const adjacentRoute = (
  routeId: RouteId,
  direction: 'previous' | 'next',
): RouteDefinition => {
  const index = routes.findIndex((route) => route.id === routeId);
  const offset = direction === 'next' ? 1 : -1;
  const target = Math.min(routes.length - 1, Math.max(0, index + offset));
  return routes[target]!;
};
