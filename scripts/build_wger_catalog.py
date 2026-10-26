"""Build a public, paged wger snapshot; never reads personal exercise/history storage."""
import argparse,hashlib,html,json,re
from datetime import datetime,timezone
from pathlib import Path
CATEGORIES={'Abs':'core','Arms':'arms','Back':'back','Calves':'legs','Chest':'chest','Legs':'legs','Shoulders':'shoulders','Cardio':'cardio'}
EQUIPMENT={'none (bodyweight exercise)':'自重','Barbell':'杠铃','Dumbbell':'哑铃','Bench':'训练凳','Incline bench':'上斜训练凳','Kettlebell':'壶铃','Cable machine':'绳索器械','Pull-up bar':'单杠','Bodyweight':'自重','Gym mat':'垫子','Swiss Ball':'健身球','SZ-Bar':'曲杆','Resistance band':'弹力带'}
def text(value,limit=12000):
    source=re.sub(r'<(script|style|iframe)[^>]*>.*?</\1>','',str(value or ''),flags=re.I|re.S)
    return ' '.join(html.unescape(re.sub('<[^>]+>',' ',source)).split())[:limit]
def build(raw,translations,output,licenses):
    assert raw.get('next') is None and len(raw['results'])==raw['count'],'Incomplete source page'
    licenses={x['id']:x for x in licenses['results']}
    def license_of(value,author=''):
        value=value if isinstance(value,dict) else licenses.get(value,{})
        return {**{k:value.get(k,'') for k in ['id','short_name','full_name','url']},'author':text(author,240)}
    index=[];details=[]
    for e in sorted(raw['results'],key=lambda e:next(t['name'] for t in e['translations'] if t['language']==2).casefold()):
        ts={t['language']:t for t in e['translations']};en=ts[2];zh=ts.get(24)
        translated=translations[str(e['id'])]
        uuid=e['uuid'].lower();assert re.fullmatch('[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}',uuid)
        ident='wger_'+uuid.replace('-','')
        aliases=[text(a['alias'],160) for t in [en,zh] if t for a in t.get('aliases',[]) if a.get('alias')]
        name=en['name'].lower()
        if 'kickback' in name and not 'glute' in name:aliases+=['俯身哑铃臂屈伸','俯身臂屈伸','哑铃后踢']
        if 'shoulder' in name and 'press' in name:aliases+=['推肩','肩推']
        if 'chest' in name and 'press' in name or 'bench press' in name:aliases+=['推胸','卧推']
        category=CATEGORIES.get(e['category']['name'],'other')
        aliases+= [{'core':'核心','arms':'手臂','back':'背部','legs':'腿部','chest':'胸部','shoulders':'肩部','cardio':'有氧','other':'其他'}[category]]
        row={'id':ident,'uuid':uuid,'wgerId':e['id'],'en':text(en['name'],200),'zh':text(translated['zh'],200),
             'zhSource':translated['source'],'category':category,'equipment':' · '.join(EQUIPMENT.get(v['name'],v['name']) for v in e['equipment']),
             'aliases':sorted(set(aliases))}
        index.append(row)
        details.append({'id':ident,'wgerId':e['id'],'descriptionEn':text(en.get('description')),'descriptionZh':text(zh.get('description')) if zh else '',
            'author':text(en.get('license_author') or e.get('license_author'),240),'license':license_of(e.get('license'),e.get('license_author')),
            'translationLicenseEn':license_of(en.get('license'),en.get('license_author')),
            'translationLicenseZh':license_of(zh.get('license'),zh.get('license_author')) if zh else {},
            'sourceUrl':f"https://wger.de/en/exercise/{e['id']}",
            'sourceUpdatedAt':e.get('last_update_global') or e.get('last_update'),
            'nameZhSource':translated['source'],'nameZhModel':translated.get('model','')})
    output.mkdir(parents=True,exist_ok=True);(output/'details').mkdir(exist_ok=True)
    for i in range(0,len(details),32):
        chunk=json.dumps({'schemaVersion':'body.os.wger-details.v1','items':details[i:i+32]},ensure_ascii=False,separators=(',',':')).encode()
        filename=hashlib.sha256(chunk).hexdigest()[:16]+f'-{i//32:03}.json'
        (output/'details'/filename).write_bytes(chunk)
        for row in index[i:i+32]:row['detailFile']=filename
    result={'schemaVersion':'body.os.wger-index.v1','generatedAt':datetime.now(timezone.utc).isoformat(),
      'source':'https://wger.de/api/v2/exerciseinfo/','sourceSha256':hashlib.sha256(json.dumps(raw,sort_keys=True).encode()).hexdigest(),
      'count':len(index),'officialChineseCount':sum(x['zhSource']=='wger' for x in index),'items':index}
    (output/'index.json').write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')))
    (output/'NOTICE.txt').write_text('Public wger exercise snapshot. Source: https://wger.de/api/v2/exerciseinfo/\nNames and descriptions retain per-record source licenses and authors in details/*.json.\nChinese names marked search_translation are auxiliary search translations, not official wger translations or training advice.\nMedia files are not downloaded or preloaded.\n')
    print(json.dumps({'count':len(index),'officialChinese':result['officialChineseCount'],'indexBytes':(output/'index.json').stat().st_size,'detailChunks':(len(details)+31)//32}))
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--raw',type=Path,required=True);p.add_argument('--translations',type=Path,required=True);p.add_argument('--licenses',type=Path,required=True);p.add_argument('--output',type=Path,default=Path(__file__).resolve().parents[1]/'catalog');a=p.parse_args()
    build(json.loads(a.raw.read_text()),json.loads(a.translations.read_text()),a.output,json.loads(a.licenses.read_text()))
