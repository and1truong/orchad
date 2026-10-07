import {tool,string,integer} from './schema.ts';
const address={awardEnrollmentId:string(64),criterionPath:string(768),courseId:string(64)};
const change={...address,sourceEnrollmentId:string(64),targetVersion:integer(1000000,1),expectedBindingRevision:integer(1000000),confirmed:{type:'boolean',enum:[true]}};
export const awardCourseHumanTools=[
 tool('human_get_award_course_review','read',address,'Review an exact award criterion course binding, lawful version choices, pending official work and separate coordinator offer.'),
 tool('human_requalify_award_course','write',change,'Human-reviewed fresh learning for own self-directed award; preserve prior records and copy no progress.'),
 tool('human_offer_award_course_change','write',change,'Current assignment coordinator offers one exact fresh course binding change; no official learning changes.'),
 tool('human_accept_award_course_change','write',{reviewId:string(64),targetVersion:integer(1000000,1),expectedBindingRevision:integer(1000000),confirmed:{type:'boolean',enum:[true]}},'Addressed learner separately accepts the exact offered course binding/version. Original and future cycle pins stay unchanged.'),
 tool('human_cancel_award_course_change','write',{reviewId:string(64),confirmed:{type:'boolean',enum:[true]}},'Current coordinator cancels an own pending binding review, preserving history and learning.')
];
