import { Platform } from 'react-native'
import { getDatabase } from '@/database/client'

export async function initializeDatabase() {
  if (Platform.OS === 'web') {
    return null
  }

  const db = await getDatabase()

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS cached_queue_items (
      owner_tenant_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      remote_id TEXT NOT NULL,
      service_id TEXT NOT NULL,
      contract_id TEXT,
      unit_id TEXT,
      scaffold_id TEXT,
      status TEXT NOT NULL,
      payload TEXT NOT NULL,
      fetched_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      PRIMARY KEY (owner_tenant_id, owner_user_id, remote_id)
    );

    CREATE TABLE IF NOT EXISTS outbox_items (
      owner_tenant_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      remote_id TEXT,
      contract_id TEXT,
      unit_id TEXT,
      sync_status TEXT NOT NULL,
      retry_count INTEGER NOT NULL DEFAULT 0,
      error_message TEXT,
      payload TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_tenant_id, owner_user_id, local_id)
    );

    CREATE TABLE IF NOT EXISTS sync_state (
      owner_tenant_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_tenant_id, owner_user_id, key)
    );

    CREATE TABLE IF NOT EXISTS reference_records (
      owner_tenant_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      cache_key TEXT NOT NULL,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_tenant_id, owner_user_id, cache_key)
    );

    CREATE TABLE IF NOT EXISTS local_scaffold_services (
      owner_tenant_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      local_id TEXT NOT NULL,
      local_scaffold_id TEXT NOT NULL,
      remote_id TEXT,
      type TEXT NOT NULL,
      planned_unit TEXT NOT NULL,
      planned_quantity REAL,
      description TEXT,
      scaffold_code TEXT,
      scaffold_description TEXT,
      contract_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      sync_status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (owner_tenant_id, owner_user_id, local_id)
    );
  `)

  const ownedTableDefinitions: Record<string, string> = {
    cached_queue_items: `
      CREATE TABLE cached_queue_items (
        owner_tenant_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        remote_id TEXT NOT NULL,
        service_id TEXT NOT NULL,
        contract_id TEXT,
        unit_id TEXT,
        scaffold_id TEXT,
        status TEXT NOT NULL,
        payload TEXT NOT NULL,
        fetched_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        PRIMARY KEY (owner_tenant_id, owner_user_id, remote_id)
      );`,
    outbox_items: `
      CREATE TABLE outbox_items (
        owner_tenant_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        remote_id TEXT,
        contract_id TEXT,
        unit_id TEXT,
        sync_status TEXT NOT NULL,
        retry_count INTEGER NOT NULL DEFAULT 0,
        error_message TEXT,
        payload TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_tenant_id, owner_user_id, local_id)
      );`,
    sync_state: `
      CREATE TABLE sync_state (
        owner_tenant_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        key TEXT NOT NULL,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_tenant_id, owner_user_id, key)
      );`,
    reference_records: `
      CREATE TABLE reference_records (
        owner_tenant_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        cache_key TEXT NOT NULL,
        payload TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_tenant_id, owner_user_id, cache_key)
      );`,
    local_scaffold_services: `
      CREATE TABLE local_scaffold_services (
        owner_tenant_id TEXT NOT NULL,
        owner_user_id TEXT NOT NULL,
        local_id TEXT NOT NULL,
        local_scaffold_id TEXT NOT NULL,
        remote_id TEXT,
        type TEXT NOT NULL,
        planned_unit TEXT NOT NULL,
        planned_quantity REAL,
        description TEXT,
        scaffold_code TEXT,
        scaffold_description TEXT,
        contract_id TEXT NOT NULL,
        unit_id TEXT NOT NULL,
        sync_status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY (owner_tenant_id, owner_user_id, local_id)
      );`,
  }

  for (const [tableName, createStatement] of Object.entries(ownedTableDefinitions)) {
    const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`)
    if (columns.some((column) => column.name === 'owner_tenant_id')) {
      continue
    }

    const quarantineTable = `${tableName}_unowned_v1`
    await db.execAsync(`
      ALTER TABLE ${tableName} RENAME TO ${quarantineTable};
      ${createStatement}
    `)
  }

  await db.execAsync(`
    CREATE INDEX IF NOT EXISTS idx_cached_queue_owner_scope
      ON cached_queue_items (owner_tenant_id, owner_user_id, contract_id, unit_id);
    CREATE INDEX IF NOT EXISTS idx_outbox_owner_status
      ON outbox_items (owner_tenant_id, owner_user_id, sync_status, created_at);
    CREATE INDEX IF NOT EXISTS idx_local_services_owner_scope
      ON local_scaffold_services (owner_tenant_id, owner_user_id, contract_id, unit_id);
  `)

  const userVersion = await db.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  )
  if ((userVersion?.user_version ?? 0) < 2) {
    await db.withExclusiveTransactionAsync(async (tx) => {
      const columns = await tx.getAllAsync<{ name: string }>(
        'PRAGMA table_info(outbox_items)',
      )
      const names = new Set(columns.map((column) => column.name))
      const additions = [
        ['idempotency_key', 'TEXT'],
        ['next_attempt_at', 'TEXT'],
        ['locked_at', 'TEXT'],
        ['lease_until', 'TEXT'],
        ['lease_owner', 'TEXT'],
        ['last_error_code', 'TEXT'],
      ] as const
      for (const [name, type] of additions) {
        if (!names.has(name)) {
          await tx.execAsync(`ALTER TABLE outbox_items ADD COLUMN ${name} ${type};`)
        }
      }
      await tx.execAsync(`
        UPDATE outbox_items
        SET idempotency_key = local_id
        WHERE idempotency_key IS NULL;

        UPDATE outbox_items
        SET sync_status = 'pending', locked_at = NULL, lease_until = NULL, lease_owner = NULL
        WHERE sync_status = 'syncing';

        CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_owner_idempotency
          ON outbox_items (owner_tenant_id, owner_user_id, idempotency_key);
        CREATE INDEX IF NOT EXISTS idx_outbox_owner_ready
          ON outbox_items (
            owner_tenant_id,
            owner_user_id,
            sync_status,
            next_attempt_at,
            lease_until,
            created_at
          );
        PRAGMA user_version = 2;
      `)
    })
  }

  return db
}
