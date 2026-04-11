require('dotenv').config();

const app = require('./app');
const { connectDB } = require('./config/db');
const { startAuthRetentionScheduler } = require('./services/authRetentionService');
const { startTrustOptimizationScheduler } = require('./services/trustOptimizationService');

const port = Number(process.env.PORT) || 5000;

let server = null;
let stopAuthCleanup = null;
let stopTrustOptimization = null;

const startServer = async () => {
  try {
    await connectDB();

    server = app.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });

    stopAuthCleanup = startAuthRetentionScheduler({ logger: console });
    stopTrustOptimization = startTrustOptimizationScheduler({ logger: console });
  } catch (error) {
    console.error(`[BOOT] Failed to start server: ${error?.message || error}`);
    process.exit(1);
  }
};

const shutdown = async (signal) => {
  try {
    console.log(`[BOOT] Received ${signal}. Shutting down server...`);
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      });
    }

    if (typeof stopAuthCleanup === 'function') {
      stopAuthCleanup();
      stopAuthCleanup = null;
    }

    if (typeof stopTrustOptimization === 'function') {
      stopTrustOptimization();
      stopTrustOptimization = null;
    }

    process.exit(0);
  } catch (error) {
    console.error(`[BOOT] Graceful shutdown failed: ${error?.message || error}`);
    process.exit(1);
  }
};

process.on('SIGINT', () => {
  shutdown('SIGINT');
});

process.on('SIGTERM', () => {
  shutdown('SIGTERM');
});

startServer();

module.exports = {
  startServer,
};