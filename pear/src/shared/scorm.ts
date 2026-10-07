import {tool,integer} from "./schema.ts";
export const packageTools=[
 tool("learning_search_packages","read",{offset:integer(100000),limit:integer(20,1)},"Read authorized reviewed/published self-authored inline SCORM package metadata. No raw archive, executable body, launch ticket or learner tracking state.",[]),
 tool("learning_get_my_package_records","read",{offset:integer(100000),limit:integer(20,1)},"Read own minimal package-reported status/score/time metadata, separate from official learning. Suspend data/location/runtime secrets withheld.",[])
];
