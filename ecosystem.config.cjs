// PM2 process definition for the RektaBuild Supplier module.
// Usage: pm2 start ecosystem.config.cjs --env production
module.exports = {
  apps: [
    {
      name: "rekta-supplier",
      script: "./index.js",
      cwd: "/var/www/rekta-supplier",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "400M",
      time: true,
      kill_timeout: 5000,
      exp_backoff_restart_delay: 200,
      env: {
        NODE_ENV: "development",
        PORT: 3000,
        HOST: "0.0.0.0",
      },
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
        HOST: "127.0.0.1",
        // Values below must be provided on the server (PM2 --update-env or a
        // sourced env file). Never commit real secrets here.
        SESSION_SECRET: process.env.SESSION_SECRET,
        CORS_ORIGIN: process.env.CORS_ORIGIN,
        DB_NAME: process.env.DB_NAME,
        DB_USER: process.env.DB_USER,
        DB_PASS: process.env.DB_PASS,
        DB_HOST: process.env.DB_HOST,
        DB_PORT: process.env.DB_PORT,
        DB_LOGGING: "false",
      },
      out_file: "/var/log/rekta-supplier/out.log",
      error_file: "/var/log/rekta-supplier/error.log",
      merge_logs: true,
    },
  ],
};
