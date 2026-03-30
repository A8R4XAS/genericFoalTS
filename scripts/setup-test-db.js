#!/usr/bin/env node

require('dotenv').config();
const { Client } = require('pg');

const TEST_DBS = ['genericfoalts_test', 'genericfoalts_e2e'];

const client = new Client({
  host: process.env.DATABASE_HOST,
  port: process.env.DATABASE_PORT,
  user: process.env.DATABASE_USERNAME,
  password: process.env.DATABASE_PASSWORD,
  database: 'postgres' // Connect to postgres DB to create/drop test DBs
});

async function setupTestDatabases() {
  try {
    await client.connect();
    console.log('✅ Connected to PostgreSQL');

    for (const dbName of TEST_DBS) {
      try {
        // Drop existing DB
        await client.query(`DROP DATABASE IF EXISTS ${dbName}`);
        console.log(`🗑️  Dropped existing database: ${dbName}`);

        // Create new DB
        await client.query(`CREATE DATABASE ${dbName}`);
        console.log(`✅ Created database: ${dbName}`);
      } catch (err) {
        console.error(`❌ Error setting up ${dbName}:`, err.message);
      }
    }

    console.log('\n✅ Test databases ready!');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    console.error('\n⚠️  Make sure PostgreSQL is running:');
    console.error('   npm run db:start');
    process.exit(1);
  } finally {
    await client.end();
  }
}

setupTestDatabases();
