import {fixture,data} from "./helpers.ts";
export const originalAwardItem={title:"Original award reading",summary:"Original self-authored item proof",language:"vi",provider:"Pear Originals",license:"self-authored",aiProcessingAllowed:false,kind:"text",text:"Original learner-confirmed standalone reading."};
export function awardItemsFixture(path=":memory:",extra:any={}){
 const f=fixture(path);data(f.call("editor","learning_create_content_item",{itemId:"award-reading",item:{...originalAwardItem,...extra}}));data(f.call("editor","learning_publish_content_item",{itemId:"award-reading"}));
 const award={title:"Original standalone proof award",summary:"Original pinned reading rule",access:extra.access==="groups"?"groups":"tenant",...(extra.access==="groups"?{groupIds:extra.groupIds}:{}),unit:"credits",target:2,ongoing:false,moderatedExternal:false,requirements:[{id:"reading",title:"Original reading",required:true,credits:2,alternatives:[{kind:"item",id:"award-reading"}]}]};
 data(f.call("editor","learning_save_award",{collectionId:"item-award",award}));data(f.call("editor","learning_publish_collection",{collectionId:"item-award"}));const e=data(f.call("learner-a","learning_enroll_award",{collectionId:"item-award"}));return {...f,award,e};
}
export const trackAwardItem=(f:ReturnType<typeof awardItemsFixture>,user="learner-a",version=1)=>data(f.call(user,"learning_enroll_item",{itemId:"award-reading",version}));
export const confirmAwardItem=(f:ReturnType<typeof awardItemsFixture>,id:string,user="learner-a")=>f.call(user,"human_complete_item",{itemEnrollmentId:id,confirmed:true},"human");
export const currentItemAward=(f:ReturnType<typeof awardItemsFixture>)=>data(f.call("learner-a","learning_get_my_awards")).items.find((e:any)=>e.id===f.e.awardEnrollmentId);
