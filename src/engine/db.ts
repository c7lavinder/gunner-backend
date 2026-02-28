import { Pool, QueryResult } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

export const query = async (text: string, params?: any[]): Promise<QueryResult> => {
  try {
    const res = await pool.query(text, params);
    return res;
  } catch (err) {
    console.error('Database query error:', err);
    throw err;
  }
};

export const initDB = async () => {
  const client = await pool.connect();
  try {
    console.log('Initializing database schema...');
    await client.query('BEGIN');

    // 1. Events Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL DEFAULT 'nah',
        contact_id TEXT NOT NULL,
        opportunity_id TEXT,
        event_type TEXT NOT NULL,
        stage_id TEXT,
        pipeline_id TEXT,
        raw_payload JSONB NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        processed BOOLEAN DEFAULT FALSE
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_contact ON events(contact_id, created_at DESC);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_events_type ON events(event_type, created_at DESC);`);

    // 2. Lead State Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS lead_state (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL DEFAULT 'nah',
        contact_id TEXT NOT NULL UNIQUE,
        opportunity_id TEXT,
        pipeline_id TEXT,
        current_stage TEXT,
        stage_entered_at TIMESTAMPTZ,
        lead_score INTEGER,
        lead_tier TEXT,
        assigned_to TEXT,
        last_outbound_at TIMESTAMPTZ,
        last_inbound_at TIMESTAMPTZ,
        last_call_at TIMESTAMPTZ,
        last_activity_at TIMESTAMPTZ,
        outreach_count INTEGER DEFAULT 0,
        drip_step INTEGER DEFAULT 0,
        drip_active BOOLEAN DEFAULT FALSE,
        tags TEXT[] DEFAULT '{}',
        custom_data JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_state_stage ON lead_state(current_stage, stage_entered_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_lead_state_tenant ON lead_state(tenant_id);`);

    // 3. Trigger Log Table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trigger_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id TEXT NOT NULL DEFAULT 'nah',
        contact_id TEXT NOT NULL,
        trigger_id TEXT NOT NULL,
        fired_at TIMESTAMPTZ DEFAULT NOW(),
        metadata JSONB DEFAULT '{}'
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_trigger_dedup ON trigger_log(contact_id, trigger_id, fired_at);`);

    await client.query('COMMIT');
    console.log('Database schema initialized successfully.');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Failed to initialize database schema:', e);
    throw e;
  } finally {
    client.release();
  }
};
