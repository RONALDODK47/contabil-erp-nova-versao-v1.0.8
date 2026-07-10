/**
 * One-off: envia todos os escritórios Docker → Supabase e clona dados para tokens de produção.
 */
import pg from 'pg';
import '../load-env.mjs';
import { syncToSupabase } from './sync-to-supabase.mjs';

const SOURCE = 'CL-FN14-AZ4ZV81Y';
const TARGETS = ['INOV', 'CL-FN1A-AZ4ZV31Y', 'CL-FN16-A24ZV81V', 'CL-FM16-A24ZV81V'];

const remoteUrl = String(process.env.SUPABASE_DATABASE_URL || '').trim();
if (!remoteUrl) {
  console.error('SUPABASE_DATABASE_URL ausente');
  process.exit(1);
}

const pool = new pg.Pool({
  connectionString: remoteUrl,
  ssl: { rejectUnauthorized: false },
});

async function cloneOffice(source, target) {
  const src = String(source || '').trim();
  const tgt = String(target || '').trim();
  if (!src || !tgt || src === tgt) return;

  await pool.query(
    `INSERT INTO access_tokens (token, label, active) VALUES ($1, $2, TRUE)
     ON CONFLICT (token) DO UPDATE SET active = TRUE, label = EXCLUDED.label`,
    [tgt, tgt],
  );

  const office = await pool.query(`SELECT * FROM offices WHERE office_token = $1`, [src]);
  if (!office.rows[0]) {
    console.warn(`[clone] origem ${src} ausente`);
    return;
  }
  const row = office.rows[0];

  await pool.query(
    `INSERT INTO offices (
       office_token, name, companies_registry, selected_company,
       pricing_companies_registry, pricing_selected_company,
       simulador_contracts, simulador_parcelamentos, simulador_aplicacoes, simulador_precificacao,
       extra_storage, updated_at, updated_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     ON CONFLICT (office_token) DO UPDATE SET
       name = EXCLUDED.name,
       companies_registry = EXCLUDED.companies_registry,
       selected_company = EXCLUDED.selected_company,
       pricing_companies_registry = EXCLUDED.pricing_companies_registry,
       pricing_selected_company = EXCLUDED.pricing_selected_company,
       simulador_contracts = EXCLUDED.simulador_contracts,
       simulador_parcelamentos = EXCLUDED.simulador_parcelamentos,
       simulador_aplicacoes = EXCLUDED.simulador_aplicacoes,
       simulador_precificacao = EXCLUDED.simulador_precificacao,
       extra_storage = EXCLUDED.extra_storage,
       updated_at = EXCLUDED.updated_at,
       updated_by = EXCLUDED.updated_by`,
    [
      tgt,
      row.name || tgt,
      JSON.stringify(row.companies_registry || []),
      row.selected_company || '',
      JSON.stringify(row.pricing_companies_registry || []),
      row.pricing_selected_company || '',
      JSON.stringify(row.simulador_contracts || []),
      JSON.stringify(row.simulador_parcelamentos || []),
      JSON.stringify(row.simulador_aplicacoes || []),
      JSON.stringify(row.simulador_precificacao || []),
      JSON.stringify(row.extra_storage || {}),
      new Date(),
      'clone-push-all',
    ],
  );

  await pool.query(`DELETE FROM company_manager_data WHERE office_token = $1`, [tgt]);
  const managers = await pool.query(
    `SELECT company_slug, company_name, suffix, data, updated_at
     FROM company_manager_data WHERE office_token = $1`,
    [src],
  );
  for (const m of managers.rows) {
    await pool.query(
      `INSERT INTO company_manager_data
         (office_token, company_slug, company_name, suffix, data, updated_at)
       VALUES ($1,$2,$3,$4,$5::jsonb,$6)`,
      [tgt, m.company_slug, m.company_name, m.suffix, JSON.stringify(m.data || []), m.updated_at || new Date()],
    );
  }

  console.log(
    `[clone] ${src} → ${tgt}: ${JSON.stringify(row.companies_registry || []).length || (row.companies_registry?.length ?? 0)} empresas, ${managers.rowCount} managers`,
  );
}

const tokens = ['CL-FN14-AZ4ZV81Y', 'INOV'];
for (const token of tokens) {
  const r = await syncToSupabase({ officeToken: token, applySchema: token === tokens[0] });
  if (!r.ok) {
    console.error(`[push] falha ${token}:`, r.error);
    process.exit(1);
  }
}

for (const target of TARGETS) {
  if (target === SOURCE) continue;
  await cloneOffice(SOURCE, target);
}

const summary = await pool.query(`
  SELECT office_token,
         jsonb_array_length(companies_registry) AS empresas,
         (SELECT count(*)::int FROM company_manager_data m WHERE m.office_token = o.office_token) AS managers
  FROM offices o
  ORDER BY office_token
`);
console.log('[summary]', summary.rows);
await pool.end();
