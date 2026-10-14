"""Small durable adapter around the pinned RunningHub OpenClaw clients.

Transport never puts credentials in argv, logs, task files, or tool results.
The upstream endpoint catalog defines parameters; OpenClaw supplies the plan.
"""
from __future__ import annotations
import contextlib
import fcntl
import importlib.util
import io
import json
import mimetypes
import os
from pathlib import Path
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

import runtime as rt

HOST = 'https://www.runninghub.cn'


def client(name):
    spec = importlib.util.spec_from_file_location(name, rt.PACKAGE / 'vendor/runninghub' / (name + '.py'))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def key():
    value = os.environ.get('RUNNINGHUB_API_KEY', '').strip()
    rt.insist(value, 'PROVIDER_NOT_CONFIGURED', '尚未配置 RunningHub API；请在本机凭据配置中设置，不要把密钥发到对话。')
    return value


def http(url, data=None, headers=None, timeout=60):
    class NoRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, response_headers, newurl):
            raise rt.ToolError('PROVIDER_REDIRECT', 'API 返回重定向，已停止请求以保护认证信息。')
    try:
        with urllib.request.build_opener(NoRedirect()).open(urllib.request.Request(url, data=data, headers=headers or {}), timeout=timeout) as response:
            result = response.read(8 * 1024 * 1024 + 1)
            rt.insist(len(result) <= 8 * 1024 * 1024, 'PROVIDER_RESPONSE_SIZE', '接口响应过大。')
            return result
    except urllib.error.HTTPError as exc:
        code = 'PROVIDER_AUTH' if exc.code in [401, 403] else 'PROVIDER_HTTP'
        raise rt.ToolError(code, f'RunningHub HTTP {exc.code}；凭据与服务端原文不写入对话。') from None
    except (urllib.error.URLError, TimeoutError):
        raise rt.ToolError('PROVIDER_CONNECTION', 'RunningHub 请求未得到确定响应；提交阶段不得直接重试。') from None


def transport(url, payload, headers=None, timeout=60):
    body = http(url, json.dumps(payload).encode(), {'Content-Type': 'application/json', **(headers or {})}, timeout)
    return subprocess.CompletedProcess([], 0, body.decode(), '')


