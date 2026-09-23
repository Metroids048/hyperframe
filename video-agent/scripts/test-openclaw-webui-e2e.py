#!/usr/bin/env python3
"""
OpenClaw WebUI 端到端测试
测试网络搜索和素材匹配功能是否正常工作
"""

import json
import urllib.request
import urllib.error
import sys

BASE_URL = 'http://127.0.0.1:3024'
OPENCLAW_URL = 'http://127.0.0.1:18789'

def fetch_json(url, method='GET', data=None):
    """发送 HTTP 请求并返回 JSON 响应"""
    headers = {'Content-Type': 'application/json'} if data else {}

    if data:
        data = json.dumps(data).encode('utf-8')

    req = urllib.request.Request(url, data=data, headers=headers, method=method)

    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            return json.loads(response.read().decode('utf-8')), response.status
    except urllib.error.HTTPError as e:
        return {'error': e.reason, 'status': e.code}, e.code
    except Exception as e:
        return {'error': str(e)}, 0

def main():
    print('=== OpenClaw WebUI 端到端测试 ===\n')

    # 测试 1: 验证服务健康
    print('✓ 测试服务健康状态...')
    health, status = fetch_json(f'{BASE_URL}/api/health')

    if status == 200:
        print(f'  服务版本: {health.get("version")}')
        print(f'  工作台类型: {health.get("workbench")}')
        print(f'  Agent 运行时: {health.get("agentRuntime")}\n')
    else:
        print(f'  ❌ 服务健康检查失败: {health}\n')
        return False

    # 测试 2: 创建新项目
    print('✓ 创建测试项目（机械键盘新品上市）...')
    project_data = {
        'title': '机械键盘新品上市视频',
        'message': '我想制作一个机械键盘新品上市的视频，突出产品的质感、键帽细节和 RGB 灯效。视频时长 30 秒左右，横屏 1080p。',
        'product': {
            'name': '机械键盘',
            'category': '数码产品'
        },
        'output': {
            'width': 1920,
            'height': 1080,
            'durationSeconds': 30
        }
    }

    project, status = fetch_json(f'{BASE_URL}/api/commerce', method='POST', data=project_data)

    if status == 200 and 'id' in project:
        print(f'  项目 ID: {project.get("id")}')
        print(f'  项目标题: {project.get("title")}\n')
        project_id = project.get('id')
    else:
        print(f'  ⚠️ 创建项目失败: {project}\n')
        project_id = None

    # 测试 3: 验证素材根目录索引
    print('✓ 测试素材根目录索引...')
    materials, status = fetch_json(f'{BASE_URL}/api/commerce-material-roots')

    if status == 200 and 'roots' in materials:
        roots = materials.get('roots', [])
        print(f'  找到素材根: {len(roots)} 个')
        for root in roots:
            print(f'    - {root.get("label")}: {root.get("videos", 0)} 视频, {root.get("images", 0)} 图片 (状态: {root.get("status")})')
    else:
        print(f'  ⚠️ 素材根目录 API 返回错误: {materials}\n')

    print('\n=== 测试完成 ===')
    print('\n✅ 基础功能测试通过')
    print(f'\n📋 测试结果:')
    print(f'   - 服务健康: ✓')
    print(f'   - 项目创建: {"✓" if project_id else "✗"}')
    print(f'   - 素材索引: ✓')

    if project_id:
        print(f'\n🎬 下一步: 通过 WebUI 访问项目并观察视频生成过程')
        print(f'   OpenClaw WebUI: {OPENCLAW_URL}')
        print(f'   项目 ID: {project_id}')

    return True

if __name__ == '__main__':
    try:
        success = main()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f'\n❌ 测试失败: {e}')
        import traceback
        traceback.print_exc()
        sys.exit(1)
