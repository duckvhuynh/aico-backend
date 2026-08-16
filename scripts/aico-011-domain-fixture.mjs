const NORTH = {
  founder: '019c1100-0000-7000-8000-000000000101',
  company: '019c1100-0000-7000-8000-000000000102',
  profileV1: '019c1100-0000-7000-8000-000000000103',
  profileV2: '019c1100-0000-7000-8000-000000000104',
  initiative: '019c1100-0000-7000-8000-000000000105',
  goalV1: '019c1100-0000-7000-8000-000000000106',
  goalV2: '019c1100-0000-7000-8000-000000000107',
  snapshot: '019c1100-0000-7000-8000-000000000108',
};

const SOUTH = {
  founder: '019c1100-0000-7000-8000-000000000201',
  company: '019c1100-0000-7000-8000-000000000202',
  profileV1: '019c1100-0000-7000-8000-000000000203',
  profileV2: '019c1100-0000-7000-8000-000000000204',
  initiative: '019c1100-0000-7000-8000-000000000205',
  goalV1: '019c1100-0000-7000-8000-000000000206',
  goalV2: '019c1100-0000-7000-8000-000000000207',
  snapshot: '019c1100-0000-7000-8000-000000000208',
};

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function structuredGoal(label, generation) {
  return {
    target_user: `${label} fixture operators`,
    problem: `The ${label} fixture ${generation} goal needs a bounded review workspace.`,
    desired_outcome: `Review one ${label} ${generation} proposal draft from mock data.`,
    primary_flow: `Create, review, and mark the ${label} ${generation} draft ready`,
    must_haves: [
      {
        id: 'MH-001',
        text: `Create a ${label} ${generation} proposal from structured mock data`,
      },
    ],
    non_goals: ['Payments', 'Production deployment', 'Customer identity'],
    visual_direction: 'Calm editorial workspace with mock records only',
    constraints: {
      max_screens: 5,
      primary_flows: 1,
      client_only: true,
      data_mode: 'mock_or_local',
    },
    reference_ids: [],
  };
}

function companyInsertSql(label, ids) {
  const priorGoal = structuredGoal(label, 'prior');
  const currentGoal = structuredGoal(label, 'current');
  return `
    INSERT INTO founders (id, auth_subject, display_name, status)
    VALUES (
      ${sqlLiteral(ids.founder)},
      ${sqlLiteral(`fixture:aico-011:${label}:founder`)},
      ${sqlLiteral(`${label} fixture founder`)},
      'ACTIVE'
    );

    INSERT INTO companies (id, founder_id, name, status)
    VALUES (
      ${sqlLiteral(ids.company)},
      ${sqlLiteral(ids.founder)},
      ${sqlLiteral(`${label} fixture company`)},
      'ACTIVE'
    );

    INSERT INTO company_profile_versions
      (id, company_id, version, purpose, target_customer, constraints, normalized_limits,
       sensitive_data_warning_acknowledged, created_by)
    VALUES
      (
        ${sqlLiteral(ids.profileV1)},
        ${sqlLiteral(ids.company)},
        1,
        ${sqlLiteral(`Help the ${label} fixture company prepare prior client proposals.`)},
        ${sqlLiteral(`${label} fixture operators serving mock accounts`)},
        '["No customer PII", "Mock or local data only"]'::jsonb,
        '{"max_screens":5,"primary_flows":1,"data_mode":"mock_or_local"}'::jsonb,
        true,
        ${sqlLiteral(ids.founder)}
      ),
      (
        ${sqlLiteral(ids.profileV2)},
        ${sqlLiteral(ids.company)},
        2,
        ${sqlLiteral(`Help the ${label} fixture company prepare current client proposals.`)},
        ${sqlLiteral(`${label} fixture operators serving mock accounts`)},
        '["No customer PII", "Mock or local data only"]'::jsonb,
        '{"max_screens":5,"primary_flows":1,"data_mode":"mock_or_local"}'::jsonb,
        true,
        ${sqlLiteral(ids.founder)}
      );

    UPDATE companies
    SET current_profile_version_id = ${sqlLiteral(ids.profileV2)}
    WHERE id = ${sqlLiteral(ids.company)};

    INSERT INTO initiatives (id, company_id, type, title, status)
    VALUES (
      ${sqlLiteral(ids.initiative)},
      ${sqlLiteral(ids.company)},
      'PROTOTYPE',
      ${sqlLiteral(`${label} fixture prototype`)},
      'ACTIVE'
    );

    INSERT INTO goal_versions
      (id, company_id, initiative_id, version, schema_version, structured_goal, attachment_ids, created_by)
    VALUES
      (
        ${sqlLiteral(ids.goalV1)},
        ${sqlLiteral(ids.company)},
        ${sqlLiteral(ids.initiative)},
        1,
        1,
        ${sqlLiteral(JSON.stringify(priorGoal))}::jsonb,
        '[]'::jsonb,
        ${sqlLiteral(ids.founder)}
      ),
      (
        ${sqlLiteral(ids.goalV2)},
        ${sqlLiteral(ids.company)},
        ${sqlLiteral(ids.initiative)},
        2,
        1,
        ${sqlLiteral(JSON.stringify(currentGoal))}::jsonb,
        '[]'::jsonb,
        ${sqlLiteral(ids.founder)}
      );

    UPDATE initiatives
    SET current_goal_version_id = ${sqlLiteral(ids.goalV2)}
    WHERE id = ${sqlLiteral(ids.initiative)};

    INSERT INTO context_snapshots
      (id, company_id, company_profile_version_id, goal_version_id, answer_version_ids)
    VALUES (
      ${sqlLiteral(ids.snapshot)},
      ${sqlLiteral(ids.company)},
      ${sqlLiteral(ids.profileV2)},
      ${sqlLiteral(ids.goalV2)},
      '[]'::jsonb
    );
  `;
}

