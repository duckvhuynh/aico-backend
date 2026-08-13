import { useEffect, useMemo, useState } from 'react';

import { fixtureOptions } from './mock-data';
import {
  adjacentRoute,
  normalizeHashPath,
  routes,
  type RouteId,
} from './routes';

type ViewState = 'loading' | 'empty' | 'error' | 'success';

const warning = 'Prototype only - not a live production system.';

const navigate = (path: string) => {
  window.location.hash = path;
};

export function App() {
  const [routeId, setRouteId] = useState<RouteId>(
    () => normalizeHashPath(location.hash).id,
  );
  const [viewState, setViewState] = useState<ViewState>('success');
  const [selectedOption, setSelectedOption] = useState(
    fixtureOptions[0]?.id ?? '',
  );

  useEffect(() => {
    const updateRoute = () => setRouteId(normalizeHashPath(location.hash).id);
    window.addEventListener('hashchange', updateRoute);
    if (!location.hash) navigate('/start');
    return () => window.removeEventListener('hashchange', updateRoute);
  }, []);

  const route =
    routes.find((candidate) => candidate.id === routeId) ?? routes[0];
  const option = useMemo(
    () => fixtureOptions.find((candidate) => candidate.id === selectedOption),
    [selectedOption],
  );

  const renderSuccess = () => {
    if (route.id === 'start') {
      return (
        <p>
          This fixed template demonstrates one bounded, local-only prototype
          flow.
        </p>
      );
    }
    if (route.id === 'input') {
      return (
        <fieldset>
          <legend>Choose a local fixture</legend>
          {fixtureOptions.map((candidate) => (
            <label className="choice" key={candidate.id}>
              <input
                checked={selectedOption === candidate.id}
                name="fixture-option"
                onChange={() => setSelectedOption(candidate.id)}
                type="radio"
                value={candidate.id}
              />
              <span>
                <strong>{candidate.title}</strong>
                <small>{candidate.description}</small>
              </span>
            </label>
          ))}
        </fieldset>
      );
    }
    if (route.id === 'options') {
      return (
        <p>Selected fixture: {option?.title ?? 'No local fixture selected'}.</p>
      );
    }
    if (route.id === 'summary') {
      return (
        <p>
          Review complete. Nothing has been stored remotely or sent over a
          network.
        </p>
      );
    }
    return (
      <p>
        The prototype flow is complete. This result is not a production
        transaction.
      </p>
    );
  };

  const renderState = () => {
    if (viewState === 'loading')
      return <p role="status">Loading the local fixture…</p>;
    if (viewState === 'empty') {
      return (
        <div>
          <p>No local fixture is available.</p>
          <button onClick={() => setViewState('success')} type="button">
            Restore fixture
          </button>
        </div>
      );
    }
    if (viewState === 'error') {
      return (
        <div role="alert">
          <p>The local demonstration could not be shown.</p>
          <button onClick={() => setViewState('success')} type="button">
            Retry locally
          </button>
        </div>
      );
    }
    return renderSuccess();
  };

  const previous = adjacentRoute(route.id, 'previous');
  const next = adjacentRoute(route.id, 'next');

  return (
    <div className="app-shell">
      <header>
        <p className="eyebrow">Fixed prototype template · candidate v1</p>
        <div className="warning" role="note">
          {warning}
        </div>
        <nav aria-label="Prototype progress">
          <ol>
            {routes.map((item, index) => (
              <li
                aria-current={item.id === route.id ? 'step' : undefined}
                key={item.id}
              >
                <button onClick={() => navigate(item.path)} type="button">
                  <span aria-hidden="true">{index + 1}</span> {item.label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <main id="main-content">
        <section aria-labelledby="screen-title" className="card">
          <p className="step-label">
            Step {routes.findIndex((item) => item.id === route.id) + 1} of{' '}
            {routes.length}
          </p>
          <h1 id="screen-title">{route.label}</h1>

          <div
            className="state-switcher"
            role="group"
            aria-label="Demonstration state"
          >
            {(['loading', 'empty', 'error', 'success'] as const).map(
              (state) => (
                <button
                  aria-pressed={viewState === state}
                  key={state}
                  onClick={() => setViewState(state)}
                  type="button"
                >
                  {state}
                </button>
              ),
            )}
          </div>

          <div className="content-region">{renderState()}</div>

          <div className="actions">
            <button
              disabled={route.id === 'start'}
              onClick={() => navigate(previous.path)}
              type="button"
            >
              Back
            </button>
            {route.id === 'complete' ? (
              <button
                className="primary"
                onClick={() => {
                  setSelectedOption(fixtureOptions[0]?.id ?? '');
                  setViewState('success');
                  navigate('/start');
                }}
                type="button"
              >
                Restart prototype
              </button>
            ) : (
              <button
                className="primary"
                onClick={() => navigate(next.path)}
                type="button"
              >
                Continue
              </button>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
