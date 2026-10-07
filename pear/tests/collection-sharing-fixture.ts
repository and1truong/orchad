import {fixture,data} from "./helpers.ts";
import {courses} from "../src/server/seed.ts";
import {scryptSync} from "node:crypto";
export function shareFixture(path=":memory:"){
 const f=fixture(path),salt="11223344556677889900112233445566";
 for(const id of ["receiver","receiver-two"]){f.db.prepare("INSERT OR IGNORE INTO accounts(id,tenant,name,role,password_hash,salt) VALUES(?,'other',?,'admin',?,?)").run(id,id,scryptSync(id+"-dev",salt,64).toString("hex"),salt);f.db.prepare("INSERT OR IGNORE INTO workspaces(id,tenant,owner) VALUES(?,'other',?)").run("learning:other:"+id,id);}
 f.db.prepare("INSERT OR IGNORE INTO workspaces(id,tenant) VALUES('library:other','other')").run();
 const course={...structuredClone(courses["learning-vi"]),title:"Original source practice",language:"en"};
 for(const [user,id,title]of [["admin","share-source-course","Original source practice"],["receiver","share-local-course","Original receiver practice"]]){data(f.call(user!,"learning_create_course",{courseId:id,course:{...course,title}}));data(f.call(user!,"learning_publish_course",{courseId:id}));}
 const award={title:"Original shared configuration <img src=x>",summary:"Original structure only",access:"author",unit:"credits",target:2,ongoing:false,moderatedExternal:true,primaryModeration:true,requirements:[{id:"practice",title:"Original criterion",required:true,credits:2,alternatives:[{kind:"course",id:"share-source-course"}]}]};
 data(f.call("admin","learning_save_award",{collectionId:"share-source-award",award}));data(f.call("admin","learning_publish_collection",{collectionId:"share-source-award"}));
 return {...f,award};
}
export const offerArgs={collectionId:"share-source-award",sourceVersion:1,destinationTenant:"other",destinationAdminId:"receiver",destinationCollectionId:"share-receiver-award",confirmed:true};
export const references=[{kind:"course",sourceId:"share-source-course",destinationId:"share-local-course",version:1}];