def multipart(path, app=False):
    p = rt.media_path(str(path))
    rt.insist(p.stat().st_size <= 100 * 1024 * 1024, 'UPLOAD_SIZE', '单个上传文件最多 100 MB。')
    boundary = 'commerce' + uuid.uuid4().hex
    chunks = []
    if app:
        chunks.append(f'--{boundary}\r\nContent-Disposition: form-data; name="apiKey"\r\n\r\n{key()}\r\n'.encode())
    mime = mimetypes.guess_type(p.name)[0] or 'application/octet-stream'
    chunks += [f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="input{p.suffix}"\r\nContent-Type: {mime}\r\n\r\n'.encode(), p.read_bytes(), f'\r\n--{boundary}--\r\n'.encode()]
    headers = {'Content-Type': f'multipart/form-data; boundary={boundary}'}
    if not app:
        headers['Authorization'] = 'Bearer ' + key()
    response = json.loads(http(HOST + ('/task/openapi/upload' if app else '/openapi/v2/media/upload/binary'), b''.join(chunks), headers, 120))
    rt.insist(response.get('code') == 0, 'UPLOAD_REJECTED', 'RunningHub 未接受媒体上传。')
    value = response.get('data', {}).get('fileName' if app else 'download_url')
    rt.insist(isinstance(value, str) and value, 'UPLOAD_RECEIPT', '上传缺少有效媒体回执。')
    return value


rh = client('runninghub')
app = client('runninghub_app')
rh.CAPABILITIES_PATH = rt.PACKAGE / 'capabilities.json'
rh.curl_post_json = transport
rh.upload_file = lambda _key, file_path: multipart(file_path)
app.curl_post_json = lambda url, payload, timeout=60: transport(url, payload, timeout=timeout)
app.curl_get = lambda url, timeout=30: subprocess.CompletedProcess([], 0, http(url, timeout=timeout).decode(), '')
app.upload_file = lambda _key, file_path: multipart(file_path, app=True)


def upstream(fn, *args):
    # The upstream CLI prints provider response bodies. Suppress those diagnostics.
    with contextlib.redirect_stdout(io.StringIO()), contextlib.redirect_stderr(io.StringIO()):
        try:
            return fn(*args)
        except SystemExit:
            raise rt.ToolError('PROVIDER_REJECTED', 'RunningHub 拒绝了请求；请核对能力参数、授权或账户状态。') from None


def catalog(request):
    if request.get('capabilityId'):
        endpoint = rh.find_endpoint(request['capabilityId'])
        rt.insist(endpoint, 'CAPABILITY_UNKNOWN', '锁定目录中没有这个能力。')
        return endpoint
    entries = rh.load_capabilities()['endpoints']
    if request.get('task'):
        entries = [entry for entry in entries if request['task'].lower() in (entry['task'] + ' ' + entry['name_cn'] + ' ' + entry['name_en']).lower()]
    return {'total': len(entries), 'entries': [{k: item.get(k) for k in ['endpoint', 'name_cn', 'task', 'output_type', 'category']} for item in sorted(entries, key=lambda item: item.get('popularity', 1000))[:16]],
            'notice': '目录来源已固定；可查询具体 capabilityId 的参数。未实跑不代表当前可用或质量达标。'}


def prepare(request):
    rt.insist(bool(request.get('capabilityId')) != bool(request.get('webappId')), 'CAPABILITY_REQUIRED', '指定一个能力端点或 AI 应用。')
    if request.get('webappId'):
        rt.insist(request['webappId'].isdigit(), 'APP_ID', 'AI 应用标识必须是数字。')
        schema = upstream(app.get_node_info, key(), request['webappId'])
        allowed = {(str(n['nodeId']), n['fieldName']) for n in schema}
        nodes = request.get('nodes', [])
        rt.insist(nodes and all((n['nodeId'], n['fieldName']) in allowed for n in nodes), 'APP_NODES', '必须按实时查询的应用节点提供参数。')
        rt.insist(len({(n['nodeId'], n['fieldName']) for n in nodes}) == len(nodes), 'APP_NODES', '应用节点不能重复。')
        request['outputType'] = 'unknown'
        return request
    endpoint = catalog(request)
    rt.insist(endpoint['output_type'] in ['image', 'video', 'audio'], 'OUTPUT_UNSUPPORTED', '当前 Agent 只交付图片、视频与声音。')
    definitions = {p['key']: p for p in endpoint['params']}
    values = dict(request.get('params') or {})
    rt.insist(all(k in definitions for k in values), 'PARAMETER_UNKNOWN', '参数不在能力目录中。')
    # Never inherit example prompts or example media from a catalog.
    if request.get('prompt'):
        target = next((k for k in ['prompt', 'text'] if k in definitions), None)
        rt.insist(target, 'PROMPT_PARAMETER', '此能力不支持 prompt/text。')
        values[target] = request['prompt']
    for plural, kind in [('images', 'IMAGE'), ('audio', 'AUDIO'), ('videos', 'VIDEO')]:
        sources = request.get(plural, [])
        fields = [p for p in endpoint['params'] if p['type'] == kind]
        if not sources:
            continue
        rt.insist(fields, 'MEDIA_PARAMETER', f'此能力不接受 {plural}。')
        multi = next((p for p in fields if p.get('multiple')), None)
        rt.insist(multi or len(sources) <= len(fields), 'MEDIA_COUNT', '媒体数量超过能力参数。')
        if multi:
            values[multi['key']] = sources
        else:
            for field, source in zip(fields, sources): values[field['key']] = source
    for name, p in definitions.items():
        if name not in values and p.get('required') and p['type'] not in ['IMAGE', 'VIDEO', 'AUDIO'] and name not in ['prompt', 'text'] and 'default' in p:
            values[name] = p['default']
        rt.insist(not p.get('required') or name in values, 'PARAMETER_REQUIRED', f'缺少必需参数 {name}。')
        if name not in values:
            continue
        value = values[name]
        if p['type'] in ['IMAGE', 'VIDEO', 'AUDIO']:
            paths = value if p.get('multiple') else [value]
            rt.insist(isinstance(paths, list) and paths and len(paths) <= p.get('maxCount', 10), 'MEDIA_COUNT', f'{name} 数量不合法。')
            normalized = [str(rt.media_path(v)) for v in paths]
            rt.insist(all(Path(v).stat().st_size <= p.get('maxSizeMB', 100) * 1024 * 1024 for v in normalized), 'MEDIA_SIZE', f'{name} 超过上传大小限制。')
            values[name] = normalized if p.get('multiple') else normalized[0]
        elif p['type'] in ['INT', 'FLOAT']:
            rt.finite(value, name, p.get('min', -1e12), p.get('max', 1e12))
            rt.insist(p['type'] != 'INT' or isinstance(value, int), 'PARAMETER_TYPE', f'{name} 必须是整数。')
        elif p['type'] == 'BOOLEAN':
            rt.insist(isinstance(value, bool), 'PARAMETER_TYPE', f'{name} 必须是布尔值。')
        else:
            rt.insist(isinstance(value, str), 'PARAMETER_TYPE', f'{name} 必须是文字。')
        if p.get('options'):
            options = [o.get('value') if isinstance(o, dict) else o for o in p['options']]
            rt.insist(value in options, 'PARAMETER_OPTION', f'{name} 不在能力选项中。')
    request['params'] = values
    request['outputType'] = endpoint['output_type']
    return request


def reserve(task):
    # Prices are operator-verified ceilings, never model-supplied estimates.
    limit = float(os.environ.get('COMMERCE_GENERATION_BUDGET_CNY', '0'))
    rt.insist(limit > 0, 'BUDGET_REQUIRED', '尚未设置本轮付费生成预算。')
    ceilings = json.loads(os.environ.get('COMMERCE_COST_CEILINGS_JSON', '{}'))
    identity = task['request'].get('capabilityId') or 'app:' + task['request']['webappId']
    ceiling = ceilings.get(identity)
    rt.insist(isinstance(ceiling, (int, float)) and ceiling > 0, 'PRICE_NOT_VERIFIED', '该能力尚无核对过的单次价格上限，不能用模型估价开启收费任务。')
    ledger = rt.data_root() / 'budget.json'
    ledger.parent.mkdir(parents=True, exist_ok=True)
    with (ledger.parent / 'budget.lock').open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        state = json.loads(ledger.read_text()) if ledger.exists() else {'reserved': {}}
        if task['runId'] not in state['reserved']:
            rt.insist(sum(state['reserved'].values()) + ceiling <= limit, 'BUDGET_EXCEEDED', '本轮剩余预算不足。')
            state['reserved'][task['runId']] = ceiling
            rt.atomic_json(ledger, state)
    task['cost'] = {'reservedCny': ceiling, 'actualCny': None, 'basis': 'operator_verified_ceiling'}


def generate(request):
    operation = request.get('operation')
    if operation == 'catalog': return catalog(request)
    if operation == 'app_info':
        identity = request.get('webappId', '')
        rt.insist(identity.isdigit(), 'APP_ID', '需要有效 AI 应用标识。')
        return {'webappId': identity, 'nodes': upstream(app.get_node_info, key(), identity)}
    rt.insist(operation == 'generate', 'OPERATION_INVALID', '未知生成操作。')
    key()
    rt.insist(float(os.environ.get('COMMERCE_GENERATION_BUDGET_CNY', '0')) > 0, 'BUDGET_REQUIRED', '尚未设置本轮付费生成预算。')
    prepared = prepare(json.loads(json.dumps(request)))
    if prepared.get('parentRunId'): rt.read_task(prepared['parentRunId'])
    task, created = rt.new_task('generate', prepared)
    if not created: return rt.public_task(task)
    if prepared.get('parentRunId'): task['parentRunId'] = prepared['parentRunId']
    try:
        reserve(task)
        return rt.launch(task)
    except rt.ToolError as exc:
        task['status'] = 'failed'
        task['error'] = {'code': exc.code, 'message': str(exc)}
        rt.save_task(task)
        raise


def download(url, target):
    # Provider result URLs may use a CDN; reject local/private destinations.
    import ipaddress
    import socket
    class SafeRedirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            check(newurl)
            return super().redirect_request(req, fp, code, msg, headers, newurl)
    def check(value):
        parsed = urllib.parse.urlparse(value)
        rt.insist(parsed.scheme == 'https' and parsed.hostname and not parsed.username and not parsed.password, 'RESULT_URL', '结果链接不是合法 HTTPS 地址。')
        rt.insist(all(ipaddress.ip_address(a[4][0]).is_global for a in socket.getaddrinfo(parsed.hostname, parsed.port or 443)), 'RESULT_URL', '结果链接不能访问本机或私有网络。')
    check(url)
    partial = target.with_suffix('.part')
    try:
        with urllib.request.build_opener(SafeRedirect()).open(url, timeout=120) as response, partial.open('wb') as output:
            count = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                count += len(chunk)
                rt.insist(count <= 512 * 1024 * 1024, 'RESULT_SIZE', '媒体结果超过 512 MB。')
                output.write(chunk)
        os.replace(partial, target)
    except rt.ToolError: raise
    except Exception:
        raise rt.ToolError('RESULT_DOWNLOAD', '结果尚未下载完成，可用原任务恢复，不能重新生成。') from None
    finally: partial.unlink(missing_ok=True)


def generate_worker(task):
    request = task['request']
    if not task.get('providerTaskId'):
        if request.get('webappId'):
            nodes = json.loads(json.dumps(request['nodes']))
            for node in nodes:
                value = node['fieldValue']
                if value.startswith(('/', 'media://inbound/')):
                    node['fieldValue'] = multipart(value, app=True)
            submit = lambda: upstream(app.submit_task, key(), request['webappId'], nodes)
        else:
            endpoint = rh.find_endpoint(request['capabilityId'])
            payload = dict(request['params'])
            for p in endpoint['params']:
                if p['key'] in payload and p['type'] in ['IMAGE', 'VIDEO', 'AUDIO']:
                    value = payload[p['key']]
                    payload[p['key']] = [multipart(v) for v in value] if p.get('multiple') else multipart(value)
            submit = lambda: upstream(rh.api_post, key(), rh.BASE_URL + '/' + request['capabilityId'], payload)
        task['submissionStarted'] = time.time()
        rt.save_task(task)
        response = submit()  # Exactly one submission; an unknown response is never auto-retried.
        rt.insist(response.get('taskId'), 'SUBMISSION_UNKNOWN', '提交响应没有 taskId；先到 RunningHub 核对，禁止自动重发。')
        task['providerTaskId'] = str(response['taskId'])
        task['status'] = 'submitted'
        rt.save_task(task)
    deadline = time.monotonic() + 1200
    while True:
        response = upstream(rh.api_post, key(), rh.BASE_URL + '/query', {'taskId': task['providerTaskId']})
        status = response.get('status')
        if status == 'SUCCESS': break
        if status == 'FAILED':
            task['status'] = 'failed'
            task['error'] = {'code': 'PROVIDER_TASK_FAILED', 'message': 'RunningHub 已明确报告失败，请在原任务记录核对原因。'}
            task['resumeAllowed'] = False
            rt.save_task(task)
            return
        rt.insist(status in ['QUEUED', 'RUNNING', 'PENDING', 'PROCESSING'], 'PROVIDER_STATUS', '服务端返回未知状态，保留原 taskId 待核对。')
        rt.insist(time.monotonic() < deadline, 'PROVIDER_TIMEOUT', '等待超过二十分钟，可恢复查询原任务。')
        task['status'] = 'polling'
        rt.save_task(task)
        time.sleep(5)
    results = response.get('results', [])
    rt.insist(results, 'RESULT_EMPTY', '服务端报告成功但没有媒体结果。')
    artifacts = []
    for i, result in enumerate(results[:12]):
        url = result.get('url') or result.get('outputUrl')
        rt.insist(url, 'RESULT_EMPTY', '结果缺少媒体下载地址。')
        extension = result.get('outputType') or {'image': 'png', 'video': 'mp4', 'audio': 'mp3'}.get(request['outputType']) or Path(urllib.parse.urlparse(url).path).suffix.lstrip('.')
        rt.insist('.' + extension.lower() in rt.MEDIA_SUFFIXES, 'RESULT_TYPE', '结果不是当前支持的媒体格式。')
        target = rt.task_dir(task['runId']) / f'result-{i}.{extension}'
        if not target.exists(): download(url, target)
        info = rt.probe(target)
        rt.insist(info['videoCodec'] or info['audio'], 'RESULT_DECODE', '结果无法解码为媒体。')
        artifacts.append({**info, 'media': 'MEDIA:' + str(target)})
    task['artifacts'] = artifacts
    usage = response.get('usage') or {}
    task['cost']['actualCny'] = usage.get('consumeMoney') or usage.get('thirdPartyConsumeMoney')
    task['review'] = {'technical': 'probe_passed', 'visual': 'pending', 'audioPerception': 'pending'}
    task['status'] = 'ready_for_review'
    task['resumeAllowed'] = False
    task.pop('error', None)
    rt.save_task(task)
