import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL('./remote-deploy.sh', import.meta.url), 'utf8');
const nginx = await readFile(new URL('./nginx-huayuan-crm.conf', import.meta.url), 'utf8');
const ecosystem = await readFile(new URL('../ecosystem.config.js', import.meta.url), 'utf8');
const healthCheck = await readFile(new URL('./health-check.mjs', import.meta.url), 'utf8');

const position = (fragment) => {
  const index = script.indexOf(fragment);
  assert.notEqual(index, -1, `部署脚本缺少关键步骤：${fragment}`);
  return index;
};

test('backs up the stopped database before any migration starts', () => {
  const maintenance = position('sudo touch "$WEB_ROOT/deploying"');
  const stop = script.lastIndexOf('pm2 stop huayuan-crm-backend');
  assert.notEqual(stop, -1, '部署脚本缺少停止旧后端步骤');
  const dump = position('mysqldump \\');
  const verify = position('gzip -t "$BACKUP_FILE"');
  const migrationFlag = position('MIGRATION_STARTED=1');
  const migrate = position('node dist/scripts/migrate.js');
  assert.ok(maintenance < stop && stop < dump, '备份前必须进入维护模式并停止旧后端写入');
  assert.ok(dump < verify && verify < migrationFlag && migrationFlag < migrate, '迁移只能在可恢复备份验证通过后执行');
});

test('keeps the existing JWT-secret fallback for encrypted credentials', () => {
  position('CREDENTIAL_ENCRYPTION_KEY="${CREDENTIAL_ENCRYPTION_KEY:-$JWT_SECRET}"');
});

test('separates web releases from application artifact releases', () => {
  position('WEB_RELEASE_DIR="$WEB_ROOT/web-releases/$RELEASE_ID"');
  assert.equal(script.includes('WEB_RELEASE_DIR="$WEB_ROOT/releases/$RELEASE_ID"'), false);
});

test('restores data and previous releases from the error trap', () => {
  const trap = position('trap rollback ERR');
  const restore = position('gzip -dc "$BACKUP_FILE" | MYSQL_PWD="$DB_PASSWORD" mysql');
  const backendRollback = position('start_backend "$PREVIOUS_BACKEND"');
  const appRollback = position('switch_symlink "$PREVIOUS_BACKEND" "$CURRENT_LINK"');
  const webRollback = position('sudo mv -T "$WEB_ROLLBACK_DIR" "$WEB_ROOT/html"');
  assert.ok(trap < position('MIGRATION_STARTED=1'), '错误处理必须在迁移前启用');
  assert.ok(restore < backendRollback, '恢复旧后端前必须先恢复数据库');
  assert.ok(appRollback < backendRollback && webRollback < backendRollback, '恢复服务前必须将前后端指针切回上一版');
});

test('only activates the new frontend and backend after the new backend passes health check', () => {
  const migrate = position('node dist/scripts/migrate.js');
  const health = position('http://127.0.0.1:$PORT/api/health/$RELEASE_ID');
  const appSwitch = script.lastIndexOf('switch_symlink "$RELEASE_DIR" "$CURRENT_LINK"');
  const webSwitch = script.lastIndexOf('sudo mv -T "$WEB_RELEASE_DIR" "$WEB_ROOT/html"');
  assert.ok(migrate < health && health < appSwitch && health < webSwitch);
  assert.ok(position('pm2 save') < script.lastIndexOf('sudo rm -f "$WEB_ROOT/deploying"'), '发布完成前不得解除维护模式');
  assert.equal(script.includes('rm -rf /var/www/huayuan-crm'), false, '不得删除正在使用的前端目录');
});

test('uses independent backend and frontend live paths', () => {
  position('CURRENT_LINK="$APP_ROOT/app-current"');
  assert.match(nginx, /root \/var\/www\/huayuan-crm\/html;/);
  assert.equal(script.includes('CURRENT_LINK="$APP_ROOT/current"'), false);
});

test('keeps customer attachments outside replaceable release directories', () => {
  position('CUSTOMER_ATTACHMENT_DIR="${CUSTOMER_ATTACHMENT_DIR:-$APP_ROOT/data/customer-attachments}"');
  position('write_env_value CUSTOMER_ATTACHMENT_DIR "$CUSTOMER_ATTACHMENT_DIR"');
  position('mkdir -p "$CUSTOMER_ATTACHMENT_DIR"');
  assert.equal(script.includes('CUSTOMER_ATTACHMENT_DIR="$RELEASE_DIR'), false);
});

test('recreates PM2 from an absolute release path and verifies the exact backend release', () => {
  position('write_env_value RELEASE_ID "$RELEASE_ID"');
  position('pm2 delete huayuan-crm-backend');
  position('pm2 start "$directory/ecosystem.config.js"');
  assert.match(ecosystem, /cwd: path\.join\(releaseRoot, 'backend'\)/);
  assert.equal(ecosystem.includes("cwd: './backend'"), false);
  assert.match(healthCheck, /EXPECTED_RELEASE_ID/);
  assert.match(healthCheck, /healthData\.releaseId !== expectedReleaseId/);
});
