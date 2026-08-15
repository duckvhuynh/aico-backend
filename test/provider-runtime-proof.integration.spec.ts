import {
  A5_ACCEPTANCE_IDS,
  A5_FIXTURE_IDS,
  A5_SCENARIO_IDS,
  A5_SCENARIO_REGISTRY,
  type A5AcceptanceCase,
  type A5ScenarioId,
} from './aico-005-spike/contracts';
import { runAico005ProviderRuntimeProof } from './aico-005-spike/provider-runtime-proof.service';

const enabled = process.env.AICO_REQUIRE_PROVIDER_RUNTIME_PROOF === 'true';
const describeProof = enabled ? describe : describe.skip;

function selectedCase(): A5AcceptanceCase | undefined {
  const value = process.env.AICO005_ONLY_CASE;
  if (value === undefined) return undefined;
  if (!A5_ACCEPTANCE_IDS.includes(value as A5AcceptanceCase)) {
    throw new Error('AICO005_PROOF_UNKNOWN_CASE_SELECTOR');
  }
  return value as A5AcceptanceCase;
}

function selectedScenario(): A5ScenarioId | undefined {
  const value = process.env.AICO005_ONLY_SCENARIO;
  if (value === undefined) return undefined;
  if (!A5_SCENARIO_IDS.includes(value as A5ScenarioId)) {
    throw new Error('AICO005_PROOF_UNKNOWN_SCENARIO_SELECTOR');
  }
  return value as A5ScenarioId;
}

describeProof('AICO-005 deterministic provider-runtime boundary proof', () => {
  jest.setTimeout(120_000);

  it('proves the closed accepted scenario registry with bounded evidence', async () => {
    expect(A5_ACCEPTANCE_IDS).toHaveLength(13);
    expect(new Set(A5_ACCEPTANCE_IDS).size).toBe(13);
    expect(A5_FIXTURE_IDS).toHaveLength(15);
    expect(new Set(A5_FIXTURE_IDS).size).toBe(15);
    expect(A5_SCENARIO_REGISTRY).toHaveLength(64);
    expect(new Set(A5_SCENARIO_IDS).size).toBe(64);

    const onlyCase = selectedCase();
    const onlyScenario = selectedScenario();
    const evidence = await runAico005ProviderRuntimeProof({
      onlyCase,
      onlyScenario,
      repositorySha: process.env.AICO_PROVIDER_RUNTIME_PROOF_REPOSITORY_SHA ?? 'UNCOMMITTED',
      dirtyDevelopmentEvidence:
        process.env.AICO_PROVIDER_RUNTIME_PROOF_DIRTY_DEVELOPMENT !== 'false',
    });

    const expectedScenarios = A5_SCENARIO_REGISTRY.filter((definition) => {
      if (onlyScenario !== undefined) return definition.id === onlyScenario;
      if (onlyCase !== undefined) return definition.acceptanceId === onlyCase;
      return true;
    });
    expect(evidence.selectedScenarios).toEqual(expectedScenarios.map(({ id }) => id));
    expect(evidence.passedScenarios).toBe(expectedScenarios.length);
    expect(evidence.scenarioEvidence).toHaveLength(expectedScenarios.length);
    expect(evidence.externalProviderCalls).toBe(0);
    expect(evidence.paidExternalServices).toBe(0);
    expect(evidence.productionCredentials).toBe(0);
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  });
});
