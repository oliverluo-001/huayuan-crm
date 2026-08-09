const path = require('node:path');

const releaseRoot = __dirname;

module.exports = {
  apps: [
    {
      name: 'huayuan-crm-backend',
      cwd: path.join(releaseRoot, 'backend'),
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 9528,
      },
      // 日志配置
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: path.join(releaseRoot, 'backend', 'logs', 'error.log'),
      out_file: path.join(releaseRoot, 'backend', 'logs', 'out.log'),
      merge_logs: true,
      // 进程守护
      max_restarts: 10,
      restart_delay: 3000,
      min_uptime: 5000,
      // 内存限制，超出自动重启
      max_memory_restart: '500M',
      // 优雅关闭
      kill_timeout: 5000,
      listen_timeout: 3000,
      // 环境变量白名单
      env_file: path.join(releaseRoot, 'backend', '.env'),
    },
  ],
};
