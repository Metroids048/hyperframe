import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const resourceHash = value => crypto.createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');

/**
 * V4 提示词加载器
 * 支持按需加载和全量加载
 */
export class PromptLoaderV4 {
  constructor(root) {
    this.root = root;
    this.v4Dir = path.join(root, 'prompts/commerce/v4');
    this.cache = new Map();
  }

  /**
   * 加载核心系统规则（所有阶段必读）
   */
  async loadCore() {
    return this._load('00-system-core.md');
  }

  /**
   * 加载故障排查（所有阶段必读）
   */
  async loadTroubleshooting() {
    return this._load('99-troubleshooting.md');
  }

  /**
   * 根据阶段加载对应提示词
   */
  async loadStage(stage) {
    const stageMap = {
      'R0': ['00-system-core.md', '99-troubleshooting.md'],
      'R1': ['00-system-core.md', '01-input-understanding.md', '99-troubleshooting.md'],
      'R2': ['00-system-core.md', '02-asset-analysis.md', '99-troubleshooting.md'],
      'R3': ['00-system-core.md', '03-hyperframes-resources.md', '99-troubleshooting.md'],
      'R4': ['00-system-core.md', '04-director-storyboard.md', '99-troubleshooting.md'],
      'R5': ['00-system-core.md', '05-quality-review.md', '99-troubleshooting.md'],
      'R8': ['00-system-core.md', '05-quality-review.md', '99-troubleshooting.md'],

      // V3 新阶段
      'PU': ['00-system-core.md', '01-input-understanding.md', '02-asset-analysis.md', '99-troubleshooting.md'],
      'MP': ['00-system-core.md', '01-input-understanding.md', '99-troubleshooting.md'],
      'CD': ['00-system-core.md', '04-director-storyboard.md', '99-troubleshooting.md'],
      'VD': ['00-system-core.md', '04-director-storyboard.md', '99-troubleshooting.md'],
      'HF': ['00-system-core.md', '03-hyperframes-resources.md', '99-troubleshooting.md'],
    };

    const files = stageMap[stage] || ['00-system-core.md', '99-troubleshooting.md'];
    const contents = await Promise.all(files.map(f => this._load(f)));

    return {
      text: contents.join('\n\n---\n\n'),
      files,
      hash: resourceHash(contents.join('\n'))
    };
  }

  /**
   * 全量加载（用于开发测试）
   */
  async loadAll() {
    const files = [
      '00-system-core.md',
      '01-input-understanding.md',
      '02-asset-analysis.md',
      '03-hyperframes-resources.md',
      '04-director-storyboard.md',
      '05-quality-review.md',
      '99-troubleshooting.md'
    ];

    const contents = await Promise.all(files.map(f => this._load(f)));

    return {
      text: contents.join('\n\n---\n\n'),
      files,
      hash: resourceHash(contents.join('\n'))
    };
  }

  async _load(filename) {
    if (this.cache.has(filename)) {
      return this.cache.get(filename);
    }

    try {
      const content = await fs.readFile(path.join(this.v4Dir, filename), 'utf8');
      this.cache.set(filename, content);
      return content;
    } catch (error) {
      if (error.code === 'ENOENT') {
        // V4 提示词不存在时，回退到空字符串
        console.warn(`V4 提示词 ${filename} 不存在，回退到旧版`);
        return '';
      }
      throw error;
    }
  }

  /**
   * 清除缓存
   */
  clearCache() {
    this.cache.clear();
  }
}

/**
 * 检查 V4 提示词是否可用
 */
export async function isV4Available(root) {
  try {
    const v4Dir = path.join(root, 'prompts/commerce/v4');
    const coreFile = path.join(v4Dir, '00-system-core.md');
    await fs.access(coreFile);
    return true;
  } catch {
    return false;
  }
}
