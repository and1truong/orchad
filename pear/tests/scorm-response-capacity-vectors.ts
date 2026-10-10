// Original RTE4.2.9.1 capacity vectors: ten choice patterns of 36 long IDs,
// five performance patterns of125 records, each with250 scalar answers.
export function responseCapacityVector(type: 'choice' | 'performance') {
  const patterns=Array.from({length:type==='choice'?10:5},(_,pattern)=>Array.from({length:type==='choice'?36:125},(_,row)=>{
    const id=('p'+pattern+'r'+row+'-').padEnd(type==='choice'?4000:250,'a');
    return type==='choice'?id:id+'[.]'+'🙂'.repeat(250);
  }).join('[,]'));
  return {type,patterns,learner:patterns[0]!,suspend:'🙂'.repeat(64000)};
}
