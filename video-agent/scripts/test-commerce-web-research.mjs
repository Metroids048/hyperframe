import assert from 'node:assert/strict';
import test from 'node:test';
import {searchCommerceWeb,tavilyCapabilityStatus} from '../lib/creative/commerce-web-research.mjs';

function jsonResponse(payload,status=200){
  return new Response(JSON.stringify(payload),{status,headers:{'content-type':'application/json'}});
}

test('Tavily search returns evidence and rights-gated image candidates',async()=>{
  const previous=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='test-only-not-a-credential';
  const calls=[];
  try{
    const result=await searchCommerceWeb('coffee machine',{maxItems:2,fetchImpl:async(url,options)=>{
      calls.push({url,options});
      return jsonResponse({results:[{title:'Coffee machine',url:'https://example.com/coffee',content:'Verified product facts',score:.91}],images:['https://cdn.example.com/coffee.jpg']});
    }});
    assert.equal(result.provider,'tavily');
    assert.equal(result.sources[0].sourceType,'tavily-search-result');
    assert.equal(result.sources[0].mediaReusable,false);
    assert.equal(result.mediaCandidates[0].type,'image');
    assert.match(result.sources[0].rightsNote,/不可自动复用/);
    assert.equal(calls[0].url,'https://api.tavily.com/search');
    const body=JSON.parse(calls[0].options.body);
    assert.equal(body.query,'coffee machine');
    assert.equal(body.include_images,true);
  }finally{if(previous===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=previous;}
});

test('Tavily extract is used for explicit public URLs',async()=>{
  const previous=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='test-only-not-a-credential';
  try{
    const result=await searchCommerceWeb('',{urls:['https://example.com/product'],fetchImpl:async(url,options)=>{
      assert.equal(url,'https://api.tavily.com/extract');
      assert.deepEqual(JSON.parse(options.body).urls,['https://example.com/product']);
      return jsonResponse({results:[{url:'https://example.com/product',title:'Product',raw_content:'Extracted facts'}]});
    }});
    assert.equal(result.sources[0].sourceType,'tavily-extract');
    assert.equal(result.sources[0].evidence,'Extracted facts');
  }finally{if(previous===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=previous;}
});

test('blocked explicit URLs are reported while the text search continues',async()=>{
  const previous=process.env.TAVILY_API_KEY;process.env.TAVILY_API_KEY='test-only-not-a-credential';
  try{
    const result=await searchCommerceWeb('coffee machine',{urls:['http://127.0.0.1/private'],fetchImpl:async(url)=>{
      assert.equal(url,'https://api.tavily.com/search');
      return jsonResponse({results:[{title:'Coffee machine',url:'https://example.com/coffee',content:'facts'}]});
    }});
    assert.equal(result.sources.length,1);
    assert.equal(result.failures[0].code,'WEB_RESEARCH_URL_BLOCKED');
  }finally{if(previous===undefined)delete process.env.TAVILY_API_KEY;else process.env.TAVILY_API_KEY=previous;}
});

test('missing Tavily credentials are reported without making a request',async()=>{
  const previous=process.env.TAVILY_API_KEY;delete process.env.TAVILY_API_KEY;let called=false;
  try{
    const result=await searchCommerceWeb('coffee machine',{fetchImpl:async()=>{called=true;return jsonResponse({});}});
    assert.equal(called,false);
    assert.equal(result.sources.length,0);
    assert.equal(result.failures[0].code,'TAVILY_NOT_CONFIGURED');
  }finally{if(previous!==undefined)process.env.TAVILY_API_KEY=previous;}
});

test('capability status never exposes the credential',()=>{
  const status=tavilyCapabilityStatus({TAVILY_API_KEY:'secret-value',TAVILY_SEARCH_DEPTH:'basic'});
  assert.equal(status.configured,true);
  assert.equal(status.searchDepth,'basic');
  assert.equal(Object.values(status).includes('secret-value'),false);
});
