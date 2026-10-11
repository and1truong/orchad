// Original ordered SCO operations shared by domain and built browser journeys.
export const interactionCollectionScript = String.raw`(function(api){
  const put=(key,value)=>{if(api.SetValue(key,value)!=='true')throw Error('Collection write refused: '+key);};
  for(let i=0;i<250;i++){
    const base='cmi.interactions.'+i;
    put(base+'.id','urn:pear:collection-interaction:'+i);
    put(base+'.type','fill-in');put(base+'.learner_response','{lang=en}Original collection response');put(base+'.type','choice');
    for(const [key,value] of Object.entries({timestamp:'2020-02-29T12:00:00Z',weighting:'1',result:'correct',latency:'PT1S',description:'Original collection interaction'}))put(base+'.'+key,value);
    for(let j=0;j<10;j++){put(base+'.objectives.'+j+'.id','urn:pear:collection-objective:'+i+':'+j);put(base+'.correct_responses.'+j+'.pattern','urn:pear:collection-choice:'+j);}
  }
  for(let i=0;i<100;i++){
    const base='cmi.objectives.'+i;
    for(const [key,value] of Object.entries({id:'urn:pear:collection-global:'+i,'score.scaled':'0.5','score.raw':'50','score.min':'0','score.max':'100',success_status:'unknown',completion_status:'incomplete',progress_measure:'0.5',description:'Original collection objective'}))put(base+'.'+key,value);
  }
  put('cmi.exit','suspend');
})(api);`;
