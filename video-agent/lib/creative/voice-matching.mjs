import fs from 'node:fs/promises';
import path from 'node:path';

const text=value=>String(value||'');
const includes=(value,pattern)=>pattern.test(text(value));
const uniq=value=>[...new Set(value.filter(Boolean))];

export function voiceProfile(voice){
  const source=[voice.name,voice.description].filter(Boolean).join(' ');
  const languageSource=[voice.language,voice.description].filter(Boolean).join(' ');
  const language=/普通话|Mandarin|\bzh(?:-CN)?\b/i.test(languageSource)?'zh':/粤语|Cantonese/i.test(languageSource)?'yue':/英语|English|\ben\b/i.test(languageSource)?'en':/韩语|Korean/i.test(languageSource)?'ko':/日语|Japanese/i.test(languageSource)?'ja':/俄语|Russian/i.test(languageSource)?'ru':/德语|German/i.test(languageSource)?'de':/葡萄牙语|Portuguese/i.test(languageSource)?'pt':/西班牙语|Spanish/i.test(languageSource)?'es':/法语|French/i.test(languageSource)?'fr':null;
  const gender=includes(source,/女|female|woman|girl|zf_/i)?'female':includes(source,/男|male|man|boy|zm_/i)?'male':'neutral';
  const age=includes(source,/儿童|童声|child|kid/i)?'child':includes(source,/成熟|沉稳|中年|mature|senior/i)?'mature':includes(source,/年轻|青年|少女|少年|young/i)?'young':'adult';
  const tone=uniq([
    includes(source,/温柔|柔和|gentle|soft|warm/i)?'warm':null,
    includes(source,/沉稳|专业|professional|calm|deep/i)?'professional':null,
    includes(source,/活泼|元气|bright|lively|energetic/i)?'energetic':null,
    includes(source,/高级|质感|luxury|premium/i)?'premium':null,
    includes(source,/亲切|自然|friendly|natural/i)?'friendly':null
  ]);
  const emotion=uniq([
    includes(source,/开心|愉快|cheer|happy|joy/i)?'cheerful':null,
    includes(source,/冷静|平静|calm/i)?'calm':null,
    includes(source,/热情|兴奋|excited|passion/i)?'excited':null,
    includes(source,/可信|可靠|trust/i)?'trustworthy':null
  ]);
  const commercialStyle=uniq([
    ...(tone.includes('energetic')?['promotion','advertising']:[]),
    ...(tone.includes('premium')?['brand_story','advertising']:[]),
    ...(tone.includes('professional')?['tutorial','brand_story']:[]),
    ...(tone.includes('friendly')||tone.includes('warm')?['tutorial','advertising']:[])
  ]);
  if(!commercialStyle.length)commercialStyle.push('advertising','tutorial');
  const recommendedScene=uniq(commercialStyle.flatMap(style=>({advertising:['product_launch'],tutorial:['product_tutorial','product_faq'],brand_story:['product_detail'],promotion:['product_promotion']}[style]||[])));
  return {
    voice_id:voice.id,
    language,
    name:voice.name||voice.id,
    description:voice.description||'',
    gender,
    age,
    tone:tone.length?tone:['neutral'],
    emotion:emotion.length?emotion:['neutral'],
    speed:includes(source,/快|fast|energetic/i)?'fast':includes(source,/慢|slow|calm/i)?'slow':'medium',
    commercial_style:commercialStyle,
    recommended_scene:recommendedScene.length?recommendedScene:['product_launch','product_detail'],
    platform:includes(source,/小红书|抖音|social/i)?['xiaohongshu','douyin']:['xiaohongshu','douyin','ecommerce_detail'],
    source:'catalog-derived',
    reviewed:false
  };
}

export async function buildVoiceProfiles(catalog,{directory,baseProfiles=[]}={}){
  const saved=new Map(baseProfiles.map(profile=>[profile.voice_id,profile]));
  const profiles=(catalog?.voices||[]).map(voice=>({...voiceProfile(voice),...(saved.get(voice.id)||{}),voice_id:voice.id,name:voice.name||saved.get(voice.id)?.name||voice.id,description:voice.description||saved.get(voice.id)?.description||''}));
  const result={schema_version:1,engine:catalog?.engine||'unknown',generated_at:new Date().toISOString(),voice_count:profiles.length,profiles};
  if(directory)await fs.writeFile(path.join(directory,'voice-profiles.json'),JSON.stringify(result,null,2));
  return result;
}

export function audioRequirement({message='',marketingPlan,sceneId}){
  const source=[message,marketingPlan?.music_style?.mood,marketingPlan?.caption_strategy?.tone,marketingPlan?.marketing_objective].filter(Boolean).join(' ');
  const commercial_style=sceneId==='product_promotion'?'promotion':sceneId==='product_detail'?'brand_story':sceneId==='product_demo'||sceneId==='product_howto'||sceneId==='product_faq'?'tutorial':'advertising';
  return {language:/粤语|Cantonese/i.test(message)?'yue':/英文|英语|English/i.test(message)?'en':/[\u3400-\u9fff]/.test(message)?'zh':'en',scene:sceneId||marketingPlan?.scene_type||'product_launch',platform:marketingPlan?.platform||'general',gender:includes(source,/男声|男性|\bmale\b/i)?'male':includes(source,/女声|女性|female/i)?'female':'neutral',age:includes(source,/年轻|青年|young/i)?'young':'adult',tone:includes(source,/高级|质感|premium|luxury/i)?'premium':includes(source,/活泼|元气|energetic/i)?'energetic':includes(source,/专业|沉稳|professional|calm/i)?'professional':'warm',emotion:includes(source,/促销|限时|活动|excited/i)?'excited':includes(source,/温暖|生活|warm/i)?'cheerful':'trustworthy',speed:includes(source,/快节奏|快一点|fast/i)?'fast':includes(source,/慢|舒缓|slow/i)?'slow':'medium',commercial_style};
}

export function voiceCandidates(profiles,requirement,{limit=12}={}){
  let eligible=profiles;
  if(requirement.language){const compatible=eligible.filter(profile=>profile.language===requirement.language);eligible=compatible.length?compatible:eligible.filter(profile=>!profile.language);}
  if(requirement.gender!=='neutral'){const matching=eligible.filter(profile=>profile.gender===requirement.gender);if(matching.length)eligible=matching;}
  const scored=eligible.map(profile=>{
    let score=0;const reasons=[];
    const add=(points,reason)=>{score+=points;reasons.push(reason);};
    if(requirement.gender==='neutral'||profile.gender===requirement.gender)add(3,'gender');
    if(requirement.age===profile.age||requirement.age==='adult'&&['adult','young'].includes(profile.age))add(1,'age');
    if(profile.tone.includes(requirement.tone))add(3,'tone');
    if(profile.emotion.includes(requirement.emotion))add(2,'emotion');
    if(profile.speed===requirement.speed)add(1,'speed');
    if(profile.commercial_style.includes(requirement.commercial_style))add(4,'commercial_style');
    if(profile.recommended_scene.includes(requirement.scene))add(3,'scene');
    if(profile.platform.includes(requirement.platform)||requirement.platform==='general')add(1,'platform');
    return {voice_id:profile.voice_id,name:profile.name,description:profile.description,profile,score,reasons};
  }).sort((a,b)=>b.score-a.score||a.voice_id.localeCompare(b.voice_id));
  return scored.slice(0,Math.max(1,limit));
}
