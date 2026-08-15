import type { ProofControls } from './contracts';

const target = 'test/aico-005-spike/contracts.ts';

export type A5SourceControlMutationId = `A5-M-${string}`;

export interface A5SourceControlMutation {
  id: A5SourceControlMutationId;
  control: keyof ProofControls;
  target: string;
  intendedScenarios: readonly string[];
  search: string;
  replacement: string;
}

const disable = (
  id: A5SourceControlMutationId,
  control: keyof ProofControls,
  intendedScenarios: readonly string[],
): A5SourceControlMutation => ({
  id,
  control,
  target,
  intendedScenarios,
  search: `  ${control}: true,`,
  replacement: `  ${control}: false, // MUTANT ${id}: accepted control removed.`,
});

export const A5_SOURCE_CONTROL_MUTATIONS: readonly A5SourceControlMutation[] = [
  disable('A5-M-01', 'dtoAllowlist', ['A5-S-MALFORMED-WIRE']),
  disable('A5-M-02', 'exactRequestTargetBinding', ['A5-S-SUCCESS-LINEAGE']),
  disable('A5-M-03', 'strictSchemaValidation', ['A5-S-MALFORMED-MISSING']),
  disable('A5-M-04', 'semanticValidation', ['A5-S-MALFORMED-SEMANTIC']),
  disable('A5-M-05', 'outputSizeValidation', ['A5-S-MALFORMED-OVERSIZE']),
  disable('A5-M-06', 'zeroAuthorityBeforeCommit', ['A5-S-SUCCESS-ZERO-AUTHORITY']),
  disable('A5-M-07', 'distinctRepairInvocation', ['A5-S-REPAIR-NEW-INVOCATION']),
  disable('A5-M-08', 'disjointRepairReservations', ['A5-S-REPAIR-DISJOINT-RESERVATION']),
  disable('A5-M-09', 'safeRepairDiagnostics', ['A5-S-REPAIR-SAFE-DIAGNOSTICS']),
  disable('A5-M-10', 'repairCap', ['A5-S-REPAIR-EXHAUSTED']),
  disable('A5-M-11', 'preDispatchDeadline', ['A5-S-TIMEOUT-PRE-DISPATCH']),
  disable('A5-M-12', 'postDispatchUnknown', ['A5-S-TIMEOUT-POST-DISPATCH']),
  disable('A5-M-13', 'abortSignalPropagation', ['A5-S-CANCEL-SIGNAL']),
  disable('A5-M-14', 'lateResultCommitFence', ['A5-S-CANCEL-LATE-SUCCESS']),
  disable('A5-M-15', 'sdkRetriesDisabled', ['A5-S-RATE-SDK-ZERO']),
  disable('A5-M-16', 'persistedRetryNoSleep', ['A5-S-RATE-PERSISTED']),
  disable('A5-M-17', 'retryHintBounds', ['A5-S-RATE-DEADLINE']),
  disable('A5-M-18', 'atomicIdempotency', ['A5-S-REPLAY-DUPLICATE']),
  disable('A5-M-19', 'unknownReconciliation', ['A5-S-REPLAY-UNKNOWN']),
  disable('A5-M-20', 'terminalSafetyAndRedaction', ['A5-S-SAFETY-TERMINAL']),
  disable('A5-M-21', 'redactedSuccessValidation', ['A5-S-SAFETY-REDACTED']),
  disable('A5-M-22', 'evidenceSinkRedaction', ['A5-S-SECRET-EVIDENCE']),
  disable('A5-M-23', 'usageCostProvenance', ['A5-S-META-ACCOUNTING']),
  disable('A5-M-24', 'reservationVarianceReconciliation', ['A5-S-META-RESERVATION']),
  disable('A5-M-25', 'metricLabelAllowlist', ['A5-S-META-BOUNDED']),
  disable('A5-M-26', 'resolvedTargetDrift', ['A5-S-VERSION-DRIFT']),
  disable('A5-M-27', 'eligibleNewHistoricalLineage', ['A5-S-VERSION-HISTORY']),
  disable('A5-M-28', 'halfOpenNoFallback', ['A5-S-VERSION-CIRCUIT']),
  disable('A5-M-29', 'deterministicProductionRejection', ['A5-S-VERSION-PRODUCTION']),
  disable('A5-M-30', 'externalActivationRejection', ['A5-S-VERSION-EXTERNAL']),
];
