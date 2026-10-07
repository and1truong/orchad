import {tool,object,string,enumeration} from "./schema.ts";
export const portalPalettes={forest:"#37574a",navy:"#253f61",ink:"#252b31"} as const;
export type PortalBranding={name:string;tagline:string;palette:keyof typeof portalPalettes};
export const defaultPortal:PortalBranding={name:"Pear",tagline:"",palette:"forest"};
export const portalSchema=object({name:string(100),tagline:string(280,0),palette:enumeration("forest","navy","ink")});
export const portalHumanTools=[
 tool("human_get_portal_branding","read",{},"Read current authenticated organization portal presentation; no identity or integration settings."),
 tool("human_save_portal_branding","write",{branding:portalSchema},"Tenant administrator saves bounded text and a fixed portal color palette. Text is rendered literally; no executable markup, arbitrary styling or external assets.")
];
