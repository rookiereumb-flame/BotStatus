const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

// Process management for 24/7 uptime
let serverProcess = null;
let botProcess = null;
let isRestarting = false;

// Kill any existing processes on port 5000 (multiple attempts)
function killPort5000() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 3;
    
    function attempt() {
      attempts++;
      const kill = spawn('bash', ['-c', 'fuser -k 5000/tcp 2>/dev/null; pkill -f "server.js" || true']);
      kill.on('close', () => {
        if (attempts < maxAttempts) {
          setTimeout(attempt, 500);
        } else {
          setTimeout(resolve, 1500);
        }
      });
    }
    
    attempt();
  });
}

// Start server (with retry on port conflict)
function startServer(attempt = 1) {
  if (isRestarting) return;
  
  console.log(`🚀 Starting Express server (attempt ${attempt})...`);
  serverProcess = spawn('node', ['server.js'], {
    stdio: 'inherit',
    detached: true
  });
  
  serverProcess.on('error', (err) => {
    console.error('❌ Server error:', err.message);
    if (!isRestarting) {
      if (attempt < 3) {
        console.log(`🔄 Retrying server startup (attempt ${attempt + 1}) in 3 seconds...`);
        setTimeout(() => startServer(attempt + 1), 3000);
      } else {
        console.log('🔄 Max retries reached. Restarting in 10 seconds...');
        setTimeout(() => startServer(1), 10000);
      }
    }
  });
  
  serverProcess.on('exit', (code) => {
    console.warn(`⚠️ Server exited with code ${code}`);
    if (!isRestarting) {
      console.log('🔄 Restarting server in 5 seconds...');
      setTimeout(() => startServer(1), 5000);
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