function expectFailureSql({ name, sql, sqlstate, countSql, leakedMessage }) {
  return `
    DO $aico011$
    DECLARE
      before_count integer;
      after_count integer;
    BEGIN
      EXECUTE ${sqlLiteral(countSql)} INTO before_count;
      BEGIN
        EXECUTE ${sqlLiteral(sql)};
        RAISE EXCEPTION ${sqlLiteral(`${name} unexpectedly succeeded`)};
      EXCEPTION
        WHEN SQLSTATE ${sqlLiteral(sqlstate)} THEN
          NULL;
      END;
      EXECUTE ${sqlLiteral(countSql)} INTO after_count;
      IF after_count <> before_count THEN
        RAISE EXCEPTION ${sqlLiteral(leakedMessage)};
      END IF;
    END
    $aico011$;
  `;
}

export function proveAico011DomainSchema(query) {
  if (typeof query !== 'function') {
    throw new Error('AICO-011 domain proof requires a SQL query function.');
  }

  if (
    query(`
      SELECT
        to_regclass('public.founders') IS NOT NULL
        AND to_regclass('public.companies') IS NOT NULL
        AND to_regclass('public.company_profile_versions') IS NOT NULL
        AND to_regclass('public.initiatives') IS NOT NULL
        AND to_regclass('public.goal_versions') IS NOT NULL
        AND to_regclass('public.context_snapshots') IS NOT NULL
        AND EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND indexname = 'initiatives_one_active_prototype'
        );
    `) !== 't'
  ) {
    throw new Error('AICO-011 domain tables or one-active-initiative index are missing.');
  }

  query(companyInsertSql('north', NORTH));
  query(companyInsertSql('south', SOUTH));

  if (
    query(`
      SELECT
        (SELECT count(*) FROM companies WHERE id IN (${sqlLiteral(NORTH.company)}, ${sqlLiteral(SOUTH.company)})) = 2
        AND (SELECT count(*) FROM company_profile_versions WHERE company_id = ${sqlLiteral(NORTH.company)}) = 2
        AND (SELECT count(*) FROM company_profile_versions WHERE company_id = ${sqlLiteral(SOUTH.company)}) = 2
        AND (SELECT count(*) FROM goal_versions WHERE company_id = ${sqlLiteral(NORTH.company)}) = 2
        AND (SELECT count(*) FROM goal_versions WHERE company_id = ${sqlLiteral(SOUTH.company)}) = 2
        AND (SELECT current_profile_version_id FROM companies WHERE id = ${sqlLiteral(NORTH.company)}) = ${sqlLiteral(NORTH.profileV2)}
        AND (SELECT current_goal_version_id FROM initiatives WHERE id = ${sqlLiteral(NORTH.initiative)}) = ${sqlLiteral(NORTH.goalV2)}
        AND (SELECT count(*) FROM goal_versions WHERE company_id = ${sqlLiteral(NORTH.company)} AND initiative_id = ${sqlLiteral(SOUTH.initiative)}) = 0
        AND (SELECT count(*) FROM context_snapshots WHERE company_id = ${sqlLiteral(NORTH.company)} AND company_profile_version_id = ${sqlLiteral(SOUTH.profileV2)}) = 0;
    `) !== 't'
  ) {
    throw new Error('AICO-011 factory did not persist two isolated current/prior company graphs.');
  }

  query(
    expectFailureSql({
      name: 'invalid tenant goal relation',
      sql: `
        INSERT INTO goal_versions
          (id, company_id, initiative_id, version, schema_version, structured_goal, created_by)
        VALUES (
          '019c1100-0000-7000-8000-000000000901',
          ${sqlLiteral(NORTH.company)},
          ${sqlLiteral(SOUTH.initiative)},
          3,
          1,
          '{}'::jsonb,
          ${sqlLiteral(NORTH.founder)}
        )
      `,
      sqlstate: '23503',
      countSql: `SELECT count(*) FROM goal_versions WHERE company_id = ${sqlLiteral(NORTH.company)}`,
      leakedMessage: 'invalid tenant goal relation leaked a row',
    }),
  );

  query(
    expectFailureSql({
      name: 'duplicate profile version',
      sql: `
        INSERT INTO company_profile_versions
          (id, company_id, version, purpose, target_customer, normalized_limits,
           sensitive_data_warning_acknowledged, created_by)
        VALUES (
          '019c1100-0000-7000-8000-000000000902',
          ${sqlLiteral(NORTH.company)},
          2,
          'Duplicate profile version must fail closed.',
          'Migration verification',
          '{}'::jsonb,
          true,
          ${sqlLiteral(NORTH.founder)}
        )
      `,
      sqlstate: '23505',
      countSql: `SELECT count(*) FROM company_profile_versions WHERE company_id = ${sqlLiteral(NORTH.company)}`,
      leakedMessage: 'duplicate profile version leaked a row',
    }),
  );

  query(
    expectFailureSql({
      name: 'duplicate goal version',
      sql: `
        INSERT INTO goal_versions
          (id, company_id, initiative_id, version, schema_version, structured_goal, created_by)
        VALUES (
          '019c1100-0000-7000-8000-000000000903',
          ${sqlLiteral(NORTH.company)},
          ${sqlLiteral(NORTH.initiative)},
          2,
          1,
          '{}'::jsonb,
          ${sqlLiteral(NORTH.founder)}
        )
      `,
      sqlstate: '23505',
      countSql: `SELECT count(*) FROM goal_versions WHERE initiative_id = ${sqlLiteral(NORTH.initiative)}`,
      leakedMessage: 'duplicate goal version leaked a row',
    }),
  );

  query(
    expectFailureSql({
      name: 'second active prototype initiative',
      sql: `
        INSERT INTO initiatives (id, company_id, type, title, status)
        VALUES (
          '019c1100-0000-7000-8000-000000000904',
          ${sqlLiteral(NORTH.company)},
          'PROTOTYPE',
          'Second active initiative must fail closed',
          'DRAFT'
        )
      `,
      sqlstate: '23505',
      countSql: `SELECT count(*) FROM initiatives WHERE company_id = ${sqlLiteral(NORTH.company)}`,
      leakedMessage: 'second active initiative leaked a row',
    }),
  );

  if (
    query(`
      SELECT
        (SELECT count(*) FROM companies WHERE id IN (${sqlLiteral(NORTH.company)}, ${sqlLiteral(SOUTH.company)})) = 2
        AND (SELECT count(*) FROM initiatives WHERE company_id = ${sqlLiteral(NORTH.company)}) = 1
        AND (SELECT count(*) FROM goal_versions WHERE company_id = ${sqlLiteral(NORTH.company)}) = 2
        AND (SELECT count(*) FROM company_profile_versions WHERE company_id = ${sqlLiteral(NORTH.company)}) = 2;
    `) !== 't'
  ) {
    throw new Error('AICO-011 negative proofs did not leave the factory graph unchanged.');
  }
}
