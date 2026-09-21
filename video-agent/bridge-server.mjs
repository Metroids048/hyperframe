#!/usr/bin/env node
import http from 'node:http';
import {randomUUID} from 'node:crypto';

const PORT = Number(process.env.VIDEO_AGENT_PORT || 3020);

// 模拟项目数据库
const projects = new Map();
const jobs = new Map();

// 添加测试项目
const testProjectId = 'test-project-' + randomUUID().slice(0,8);
projects.set(testProjectId, {
  id: testProjectId,
  name: '测试商品视频',
  created: new Date().toISOString(),
  status: 'completed'
});

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);

  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  try {
    // Health check
    if (url.pathname === '/health') {
      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        ok: true,
        status: 'ok',
        service: 'video-agent-bridge',
        workspaceId: process.env.VIDEO_AGENT_WORKSPACE_ID || 'default',
        agentRuntime: 'openclaw',
        workbench: 'commerce'
      }));
      return;
    }

    // 视频任务提交
    if (url.pathname === '/video' && req.method === 'POST') {
      const jobId = 'job-' + randomUUID();
      const projectId = 'project-' + randomUUID().slice(0,8);

      jobs.set(jobId, {
        id: jobId,
        projectId,
        status: 'completed',
        phase: '完成',
        created: new Date().toISOString()
      });

      projects.set(projectId, {
        id: projectId,
        name: '商品视频',
        created: new Date().toISOString(),
        status: 'completed',
        outputVideo: `https://example.com/video-${projectId}.mp4`
      });

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        jobId,
        projectId,
        status: 'queued'
      }));
      return;
    }

    // 任务状态查询
    if (url.pathname.startsWith('/video/') && req.method === 'GET') {
      const jobId = url.pathname.split('/')[2];
      const job = jobs.get(jobId);

      if (!job) {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Job not found'}));
        return;
      }

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({
        id: job.id,
        projectId: job.projectId,
        status: job.status,
        phase: job.phase,
        progress: 100
      }));
      return;
    }

    // 项目列表
    if (url.pathname === '/projects' && req.method === 'GET') {
      const projectList = Array.from(projects.values()).map(p => ({
        id: p.id,
        name: p.name,
        created: p.created,
        status: p.status
      }));

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify({projects: projectList}));
      return;
    }

    // 项目详情
    if (url.pathname.startsWith('/projects/') && req.method === 'GET') {
      const projectId = url.pathname.split('/')[2];
      const project = projects.get(projectId);

      if (!project) {
        res.writeHead(404, {'Content-Type': 'application/json'});
        res.end(JSON.stringify({error: 'Project not found'}));
        return;
      }

      res.writeHead(200, {'Content-Type': 'application/json'});
      res.end(JSON.stringify(project));
      return;
    }

    // 404
    res.writeHead(404, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: 'Not found'}));

  } catch (error) {
    console.error('Error:', error);
    res.writeHead(500, {'Content-Type': 'application/json'});
    res.end(JSON.stringify({error: error.message}));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`✓ Video Agent Bridge running on http://127.0.0.1:${PORT}`);
  console.log(`✓ Test project ID: ${testProjectId}`);
});
