import type { A7ControlMutation, A7ThreatCase, ProofControls } from './contracts';

const target = 'test/aico-007-spike/contracts.ts';

export interface A7SourceControlMutation {
  id: A7ControlMutation;
  control: keyof ProofControls;
  target: string;
  intendedCases: readonly A7ThreatCase[];
  search: string;
  replacement: string;
}

const disable = (
  id: A7ControlMutation,
  control: keyof ProofControls,
  intendedCases: readonly A7ThreatCase[],
): A7SourceControlMutation => ({
  id,
  control,
  target,
  intendedCases,
  search: `  ${control}: true,`,
  replacement: `  ${control}: false, // MUTANT ${id}: accepted control removed.`,
});

export const A7_SOURCE_CONTROL_MUTATIONS: readonly A7SourceControlMutation[] = [
  disable('A7-M-01', 'originAndHostIsolation', ['A7-T-ORIGIN-SITE-01', 'A7-T-HOST-TLS-01']),
  disable('A7-M-02', 'cookieIsolation', ['A7-T-COOKIE-01', 'A7-T-COOKIE-STORAGE-01']),
  disable('A7-M-03', 'storageAndWorkerIsolation', ['A7-T-STORAGE-01', 'A7-T-SERVICE-WORKER-01']),
  disable('A7-M-04', 'openerNavigationAndFrameIsolation', [
    'A7-T-OPENER-NAV-01',
    'A7-T-NAVIGATION-01',
    'A7-T-FRAME-ANCESTOR-01',
    'A7-T-FRAME-CHILD-01',
  ]),
  disable('A7-M-05', 'exactCspAndTargetDenial', [
    'A7-T-SCRIPT-TARGET-01',
    'A7-T-CONNECT-01',
    'A7-T-FORM-01',
    'A7-T-CONTROL-REQUEST-01',
  ]),
  disable('A7-M-06', 'scriptAndMimeIntegrity', ['A7-T-SCRIPT-01', 'A7-T-MIME-01']),
  disable('A7-M-07', 'currentAuthorityAndExactBindings', [
    'A7-T-AUTHORITY-SOURCE-01',
    'A7-T-ACCESS-BINDING-01',
    'A7-T-FOREIGN-01',
    'A7-T-FOREIGN-PREVIEW-01',
  ]),
  disable('A7-M-08', 'buildAndServeIntegrity', [
    'A7-T-BUILD-STATE-01',
    'A7-T-INTEGRITY-01',
    'A7-T-SERVE-INTEGRITY-01',
  ]),
  disable('A7-M-09', 'authorizeBeforeCache', [
    'A7-T-CACHE-01',
    'A7-T-CACHE-KEY-01',
    'A7-T-HISTORY-01',
  ]),
  disable('A7-M-10', 'expiryRevocationAndNonce', [
    'A7-T-EXPIRY-REVOCATION-01',
    'A7-T-REVOCATION-01',
    'A7-T-REPLAY-01',
  ]),
  disable('A7-M-11', 'methodPathAndReferrerSafety', [
    'A7-T-PATH-01',
    'A7-T-DOWNLOAD-01',
    'A7-T-REFERRER-01',
  ]),
  disable('A7-M-12', 'cleanupDisclosureRedactionAndEvidence', [
    'A7-T-CLEANUP-01',
    'A7-T-UNKNOWN-OUTCOME-01',
    'A7-T-LOG-01',
    'A7-T-DISCLOSURE-01',
    'A7-T-REDACTION-01',
    'A7-T-EVIDENCE-01',
  ]),
];
