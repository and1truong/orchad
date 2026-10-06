import {tool,string,integer} from "./schema.ts";
const source={sourceEnrollmentId:string(64)};
export const assignedQuizHumanTools=[
 tool("human_cancel_assigned_quiz_review","write",{reviewId:string(64),confirmed:{type:"boolean",enum:[true]}},"Current coordinator cancels an own pending restart review without changing official learning."),
 tool("human_get_assigned_quiz_review","read",source,"Review one own or currently managed direct assignment. No cycle or essay migration."),
 tool("human_offer_assigned_quiz_restart","write",{...source,previousReviewId:{type:["string","null"],maxLength:64},targetVersion:integer(1000000,1),confirmed:{type:"boolean",enum:[true]}},"Current assignment coordinator confirms an objective-only restart offer; learner must separately accept.",["sourceEnrollmentId","targetVersion","confirmed"]),
 tool("human_accept_assigned_quiz_restart","write",{reviewId:string(64),targetVersion:integer(1000000,1),confirmed:{type:"boolean",enum:[true]}},"Learner explicitly accepts a current coordinator offer. New record preserves due date/assigner and identical lessons; old history remains.")
];
