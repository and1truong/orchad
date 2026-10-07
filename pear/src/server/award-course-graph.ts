import type {DatabaseSync} from 'node:sqlite';
import {reject} from './errors.ts';
export function awardCourseReferences(db:DatabaseSync,award:any){
 const result:{criterionPath:string;courseId:string;version:number;ancestors:{id:string;version:number}[]}[]=[];
 let nodes=0;
 const walk=(id:string,version:number,prefix='',depth=1,ancestors:{id:string;version:number}[]=[])=>{
  if(depth>4||++nodes>32)reject('INTERNAL','Stored award graph violates bounds');
  const row=db.prepare('SELECT content FROM collection_versions WHERE collection_id=? AND version=?').get(id,version) as any;
  if(!row)reject('NOT_FOUND','Collection version unavailable');
  for(const r of JSON.parse(row.content).requirements){
   const path=prefix+r.id;
   for(const ref of r.alternatives){
    if(ref.kind==='course')result.push({criterionPath:path,courseId:ref.id,version:ref.version,ancestors});
    if(ref.kind==='award')walk(ref.id,ref.version,`${path}/${ref.id}@${ref.version}/`,depth+1,[...ancestors,{id:ref.id,version:ref.version}]);
   }
  }
 };
 walk(award.award_id,award.version);
 return result;
}
