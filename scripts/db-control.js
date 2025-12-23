#!/usr/bin/env node

const { execSync } = require('child_process');
const path = require('path');
const [,, command] = process.argv;

const CONFIG = {
  pgBin: 'C:\\Program Files\\PostgreSQL\\18\\bin',
  dataDir: 'C:\\local\\postgresDB'
};

const pgCtlPath = path.join(CONFIG.pgBin, 'pg_ctl.exe');

const commands = {
  start: () => {
    console.log('🚀 Starting PostgreSQL...');
    try {
      execSync(`"${pgCtlPath}" start -D "${CONFIG.dataDir}" -l "${CONFIG.dataDir}\\logfile.log"`, { stdio: 'inherit' });
      console.log('✅ PostgreSQL started successfully');
    } catch (error) {
      console.error('❌ Failed to start PostgreSQL');
      process.exit(1);
    }
  },
  
  stop: () => {
    console.log('🛑 Stopping PostgreSQL...');
    try {
      execSync(`"${pgCtlPath}" stop -D "${CONFIG.dataDir}" -m fast`, { stdio: 'inherit' });
      console.log('✅ PostgreSQL stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop PostgreSQL');
      process.exit(1);
    }
  },
  
  restart: () => {
    console.log('🔄 Restarting PostgreSQL...');
    try {
      execSync(`"${pgCtlPath}" restart -D "${CONFIG.dataDir}" -m fast`, { stdio: 'inherit' });
      console.log('✅ PostgreSQL restarted successfully');
    } catch (error) {
      console.error('❌ Failed to restart PostgreSQL');
      process.exit(1);
    }
  },
  
  status: () => {
    try {
      execSync(`"${pgCtlPath}" status -D "${CONFIG.dataDir}"`, { stdio: 'inherit' });
    } catch (error) {
      console.log('ℹ️  PostgreSQL is not running or status could not be determined');
    }
  },
  
  logs: () => {
    const logPath = path.join(CONFIG.dataDir, 'log');
    console.log(`📋 Opening log directory: ${logPath}`);
    try {
      execSync(`explorer "${logPath}"`, { stdio: 'inherit' });
    } catch (error) {
      console.log(`ℹ️  Please check logs manually at: ${logPath}`);
    }
  }
};

if (commands[command]) {
  commands[command]();
} else {
  console.error('❌ Unknown command:', command);
  console.log('\nAvailable commands:');
  console.log('  start   - Start PostgreSQL');
  console.log('  stop    - Stop PostgreSQL');
  console.log('  restart - Restart PostgreSQL');
  console.log('  status  - Show PostgreSQL status');
  console.log('  logs    - Open log directory');
  process.exit(1);
}