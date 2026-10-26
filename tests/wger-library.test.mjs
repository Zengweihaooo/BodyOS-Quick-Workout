import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { WgerLibrary, validateWgerCatalog, searchWgerCatalog } from "../wger-library.js";
import { FALLBACK_EXERCISES, mergeExerciseCatalog, mergeOwnerExerciseCatalog, resolveCatalogExerciseId, historyExerciseMatches, draftFromExerciseDefault, buildBodyCandidate, createSession } from "../core.js";
const root=new URL("../catalog/",import.meta.url);
const index=JSON.parse(await readFile(new URL("index.json",root),"utf8"));
test("all source entries retain bilingual names and source-bound chunk identities",async()=>{
  validateWgerCatalog(index);
  assert.equal(index.count,932); assert.equal(index.officialChineseCount,48);
  assert.ok(Buffer.byteLength(JSON.stringify(index))<400000);
  assert.equal(new Set(index.items.map(x=>x.id)).size,index.count);
  const files=new Set(index.items.map(x=>x.detailFile)); assert.equal(files.size,30);
  const coverage=new Set();
  for(const file of files){
    const bytes=await readFile(new URL("details/"+file,root));
    assert.ok(file.startsWith(createHash("sha256").update(bytes).digest("hex").slice(0,16)));
    const chunk=JSON.parse(bytes);
    assert.ok(chunk.items.length<=32);
    for(const detail of chunk.items){coverage.add(detail.id);assert.ok(detail.license.short_name);assert.ok(!/<script|<iframe/i.test(detail.descriptionEn));}
  }
  assert.equal(coverage.size,index.count);
  assert.ok(index.items.every(x=>coverage.has(x.id)&&/[\u4e00-\u9fff]/.test(x.zh)));
});
test("English and Chinese find ordinary missing movements and paginate without losing entries",()=>{
  for(const query of ["bench","bench pr","kickback","肩推","器械推肩","哑铃","Nordic","深蹲","卧推","Lat Pulldown"]){
    const result=searchWgerCatalog(index.items,query);assert.ok(result.total>0,query);assert.ok(result.items.length<=24);
  }
  const seen=new Set();let offset=0;
  do{const page=searchWgerCatalog(index.items,"",{offset});for(const row of page.items){assert.ok(!seen.has(row.id));seen.add(row.id);}offset=page.nextOffset;}while(offset!=null);
  assert.equal(seen.size,index.count);
});
test("index and details fetch only on demand and failures can be retried",async()=>{
  const calls=[];let fail=true;
  const library=new WgerLibrary(async url=>{
    calls.push(url);
    if(fail){fail=false;return{ok:false};}
    const file=url.replace("./catalog/","").split("?")[0];
    return{ok:true,json:async()=>JSON.parse(await readFile(new URL(file,root),"utf8"))};
  });
  assert.deepEqual(calls,[]);
  await assert.rejects(()=>library.load());
  await Promise.all([library.load(),library.load()]);
  assert.equal(calls.length,2);
  const item=await library.select(index.items[0].id);
  assert.equal(calls.length,3);await library.select(item.id);assert.equal(calls.length,3);
  assert.equal(item.isWger,true);assert.equal(item.provider,"wger");assert.ok(item.reference.wger.license.short_name);
});
test("selected wger and photo custom items persist without replacing old catalog or history identities",async()=>{
  const library=new WgerLibrary(async url=>({ok:true,json:async()=>JSON.parse(await readFile(new URL(url.replace("./catalog/","").split("?")[0],root),"utf8"))}));
  const external=await library.select(index.items.find(x=>/dumbbell.*kickback/i.test(x.en)).id);
  const custom={id:"custom_fixture",isCustom:true,name:"自定义",photos:["data:image/jpeg;base64,/9j/2Q=="]};
  const before=JSON.stringify(FALLBACK_EXERCISES);
  const catalog=mergeExerciseCatalog(FALLBACK_EXERCISES,JSON.parse(JSON.stringify([external,custom])));
  assert.equal(JSON.stringify(FALLBACK_EXERCISES),before);
  assert.equal(catalog.find(x=>x.id===external.id).isWger,true);
  assert.deepEqual(catalog.find(x=>x.id===custom.id).photos,custom.photos);
  const wgerRecord={exerciseId:external.id,name:"哑铃平板推胸"};
  assert.equal(resolveCatalogExerciseId(wgerRecord),external.id);
  assert.equal(historyExerciseMatches(wgerRecord,"dumbbell_flat_chest_press"),false);
  assert.equal(historyExerciseMatches(wgerRecord,external.id),true);
  const session=createSession();session.sets=[{...draftFromExerciseDefault(external),completedAt:"2020-01-01T12:00:00Z"}];
  assert.equal(buildBodyCandidate(session).exercises[0].exerciseCanonicalId,external.id);
});
test("untrusted indexes cannot provide arbitrary files or overwrite custom identities",()=>{
  assert.throws(()=>validateWgerCatalog({...index,items:[...index.items,index.items[0]],count:index.count+1}));
  assert.throws(()=>validateWgerCatalog({...index,items:[{...index.items[0],detailFile:"../../private"}],count:1}));
  assert.throws(()=>validateWgerCatalog({...index,items:[{...index.items[0],id:"custom_fixture"}],count:1}));
});

test("an owning-server library refresh cannot erase private custom photos or selected source metadata",()=>{
  const local={id:"custom_local",name:"我的器材",isCustom:true,photos:["data:image/jpeg;base64,/9j/2Q=="]};
  const remote=[{id:local.id,name:"服务器动作名"},{id:"machine_chest_press",name:"器械推胸"}];
  const before=JSON.stringify([remote,FALLBACK_EXERCISES,local]);
  const merged=mergeOwnerExerciseCatalog(remote,FALLBACK_EXERCISES,[local]);
  assert.deepEqual(merged.find(x=>x.id===local.id).photos,local.photos);
  assert.equal(merged.find(x=>x.id===local.id).isCustom,true);
  assert.equal(merged.filter(x=>x.id==="machine_chest_press").length,1);
  assert.equal(JSON.stringify([remote,FALLBACK_EXERCISES,local]),before);
});

test("row search does not treat the letters inside narrow as a rowing movement",()=>{
  const items=[{id:"narrow",en:"Narrow Grip Bench Press",zh:"窄握卧推",aliases:[]},{id:"row",en:"Barbell Row",zh:"杠铃划船",aliases:[]}];
  assert.deepEqual(searchWgerCatalog(items,"划船").items.map(x=>x.id),["row"]);
  assert.deepEqual(searchWgerCatalog(items,"bench pr").items.map(x=>x.id),["narrow"]);
});

test("selected cached wger items use the same bilingual matcher as source rows",()=>{
  const cached={id:"wger_"+"a".repeat(32),isWger:true,name:"器械肩推",canonicalNameEn:"Shoulder Press, on Machine",aliases:[]};
  assert.equal(searchWgerCatalog([cached],"器械推肩").total,1);
  assert.equal(searchWgerCatalog([cached],"shoulder press").total,1);
});
