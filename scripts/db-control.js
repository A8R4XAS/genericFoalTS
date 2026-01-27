#!/usr/bin/env node

const { execSync } = require('child_process');
const os = require('os');
const [,, command] = process.argv;

const isWindows = os.platform() === 'win32';

const CONFIG = isWindows ? {
  pgBin: 'C:\\Program Files\\PostgreSQL\\18\\bin',
  dataDir: 'C:\\local\\postgresDB'
} : {
  // Linux verwendet systemd
  service: 'postgresql'
};

const commands = {
  start: () => {
    console.log('🚀 Starting PostgreSQL...');
    try {
      if (isWindows) {
        const pgCtlPath = require('path').join(CONFIG.pgBin, 'pg_ctl.exe');
        execSync(`"${pgCtlPath}" start -D "${CONFIG.dataDir}" -l "${CONFIG.dataDir}\\logfile.log"`, { stdio: 'inherit' });
      } else {
        execSync(`sudo systemctl start ${CONFIG.service}`, { stdio: 'inherit' });
      }
      console.log('✅ PostgreSQL started successfully');
    } catch (error) {
      console.error('❌ Failed to start PostgreSQL');
      process.exit(1);
    }
  },
  
  stop: () => {
    console.log('🛑 Stopping PostgreSQL...');
    try {
      if (isWindows) {
        const pgCtlPath = require('path').join(CONFIG.pgBin, 'pg_ctl.exe');
        execSync(`"${pgCtlPath}" stop -D "${CONFIG.dataDir}" -m fast`, { stdio: 'inherit' });
      } else {
        execSync(`sudo systemctl stop ${CONFIG.service}`, { stdio: 'inherit' });
      }
      console.log('✅ PostgreSQL stopped successfully');
    } catch (error) {
      console.error('❌ Failed to stop PostgreSQL');
      process.exit(1);
    }
  },
  
  restart: () => {
    console.log('🔄 Restarting PostgreSQL...');
    try {
      if (isWindows) {
        const pgCtlPath = require('path').join(CONFIG.pgBin, 'pg_ctl.exe');
        execSync(`"${pgCtlPath}" restart -D "${CONFIG.dataDir}" -m fast`, { stdio: 'inherit' });
      } else {
        execSync(`sudo systemctl restart ${CONFIG.service}`, { stdio: 'inherit' });
      }
      console.log('✅ PostgreSQL restarted successfully');
    } catch (error) {
      console.error('❌ Failed to restart PostgreSQL');
      process.exit(1);
    }
  },
  
  status: () => {
    try {
      if (isWindows) {
        const pgCtlPath = require('path').join(CONFIG.pgBin, 'pg_ctl.exe');
        execSync(`"${pgCtlPath}" status -D "${CONFIG.dataDir}"`, { stdio: 'inherit' });
      } else {
        execSync(`systemctl status ${CONFIG.service}`, { stdio: 'inherit' });
      }
    } catch (error) {
      console.log('ℹ️  PostgreSQL is not running or status could not be determined');
    }
  },
  
  logs: () => {
    try {
      if (isWindows) {
        const logPath = require('path').join(CONFIG.dataDir, 'log');
        console.log(`📋 Opening log directory: ${logPath}`);
        execSync(`explorer "${logPath}"`, { stdio: 'inherit' });
      } else {
        execSync(`sudo journalctl -u ${CONFIG.service} -f`, { stdio: 'inherit' });
      }
    } catch (error) {
      console.log('ℹ️  Could not show logs');
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
  console.log('  logs    - Show PostgreSQL logs');
  process.exit(1);
}