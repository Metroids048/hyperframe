/**
 * 项目级文件锁，防止并发编辑竞态条件
 *
 * 问题：在 service.mjs 中，版本检查和更新之间存在竞态窗口：
 * 1. 线程 A 检查 currentRevisionId === base ✅
 * 2. 线程 B 检查 currentRevisionId === base ✅
 * 3. 线程 A 修改 currentRevisionId = newA
 * 4. 线程 B 修改 currentRevisionId = newB （覆盖了 A 的修改！）
 *
 * 解决方案：使用文件系统级别的独占锁
 */

import fs from 'node:fs/promises';
import {open} from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {CreativeError} from './contracts.mjs';

const LOCK_TIMEOUT_MS = 30000; // 30秒超时
const STALE_LOCK_MS = 120000;  // 2分钟后认为锁过期

/**
 * 获取项目锁
 * @param {string} projectDir - 项目目录
 * @returns {Promise<Function>} 返回解锁函数
 */
export async function acquireProjectLock(projectDir) {
  const lockPath = path.join(projectDir, '.edit.lock');
  const startTime = Date.now();

  while (true) {
    try {
      // 尝试创建独占锁文件（wx 模式：文件存在则失败）
      const lockFile = await open(lockPath, 'wx');

      // 写入锁的元数据
      const lockData = {
        pid: process.pid,
        timestamp: Date.now(),
        hostname: os.hostname()
      };
      await lockFile.write(JSON.stringify(lockData));
      await lockFile.close();

      // 返回解锁函数
      return async () => {
        try {
          await fs.unlink(lockPath);
        } catch (error) {
          // 锁文件可能已被清理，忽略错误
          if (error.code !== 'ENOENT') {
            console.warn('[ProjectLock] 解锁失败:', error.message);
          }
        }
      };

    } catch (error) {
      if (error.code !== 'EEXIST') {
        throw error;
      }

      // 锁文件存在，检查是否过期
      try {
        const lockContent = await fs.readFile(lockPath, 'utf8');
        const lockData = JSON.parse(lockContent);
        const lockAge = Date.now() - lockData.timestamp;

        if (lockAge > STALE_LOCK_MS) {
          // 锁已过期，强制清理
          console.warn(`[ProjectLock] 检测到过期锁（${Math.round(lockAge/1000)}秒），强制清理`);
          await fs.unlink(lockPath).catch(() => {});
          continue; // 重试获取锁
        }
      } catch (parseError) {
        // 锁文件损坏，强制清理
        console.warn('[ProjectLock] 锁文件损坏，强制清理');
        await fs.unlink(lockPath).catch(() => {});
        continue;
      }

      // 检查是否超时
      if (Date.now() - startTime > LOCK_TIMEOUT_MS) {
        throw new CreativeError(
          '项目正在被其他请求处理，请稍后重试',
          'PROJECT_LOCKED',
          409
        );
      }

      // 等待后重试
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * 使用锁执行操作（自动获取和释放）
 * @param {string} projectDir - 项目目录
 * @param {Function} operation - 要执行的操作
 * @returns {Promise<any>} 操作结果
 */
export async function withProjectLock(projectDir, operation) {
  const unlock = await acquireProjectLock(projectDir);
  try {
    return await operation();
  } finally {
    await unlock();
  }
}
