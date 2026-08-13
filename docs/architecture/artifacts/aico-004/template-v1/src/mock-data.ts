export interface FixtureOption {
  id: string;
  title: string;
  description: string;
}

export const fixtureOptions: readonly FixtureOption[] = [
  {
    id: 'focused',
    title: 'Focused path',
    description: 'A concise local fixture emphasizing one primary task.',
  },
  {
    id: 'guided',
    title: 'Guided path',
    description:
      'A local fixture with more explanatory content and explicit recovery states.',
  },
];
