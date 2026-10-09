// Original ordered SCO operations shared by domain and built browser journeys.
const collectionScript = (patternOrigins:boolean) => String.raw`(function(api){
  const put=(key,value)=>{if(api.SetValue(key,value)!=='true')throw Error('Collection write refused: '+key);};
  for(let i=0;i<250;i++){
    const base='cmi.interactions.'+i;
    put(base+'.id','urn:pear:collection-interaction:'+i);
    put(base+'.type','fill-in');put(base+'.learner_response','{lang=en}Original collection response');${patternOrigins?'':"put(base+'.type','choice');"}
    for(const [key,value] of Object.entries({timestamp:'2020-02-29T12:00:00Z',weighting:'1',result:'correct',latency:'PT1S',description:'Original collection interaction'}))put(base+'.'+key,value);
    for(let j=0;j<10;j++){put(base+'.objectives.'+j+'.id','urn:pear:collection-objective:'+i+':'+j);put(base+'.correct_responses.'+j+'.pattern',${patternOrigins?"'{lang=en}Original collection pattern '":"'urn:pear:collection-choice:'"}+j);}
  }
  ${patternOrigins?"for(let i=0;i<250;i++)put(\'cmi.interactions.\'+i+\'.type\',\'choice\');":""}
  for(let i=0;i<100;i++){
    const base='cmi.objectives.'+i;
    for(const [key,value] of Object.entries({id:'urn:pear:collection-global:'+i,'score.scaled':'0.5','score.raw':'50','score.min':'0','score.max':'100',success_status:'unknown',completion_status:'incomplete',progress_measure:'0.5',description:'Original collection objective'}))put(base+'.'+key,value);
  }
  put('cmi.exit','suspend');
})(api);`;

export const interactionCollectionScript=collectionScript(false);
export const interactionPatternOriginsScript=collectionScript(true);
export const interactionInterleavedOriginsScript=interactionPatternOriginsScript.replace("  put('cmi.exit','suspend');",String.raw`
  let writes=0;for(let n=0;n<5000;n++)for(let i=0;i<2;i++){put('cmi.interactions.'+i+'.type',n%2?'choice':'sequencing');writes++;}
  put('cmi.exit','suspend');
  return {writes,records:2,preserved:[0,1].every(i=>api.GetValue('cmi.interactions.'+i+'.type')==='choice'&&api.GetLastError()==='0')};`);
