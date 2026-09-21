import express from 'express';
import cors from 'cors';
import { readFile } from 'fs/promises';
import { join } from 'path';

const app = express();
app.use(cors());
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'video-agent-minimal' });
});

// 项目列表（读取真实数据）
app.get('/api/creative/projects', async (req, res) => {
  try {
    const stateFile = join(process.cwd(), 'runtime/openclaw/stage/openclaw-workspace-state.json');
    const state = JSON.parse(await readFile(stateFile, 'utf-8'));
    res.json(state.projects || []);
  } catch (err) {
    res.json([]);
  }
});

// 任务状态
app.get('/api/creative/job-status/:jobId', async (req, res) => {
  try {
    const stateFile = join(process.cwd(), 'runtime/openclaw/stage/openclaw-workspace-state.json');
    const state = JSON.parse(await readFile(stateFile, 'utf-8'));
    const job = state.jobs?.find(j => j.id === req.params.jobId);
    if (job) {
      res.json(job);
    } else {
      res.status(404).json({ error: 'Job not found' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 创建任务（模拟）
app.post('/api/creative/tasks', async (req, res) => {
  const jobId = `job-${Date.now().toString(36)}`;
  res.json({
    jobId,
    projectId: req.body.projectId || `project-${Date.now().toString(36)}`,
    status: 'queued',
    phase: '理解需求',
    message: '任务已提交（临时服务）'
  });
});

const PORT = 3020;
app.listen(PORT, () => {
  console.log(`✓ video-agent-minimal启动成功 http://127.0.0.1:${PORT}`);
});
