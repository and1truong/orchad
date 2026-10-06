import {tool,string,integer,enumeration} from "./schema.ts";
const source={sourceEnrollmentId:string(64)},mode=enumeration("objective_only","fresh_course");
export const assignedQuizHumanTools=[
 tool("human_cancel_assigned_quiz_review","write",{reviewId:string(64),confirmed:{type:"boolean",enum:[true]}},"Current coordinator cancels an own pending restart review without changing official learning."),
 tool("human_get_assigned_quiz_review","read",{...source,mode},"Review one own or currently managed direct assignment, objective-only retention or fresh full-course start. No cycles.",["sourceEnrollmentId"]),
 tool("human_offer_assigned_quiz_restart","write",{...source,mode,previousReviewId:{type:["string","null"],maxLength:64},targetVersion:integer(1000000,1),confirmed:{type:"boolean",enum:[true]}},"Current coordinator confirms objective-only retention or a fresh full-course offer; addressed learner must separately accept that exact mode.",["sourceEnrollmentId","targetVersion","confirmed"]),
 tool("human_accept_assigned_quiz_restart","write",{reviewId:string(64),mode,targetVersion:integer(1000000,1),confirmed:{type:"boolean",enum:[true]}},"Learner explicitly accepts a current coordinator offer. New record preserves due date/assigner; objective-only mode retains identical lessons, full-course mode carries zero progress. Old history remains.",["reviewId","targetVersion","confirmed"])
];
