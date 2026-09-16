import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {hashFile,probe} from '../edit/media.mjs';
import {CreativeError,insist} from './contracts.mjs';

const media=/\.(mp4|mov|webm|png|jpe?g|webp)$/i;
const generatedDirectories=new Set(['outputs','output','exports','export','deliverables','versions','uploads','cache','node_modules','thumbs','thumbnails','previews','evidence','resources','导出','成片','缩略图']);
const generatedFile=/^(?:contact(?:-sheet)?[-_.]|review[-_]|candidate[-_]|poster[-_.]|crop[-_]|frame[-_]|commerce-final\.)/i;
const hash=text=>createHash('sha256').update(text).digest('hex');
const canonical=file=>process.platform==='win32'?file.toLowerCase():file;
const inside=(base,file)=>{const relative=path.relative(base,file);return !path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep);};
const display=file=>file.replaceAll('\\','/');
const errorStatus=error=>error.code==='ENOENT'?'missing':['EACCES','EPERM'].includes(error.code)?'inaccessible':'scan_failed';

/** Only server configuration grants traversal. Indexing never copies originals. */
export async function discoverMaterialRoots(root,{filesystem=fs}={}){
  let settings={};try{settings=JSON.parse(await filesystem.readFile(path.join(root,'config/commerce.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const configured=settings.commerce?.materialRoots||[];
  insist(Array.isArray(configured)&&configured.every(p=>typeof p==='string'&&p.length),'素材目录配置无效','MATERIAL_CONFIG');
  const bases=[path.join(root,'assets'),...configured.map(p=>path.resolve(root,p))],found=[],seenRoots=new Set();
  for(const base of bases){
    const record={id:hash(canonical(base)).slice(0,24),label:display(path.relative(root,base)),directory:base,status:'ready',entries:[],files:[],videos:0,images:0,diagnostics:[],excluded:[]};
    try{record.directory=await filesystem.realpath(base);const stat=await filesystem.stat(record.directory);insist(stat.isDirectory(),'配置的素材根不是目录','MATERIAL_NOT_DIRECTORY');}
    catch(error){record.status=errorStatus(error);record.diagnostics.push({path:record.label,code:error.code||'SCAN_FAILED',status:record.status});found.push(record);continue;}
    record.id=hash(canonical(record.directory)).slice(0,24);
    if(seenRoots.has(record.id))continue;seenRoots.add(record.id);
    const visited=new Set(),indexed=new Set();
    const diagnostic=(file,error)=>{record.status='partial';record.diagnostics.push({path:display(path.relative(record.directory,file)),code:error.code||'SCAN_FAILED',status:errorStatus(error)});};
    async function walk(directory,depth=0){
      if(depth>64||record.entries.length>=10000){diagnostic(directory,{code:'SCAN_LIMIT'});return;}
      let real,children;
      try{real=await filesystem.realpath(directory);if(!inside(record.directory,real)){record.excluded.push({path:display(path.relative(base,directory)),reason:'outside_authorized_root'});return;}
        if(visited.has(canonical(real)))return;visited.add(canonical(real));children=await filesystem.readdir(real,{withFileTypes:true});
      }catch(error){diagnostic(directory,error);return;}
      if(children.some(e=>e.name==='document.json')&&children.some(e=>e.name==='hyperframes.json')){record.excluded.push({path:display(path.relative(base,directory)),reason:'native_project_output'});return;}
      for(const child of children.sort((a,b)=>a.name.localeCompare(b.name))){
        if(record.entries.length>=10000){diagnostic(real,{code:'SCAN_LIMIT'});break;}
        const file=path.join(real,child.name);let actual=file,stat;
        if(child.name.startsWith('.')||generatedDirectories.has(child.name.toLowerCase())){record.excluded.push({path:display(path.relative(base,file)),reason:'derived_or_hidden'});continue;}
        try{
          actual=await filesystem.realpath(file);
          if(!inside(record.directory,actual)){record.excluded.push({path:display(path.relative(base,file)),reason:'outside_authorized_root'});continue;}
          if(path.relative(record.directory,actual).split(path.sep).some(part=>part.startsWith('.')||generatedDirectories.has(part.toLowerCase()))){record.excluded.push({path:display(path.relative(base,file)),reason:'derived_or_hidden'});continue;}
          stat=await filesystem.stat(actual);
          if(stat.isDirectory()){await walk(actual,depth+1);continue;}
          if(!stat.isFile()||!media.test(child.name))continue;
          if(generatedFile.test(child.name)||generatedFile.test(path.basename(actual))){record.excluded.push({path:display(path.relative(base,file)),reason:'derived_filename'});continue;}
          if(indexed.has(canonical(actual)))continue;indexed.add(canonical(actual));
          const kind=/\.(mp4|mov|webm)$/i.test(child.name)?'video':'image';
          const entry={id:null,name:child.name,relativePath:display(path.relative(record.directory,actual)),realPath:actual,kind,bytes:stat.size,sha256:null,status:'indexed',technicalStatus:'not_checked',contentSuitability:'not_assessed',fullDecode:'not_checked'};
          try{
            entry.sha256=await hashFile(actual);const after=await filesystem.stat(actual);
            insist(after.size===stat.size&&after.mtimeMs===stat.mtimeMs&&after.ino===stat.ino,'索引期间原素材发生变化','MATERIAL_CHANGED');
            entry.id=hash(canonical(actual)+':'+entry.sha256).slice(0,32);
            try{if(kind==='video')entry.metadata=await probe(actual);else{const {width,height,format,space,channels}=await sharp(actual).metadata();entry.metadata={width,height,format,space,channels};}entry.technicalStatus='headers_passed';}
            catch(error){entry.technicalStatus='probe_failed';entry.errorCode='MATERIAL_PROBE_FAILED';}
          }catch(error){entry.status=errorStatus(error);entry.errorCode=error.code||'SCAN_FAILED';diagnostic(actual,error);}
          record.entries.push(entry);
        }catch(error){diagnostic(file,error);}
      }
    }
    await walk(record.directory);
    record.files=record.entries.filter(e=>e.status==='indexed'&&e.technicalStatus==='headers_passed').map(e=>e.realPath);
    record.videos=record.entries.filter(e=>e.kind==='video').length;record.images=record.entries.filter(e=>e.kind==='image').length;
    record.indexHash=hash(JSON.stringify(record.entries.map(({id,relativePath,sha256,status,technicalStatus})=>({id,relativePath,sha256,status,technicalStatus}))));
    found.push(record);
  }
  return found;
}

export function publicMaterialRoot({directory,files,entries,...record}){
  return {...record,entries:entries.map(({realPath,...entry})=>entry)};
}
export async function resolveMaterialRoot(root,id){
  const match=(await discoverMaterialRoots(root)).find(r=>r.id===id);
  if(!match)throw new CreativeError('素材目录未授权、不存在或已变化','MATERIAL_ROOT_UNKNOWN');
  insist(['ready','partial'].includes(match.status),'素材目录扫描失败：'+match.status,'MATERIAL_ROOT_UNAVAILABLE');
  return match;
}
export function selectMaterialEntries(root,ids){
  insist(Array.isArray(ids)&&ids.length>0&&ids.every(id=>typeof id==='string'),'请先选择要加入工程的素材','MATERIAL_SELECTION_REQUIRED');
  const entries=[...new Set(ids)].map(id=>root.entries.find(e=>e.id===id));
  insist(entries.every(Boolean),'选中的素材已变化，请刷新目录后重选','MATERIAL_CHANGED');
  insist(entries.every(e=>e.status==='indexed'&&e.technicalStatus==='headers_passed'),'选中的素材不可读取或技术探测失败','MATERIAL_PROBE_FAILED');
  return entries;
}
