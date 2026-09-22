/**
 * 资源清理工具，确保临时文件和过期锁被正确清理
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * 清理项目目录中的过期锁文件
 * @param {string} projectDir - 项目目录
 * @param {number} maxAge - 最大存活时间（毫秒），默认 2 分钟
 * @returns {Promise<number>} 清理的文件数量
 */
export async function cleanupStaleLocks(projectDir, maxAge = 120000) {
  let cleaned = 0;
  try {
    const lockPath = path.join(projectDir, '.edit.lock');
    const stat = await fs.stat(lockPath);
    const age = Date.now() - stat.mtimeMs;

    if (age > maxAge) {
      await fs.unlink(lockPath);
      cleaned++;
      console.log(`[ResourceCleanup] 清理过期锁: ${lockPath} (${Math.round(age/1000)}秒)`);
    }
  } catch (error) {
    // 文件不存在或已被清理，忽略
    if (error.code !== 'ENOENT') {
      console.warn('[ResourceCleanup] 清理锁文件失败:', error.message);
    }
  }
  return cleaned;
}

/**
 * 清理项目目录中的临时文件
 * @param {string} projectDir - 项目目录
 * @param {number} maxAge - 最大存活时间（毫秒），默认 1 小时
 * @returns {Promise<number>} 清理的文件数量
 */
export async function cleanupTempFiles(projectDir, maxAge = 3600000) {
  let cleaned = 0;

  try {
    const entries = await fs.readdir(projectDir, { withFileTypes: true, recursive: true });

    for (const entry of entries) {
      if (!entry.isFile()) continue;

      const fullPath = path.join(entry.path || projectDir, entry.name);

      // 清理 .tmp 文件
      if (entry.name.endsWith('.tmp')) {
        try {
          const stat = await fs.stat(fullPath);
          const age = Date.now() - stat.mtimeMs;

          if (age > maxAge) {
            await fs.unlink(fullPath);
            cleaned++;
            console.log(`[ResourceCleanup] 清理临时文件: ${fullPath} (${Math.round(age/1000)}秒)`);
          }
        } catch (error) {
          if (error.code !== 'ENOENT') {
            console.warn(`[ResourceCleanup] 清理临时文件失败: ${fullPath}`, error.message);
          }
        }
      }
    }
  } catch (error) {
    console.warn('[ResourceCleanup] 扫描临时文件失败:', error.message);
  }

  return cleaned;
}

/**
 * 清理项目的所有临时资源（锁 + 临时文件）
 * @param {string} projectDir - 项目目录
 * @returns {Promise<{locks: number, temps: number}>} 清理统计
 */
export async function cleanupProjectResources(projectDir) {
  const [locks, temps] = await Promise.all([
    cleanupStaleLocks(projectDir),
    cleanupTempFiles(projectDir)
  ]);

  return { locks, temps };
}

/**
 * 清理数据目录中所有项目的临时资源（定期任务）
 * @param {string} dataDir - 数据根目录
 * @returns {Promise<{projects: number, locks: number, temps: number}>} 清理统计
 */
export async function cleanupAllProjects(dataDir) {
  let projectCount = 0, totalLocks = 0, totalTemps = 0;

  try {
    const entries = await fs.readdir(dataDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (!/^[a-zA-Z0-9_-]{1,100}$/.test(entry.name)) continue;

      const projectDir = path.join(dataDir, entry.name);
      const { locks, temps } = await cleanupProjectResources(projectDir);

      if (locks > 0 || temps > 0) {
        projectCount++;
        totalLocks += locks;
        totalTemps += temps;
      }
    }
  } catch (error) {
    console.warn('[ResourceCleanup] 扫描项目目录失败:', error.message);
  }

  return { projects: projectCount, locks: totalLocks, temps: totalTemps };
}

/**
 * 启动定期清理任务
 * @param {string} dataDir - 数据根目录
 * @param {number} intervalMs - 清理间隔（毫秒），默认 5 分钟
 * @returns {Function} 停止清理任务的函数
 */
export function startPeriodicCleanup(dataDir, intervalMs = 300000) {
  console.log(`[ResourceCleanup] 启动定期清理任务，间隔 ${intervalMs/1000} 秒`);

  const timer = setInterval(async () => {
    try {
      const stats = await cleanupAllProjects(dataDir);
      if (stats.locks > 0 || stats.temps > 0) {
        console.log(`[ResourceCleanup] 清理完成: ${stats.projects} 个项目，${stats.locks} 个锁，${stats.temps} 个临时文件`);
      }
    } catch (error) {
      console.error('[ResourceCleanup] 定期清理失败:', error);
    }
  }, intervalMs);
  timer.unref?.();

  // 返回停止函数
  return () => {
    clearInterval(timer);
    console.log('[ResourceCleanup] 已停止定期清理任务');
  };
}
