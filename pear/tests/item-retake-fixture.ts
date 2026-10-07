import {awardItemsFixture,trackAwardItem,confirmAwardItem} from "./award-items-fixture.ts";
import {data} from "./helpers.ts";
export function itemRetakeFixture(path=":memory:"){const f=awardItemsFixture(path),item=trackAwardItem(f);data(confirmAwardItem(f,item.itemEnrollmentId));return {...f,item};}
export const retakeItem=(f:ReturnType<typeof itemRetakeFixture>,overrides:any={})=>f.call("learner-a","human_retake_completed_item",{itemEnrollmentId:f.item.itemEnrollmentId,version:1,confirmed:true},"human",overrides);
