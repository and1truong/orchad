import {tool,string,integer,enumeration} from "./schema.ts";
export const providerTools=[
 tool("learning_search_provider_content","read",{query:string(200,0),language:enumeration("en","vi"),offset:integer(10000)},"Find bounded currently entitled provider metadata. Rights, provider license and model metadata permission are checked live; no licensed body or official progress.",[]),
 tool("learning_get_provider_item","read",{providerId:string(64),sourceId:string(64)},"Read one own currently entitled provider metadata record under model metadata permission."),
 tool("learning_get_my_provider_launches","read",{offset:integer(10000)},"Read own provider launch history, separate from official enrollment, assessment, time and certificates. Revoked metadata is withheld.",[]),
];
export const providerHumanTools=[
 tool("human_get_provider_connections","read",{},"Current tenant admin reads reviewed configured provider/client metadata; no secrets or model egress."),
 tool("human_review_provider_connection","write",{providerId:string(64),enabled:{type:"boolean"},rightsConfirmed:{type:"boolean",enum:[true]},reason:string(300)},"Current same-owner tenant admin explicitly approves/disables the configured provider client/license/metadata/launch policy. Cannot change server allowlist or license."),
 tool("human_open_provider_content","write",{providerId:string(64),sourceId:string(64),version:integer(2147483647,1),confirmed:{type:"boolean",enum:[true]}},"Human confirms creating one own 60-second provider launch record. Explicit navigation is a separate second click; no official completion."),
];
