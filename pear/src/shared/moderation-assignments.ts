import {tool,string,integer} from "./schema.ts";
export const primaryModerationHumanTools=[
 tool("human_assign_external_assessor","write",{recordId:string(128),assessorId:string(64),expectedVersion:integer(100),reason:string(300)},"Tenant administrator assigns/reassigns one pending original external record to an already delegated active same-tenant assessor. Does not grade or grant rights."),
 tool("human_get_assessment_notices","read",{offset:integer(100000),limit:integer(20,1)},"Read own in-app assignment/removal facts; no private learner evidence or external delivery.",[]),
 tool("human_read_assessment_notice","write",{noticeId:string(128)},"Acknowledge own in-app assignment notice without assessing evidence.")
];
