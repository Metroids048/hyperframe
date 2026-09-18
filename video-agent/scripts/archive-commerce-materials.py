"""Non-destructive, repeatable scene archive. No inferred generation acceptance."""
from pathlib import Path
import hashlib
import json
import shutil
import datetime
import os
import subprocess
import uuid

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT.parent / '素材'
SCENES = ['新品首发', '商品详情', '使用教程', '搭配系列', '促销预告', '选购问答', '已有视频精剪', '一稿多版']

def sha(path):
    h = hashlib.sha256()
    with path.open('rb') as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()

def archive():
    records = []
    probes = {}
    probe_bin = os.environ.get('HYPERFRAMES_FFPROBE_PATH') or shutil.which('ffprobe')
    if not probe_bin:
        probe_bin = next((str(p) for p in (ROOT / 'node_modules/@ffprobe-installer').glob('*/ffprobe*')
                          if p.is_file() and os.access(p, os.X_OK)), None)
    if not probe_bin:
        raise RuntimeError('ffprobe is required to verify archived media')
    for i, title in enumerate(SCENES, 1):
        for category in ['原始素材', '参考作品', 'Agent候选', '历史输出']:
            (ARCHIVE / f'S{i:02}_{title}' / category).mkdir(parents=True, exist_ok=True)

    def add(scene, source, label, category='原始素材', provenance='source', **metadata):
        source = ROOT / source
        directory = ARCHIVE / f'S{scene:02}_{SCENES[scene - 1]}' / category
        record = dict(scene=f'S{scene:02}', source=str(source.resolve()), category=category,
                      provenance=provenance, **metadata)
        if not source.is_file():
            records.append(dict(record, status='missing', intendedName=label))
            return
        digest = sha(source)
        if digest not in probes:
            result = subprocess.run([probe_bin, '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(source)],
                                    capture_output=True, text=True, check=True, timeout=30)
            info = json.loads(result.stdout)
            probes[digest] = dict(duration=info.get('format', {}).get('duration'),
                                 streams=[{k: s[k] for k in ['codec_type', 'codec_name', 'width', 'height', 'sample_rate', 'channels', 'duration'] if k in s}
                                          for s in info.get('streams', [])])
        destination = directory / f'S{scene:02}_{label}_{digest[:8]}{source.suffix}'
        if destination.exists():
            if sha(destination) != digest:
                raise RuntimeError(f'Archive conflict; preserving file: {destination}')
        else:
            # Publish without replacing any concurrent/local write.
            temporary = destination.with_name(destination.name + '.' + uuid.uuid4().hex + '.partial')
            with temporary.open('xb') as output, source.open('rb') as stream:
                shutil.copyfileobj(stream, output)
            if sha(temporary) != digest:
                raise RuntimeError(f'Copy verification failed: {temporary}')
            try:
                os.link(temporary, destination)
            finally:
                temporary.unlink()
        records.append(dict(record, path=str(destination.relative_to(ARCHIVE)),
                            sha256=digest, bytes=destination.stat().st_size, mediaInfo=probes[digest], status='copied_verified'))

    originals = {
        1: [('Steam_Deck_Unboxing.webm', '掌机_开箱原片')],
        2: [('ASUS_PROART_RTX_4070_Ti_Unboxing_-_By_INVADERPC.webm', '显卡_外观原片'), ('Xiaomi_MiJia_4K_Action_Camera_Unboxing.webm', '米家相机_参考原片')],
        3: [('Nissin_Cup_Noodle_Gohan_curry_flavoured,_-2013_a.webm', '即食饭_使用原片')],
        6: [('Steam_Deck_Unboxing.webm', '掌机_盒内物品原片')],
        7: [('Video_of_a_complete_use_session_with_a_gyroscopic_exercise_tool.webm', '握力球_过程原片')],
    }
    source_registry = json.loads((ROOT / 'docs/scene-demos-phase2/01_MATERIAL_SCENE_MAP.json').read_text())
    original_records = {Path(m.get('repositoryPath', '')).name: m for m in source_registry['materials']}
    for scene, files in originals.items():
        for file, label in files:
            add(scene, '../素材/' + file, label, sourceRecord=original_records.get(file),
                sourceRegistry='video-agent/docs/scene-demos-phase2/01_MATERIAL_SCENE_MAP.json')
    sources = json.loads((ROOT / 'assets/scene-demo-inputs/raw/SOURCES.json').read_text())
    # Retain the full supplied source records; no new rights assertion.
    for scene, ids in [(4, [8447362, 8447672, 8453909]), (5, [9430537, 9430543, 9430550])]:
        for number in ids:
            add(scene, f'assets/scene-demo-inputs/raw/pexels-{number}.mp4', f'素材_{number}_原片', sourceRegistry='video-agent/assets/scene-demo-inputs/raw/SOURCES.json')
    add(8, 'assets/commerce-showcase/moka-brewing.webm', '咖啡_完整原片', sourceRegistry='video-agent/assets/commerce-motion/sources.json')
    for item in json.loads((ROOT / 'assets/commerce-motion/sources.json').read_text()):
        add(8, 'assets/commerce-motion/' + item['file'], '咖啡_预处理选段_' + Path(item['file']).stem,
            provenance='source-excerpt', sourceRange=item.get('parent'), sourcePage=item.get('sourcePage'), rights=item.get('rights'))
    add(2, 'deliverables/mijia-v2/mijia-product-ad-v2.mp4', '米家相机_质量参考_V2', '参考作品', 'reference-author-v2')
    add(2, 'deliverables/s02-gpu-closeout-20260916/versions/final/commerce-final.mp4', '显卡_候选_历史收口版', 'Agent候选', 'own-agent-retained-project-controlled-closeout', quality='awaiting_review')
    for scene, project in [(3, '5378f35d-138f-4a6f-9a82-7b0e3cf1c63b'), (4, '390791e9-43d1-423b-b4bd-d3fec9cc04a2')]:
        base = ROOT / 'data/result-completion-projects' / project
        data = json.loads((base / 'native-project.json').read_text())
        revision = next(r for r in data['revisions'] if r['id'] == data['currentRevisionId'])
        directory = base / revision['directory']
        document = json.loads((directory / 'document.json').read_text())
        add(scene, str(directory / 'commerce-final.mp4'), data['title'].replace(' · ', '_').replace('（可对话编辑）', '') + '_当前参考版', '参考作品', document.get('provenance'), projectId=project, revisionId=revision['id'], quality='awaiting_review')
    add(7, 'examples/scene-demos/S07-v2/demo.mp4', '握力球_参考_V2', '参考作品', 'reference-author-v2')
    add(8, 'deliverables/s08-coffee-demo-20260918/master/demo.mp4', '咖啡_真实WebUI母版', 'Agent候选', 'own-agent-webui-recorded-run',
        projectId='b2a3a09a-a6fa-4743-b281-f61e3a972cb7', revisionId='rev-6cb1827d9c4e5021', quality='awaiting_review')
    add(8, 'deliverables/s08-variants-demo-20260918/A/demo.mp4', '咖啡_真实WebUI_A版', 'Agent候选', 'own-agent-webui-recorded-run',
        projectId='b2a3a09a-a6fa-4743-b281-f61e3a972cb7', revisionId='rev-474e0f9fbecca83d', quality='awaiting_review')
    # Only archive actual revisions from this validation's recorded WebUI jobs.
    # A running job, reference project or matching filename is insufficient.
    ledger_path = ROOT / 'outputs/product-remediation-20260918/status.json'
    if ledger_path.is_file():
        ledger = json.loads(ledger_path.read_text())
        for scene_id, state in ledger.get('scenarios', {}).items():
            project_id = state.get('projectId')
            if not project_id or state.get('entry') != 'browser_upload_and_chat':
                continue
            bases = [ROOT / 'data/result-completion-projects' / project_id,
                     ROOT / 'data/product-remediation-20260918/commerce' / project_id]
            base = next((candidate for candidate in bases if (candidate / 'native-project.json').is_file()), None)
            if base is None:
                continue
            project_file = base / 'native-project.json'
            project = json.loads(project_file.read_text())
            for revision in project.get('revisions', []):
                if not revision.get('rendered'):
                    continue
                directory = base / revision['directory']
                movie, document_file = directory / 'commerce-final.mp4', directory / 'document.json'
                if not movie.is_file() or not document_file.is_file():
                    continue
                document = json.loads(document_file.read_text())
                run_id = document.get('production', {}).get('runId')
                if run_id != state.get('runId') or not run_id:
                    continue
                add(int(scene_id[1:]), str(movie), '真实WebUI_候选_' + revision['id'],
                    'Agent候选', 'own-agent-webui-recorded-run', projectId=project_id,
                    revisionId=revision['id'], runId=run_id, quality='awaiting_review',
                    automaticGenerationAcceptance=False, retainedProvenance=document.get('provenance'))
    report = dict(schemaVersion=1, generatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                  scope='Archive of existing evidence; not eight-scenario acceptance', files=records,
                  supplementalSourceRecords=sources)
    (ARCHIVE / '八场景素材索引.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    rows = [
        '# 八场景素材与作品索引', '',
        '原位置与工程引用全部保留。参考／辅助制作不等于产品 Agent 自主生成；候选均未代签人评。', '',
        '| 场景 | 原始视频 | Agent 候选 | 参考作品 | 当前结论 |',
        '| --- | ---: | ---: | ---: | --- |',
    ]
    for i, title in enumerate(SCENES, 1):
        entries = [r for r in records if r['scene'] == f'S{i:02}']
        source_count = sum(r['category'] == '原始素材' and r['status'] != 'missing' for r in entries)
        agent_count = sum(r['category'] == 'Agent候选' and r['status'] != 'missing' for r in entries)
        reference_count = sum(r['category'] == '参考作品' and r['status'] != 'missing' for r in entries)
        lines = [f'# S{i:02} {title}', '', '文件内容已按 SHA256 核对；完整视听与业务验收另行记录。', '']
        for record in entries:
            if record['status'] == 'missing':
                lines.append('- 缺失：' + record['source'])
            else:
                rel = Path(record['path']).relative_to(f'S{i:02}_{title}').as_posix()
                lines.append(f'- [{Path(rel).name}](<{rel}>) — {record["category"]}；来源：{record["provenance"]}')
        if not any(r['category'] == 'Agent候选' and r['status'] != 'missing' for r in entries):
            lines += ['', '当前未归档可证明自主首轮制作通过的 Agent 成片；不是已交付。']
        directory = ARCHIVE / f'S{i:02}_{title}'
        (directory / '说明.md').write_text('\n'.join(lines) + '\n')
        candidate_status = [
            f'# S{i:02} {title} · Agent 候选状态', '',
            f'- 已归档 Agent 候选：{agent_count} 个',
            f'- 已归档参考作品：{reference_count} 个',
            '- 参考作品不等于自有 Agent 生成。',
            '- Agent 候选也仍需完整观片、听音与人工认可。',
        ]
        if agent_count == 0:
            candidate_status += ['', '当前缺少可证明该场景自主首轮制作完成的 Agent 成片。']
        (directory / 'Agent候选' / '状态.md').write_text('\n'.join(candidate_status) + '\n')
        conclusion = '有待审 Agent 候选' if agent_count else '缺 Agent 候选，未完成'
        rows.append(f'| [S{i:02} {title}](<S{i:02}_{title}/说明.md>) | {source_count} | {agent_count} | {reference_count} | {conclusion} |')
    rows += ['', '目录约定：每个场景的真实原片在 `原始素材/`；自有 Agent 输出只放在 `Agent候选/`；Codex 辅助或人工参考片只放在 `参考作品/`。空的 Agent 候选目录不是漏拷贝，而是该场景尚未完成。']
    material_guide = '\n'.join(rows) + '\n'
    (ARCHIVE / '八场景素材说明.md').write_text(material_guide)
    (ARCHIVE / '00_请先看这里.md').write_text(material_guide)
    print(json.dumps({'files': len(records), 'missing': [r['source'] for r in records if r['status'] == 'missing'], 'index': str(ARCHIVE / '八场景素材索引.json')}, ensure_ascii=False))

if __name__ == '__main__':
    archive()
