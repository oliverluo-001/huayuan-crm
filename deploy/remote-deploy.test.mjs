import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const script = await readFile(new URL('./remote-deploy.sh', import.meta.url), 'utf8');

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

test('restores data and previous releases from the error trap', () => {
  const trap = position('trap rollback ERR');
  const restore = position('gzip -dc "$BACKUP_FILE" | MYSQL_PWD="$DB_PASSWORD" mysql');
  const backendRollback = position('start_backend "$PREVIOUS_BACKEND"');
  const appRollback = position('switch_symlink "$PREVIOUS_BACKEND" "$CURRENT_LINK"');
  const webRollback = position('switch_symlink "$PREVIOUS_WEB" "$WEB_CURRENT_LINK"');
  assert.ok(trap < position('MIGRATION_STARTED=1'), '错误处理必须在迁移前启用');
  assert.ok(restore < backendRollback, '恢复旧后端前必须先恢复数据库');
  assert.ok(appRollback < backendRollback && webRollback < backendRollback, '恢复服务前必须将前后端指针切回上一版');
});

test('only switches live symlinks after the new backend passes health check', () => {
  const migrate = position('node dist/scripts/migrate.js');
  const health = position('http://127.0.0.1:$PORT/api/auth/status');
  const appSwitch = script.lastIndexOf('switch_symlink "$RELEASE_DIR" "$CURRENT_LINK"');
  const webSwitch = script.lastIndexOf('switch_symlink "$WEB_RELEASE_DIR" "$WEB_CURRENT_LINK"');
  assert.ok(migrate < health && health < appSwitch && health < webSwitch);
  assert.ok(position('pm2 save') < script.lastIndexOf('sudo rm -f "$WEB_ROOT/deploying"'), '发布完成前不得解除维护模式');
  assert.equal(script.includes('rm -rf /var/www/huayuan-crm'), false, '不得删除正在使用的前端目录');
});
