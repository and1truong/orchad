import {tool,string,integer,enumeration} from "./schema.ts";
export const retakeHumanTools=[
 tool("human_get_latest_quiz_options","read",{enrollmentId:string(64)},"Review explicit objective quiz-only upgrade of own unfinished self-directed course; no existing answers or history changed."),
 tool("human_restart_latest_quiz","write",{enrollmentId:string(64),targetVersion:integer(1000000,1),confirmed:{type:"boolean",enum:[true]}},"Create immutable latest objective-quiz successor after explicit human confirmation, preserving identical lessons and withdrawn prior attempt history."),
 tool("human_get_course_retake_options","read",{enrollmentId:string(64)},"Review own completed-course version choices without changing prior learning."),
 tool("human_retake_completed_course","write",{enrollmentId:string(64),mode:enumeration("enrolled","latest"),targetVersion:integer(1000000,1),confirmed:{type:"boolean",enum:[true]}},"Create a fresh self-directed enrollment after explicit human version choice; keep original completion, attempts and certificates.")
];
