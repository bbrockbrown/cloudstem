/**
 * pm2 ecosystem file for CloudStem Audio Processing Pipeline
 *
 * Start:        pm2 start ecosystem.config.cjs
 * Stop:         pm2 stop all
 * Logs:         pm2 logs
 * Auto-restart: pm2 startup && pm2 save
 */

module.exports = {
  apps: [
    {
      name: "cloudstem-server",
      cwd: "./backend",
      script: "npx",
      args: "tsx server.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
        PORT: 8000,
      },
      watch: false,
      restart_delay: 3000,
      max_restarts: 10,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
    {
      name: "cloudstem-worker",
      cwd: "./backend",
      script: "npx",
      args: "tsx src/services/audioProcessor.ts",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      watch: false,
      restart_delay: 5000,
      max_restarts: 10,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
