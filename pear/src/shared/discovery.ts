import {string,integer,array,enumeration,object,tool} from "./schema.ts";
export const accessibilityFeatures=["captions","transcript","keyboard","screen_reader"] as const;
export interface DiscoveryMetadata {
 skills:string[];industries:string[];outcomes:string[];
 accessibility:{features:(typeof accessibilityFeatures)[number][];provenance:"author_declared"};
}
export const discoveryMetadataSchema=object({
 skills:array(string(80),8),industries:array(string(80),8),outcomes:array(string(300),8),
 accessibility:object({features:array(enumeration(...accessibilityFeatures),4),provenance:enumeration("author_declared")})
});
export const discoveryFilters={
 query:string(160,0),queryMode:enumeration("keyword","concepts"),topic:string(80),
 language:enumeration("en","vi"),level:enumeration("beginner","intermediate","advanced"),provider:string(100),
 minDuration:integer(600,1),maxDuration:integer(600,1),skills:array(string(80),8),industry:string(80),
 format:enumeration("text","video","link","audio","document","interactive","submission","event"),
 accessibility:array(enumeration(...accessibilityFeatures),4),ratingAtLeast:integer(5,1),
 publishedSince:string(10),promotion:enumeration("endorsed","featured","spotlight"),
 aiProcessingAllowed:{type:"boolean"},sort:enumeration("relevance","title","duration","rating","published"),
 descending:{type:"boolean"},offset:integer(100000),limit:integer(20,1)
};
export const discoveryTools=[
 tool("learning_compare_courses","read",{courseIds:array(string(64),4,2)},
  "Compare 2–4 distinct permitted published course metadata snapshots, declared outcomes/accessibility, ratings and intended duration. No lesson bodies or answer keys."),
 tool("learning_get_recommendations","read",{offset:integer(100000),limit:integer(10,1)},
  "Rank permitted not-yet-enrolled courses using own declared interests/language and organization curation. Source IDs and rule-based reasons; no inferred skills or completion.",[])
];
export const normalize=(s:string)=>s.trim().normalize("NFKD").replace(/\p{M}/gu,"").toLowerCase().replaceAll("đ","d");
const concepts=[
 {id:"retries",terms:["retry","retries","backoff","retry storm","try again","thu lai"]},
 {id:"idempotency",terms:["idempotency","idempotent","lost response","same work twice","duplicate operation","mat phan hoi","trung lap"]},
 {id:"capacity",terms:["concurrency","capacity","overload","too many requests","gioi han dong thoi","qua tai"]},
 {id:"practice",terms:["practice","retrieval","learning","remember","retain knowledge","luyen tap","ghi nho","hoc tap"]},
 {id:"security",terms:["security","phishing","credential","password","suspicious email","bao mat","mat khau","email dang ngo"]}
];
export function relevance(query:string,metadata:string,mode="keyword"){
 const q=normalize(query).trim(),text=normalize(metadata);
 if(!q)return {score:0,concepts:[] as string[]};
 if(mode==="keyword")return {score:text.includes(q)?100:0,concepts:[] as string[]};
 const matched=concepts.filter(c=>c.terms.some(t=>q.includes(t))&&c.terms.some(t=>text.includes(t))).map(c=>c.id);
 const words=q.match(/[a-z0-9]+/g)??[];
 const lexical=words.filter(w=>w.length>3&&text.includes(w)).length;
 return {score:(text.includes(q)?100:0)+matched.length*20+lexical,concepts:matched};
}
