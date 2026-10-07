import {tool,integer} from "./schema.ts";
export const externalActivityTools=[tool("learning_get_external_activity","read",{offset:integer(100000),limit:integer(20,1)},"Read own minimal external provider-reported activity projection. External reported completion/success/score/duration are separate from Pear official learning, observed timers and award credit.",[])];
