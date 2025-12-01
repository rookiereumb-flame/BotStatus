const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Process management for 24/7 uptime
let serverProcess = null;
let botProcess = null;
let isRestarting = false;

// Kill any existing processes on port 5000
function killPort5000() {
  return new Promise((resolve) => {
    const kill = spawn('bash', ['-c', 'fuser -k 5000/tcp 2>/dev/null || true']);
    kill.on('close', () => {
      setTimeout(resolve, 1000);
    });
  });
}

// Start server
function startServer() {
  if (isRestarting) return;
  
  console.log('🚀 Starting Express server...');
  serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    detached: true
  });
  
  serverProcess.on('error', (err) => {
    console.error('❌ Server error:', err.message);
    if (!isRestarting) {
      console.log('🔄 Restarting server in 5 seconds...');
      setTimeout(startServer, 5000);
    }
  });
  
  serverProcess.on('exit', (code) => {
    console.warn(`⚠️ Server exited with code ${code}`);
    if (!isRestarting) {
      console.log('🔄 Restarting server in 5 seconds...');
      setTimeout(startServer, 5000);
    }
  });
}

// Start bot
function startBot() {
  if (isRestarting) return;
  
  console.log('🤖 Starting Discord bot...');
  botProcess = spawn('node', ['index.js'], {
    stdio: 'inherit',
    detached: true
  });
  
  botProcess.on('error', (err) => {
    console.error('❌ Bot error:', err.message);
    if (!isRestarting) {
      console.log('🔄 Restarting bot in 5 seconds...');
      setTimeout(startBot, 5000);
    }
  });
  
  botProcess.on('exit', (code) => {
    console.warn(`⚠️ Bot exited with code ${code}`);
    if (!isRestarting) {
      console.log('🔄 Restarting bot in 5 seconds...');
      setTimeout(startBot, 5000);
    }
  });
}

// Graceful shutdown
async function gracefulShutdown() {
  console.log('🛑 Shutting down gracefully...');
  isRestarting = true;
  
  if (serverProcess) {
    try {
      process.kill(-serverProcess.pid);
    } catch (e) {}
  }
  
  if (botProcess) {
    try {
      process.kill(-botProcess.pid);
    } catch (e) {}
  }
  
  setTimeout(() => {
    console.log('✅ Shutdown complete');
    process.exit(0);
  }, 3000);
}

// Handle signals
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught exception:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled rejection:', reason);
});

// Initialize
async function init() {
  console.log('⚙️ Initializing process manager...');
  await killPort5000();
  console.log('✅ Port 5000 cleaned');
  
  startServer();
  startBot();
  
  console.log('✅ All processes started. Monitoring for crashes...');
}

init().catch(err => {
  console.error('❌ Initialization error:', err);
  process.exit(1);
});
