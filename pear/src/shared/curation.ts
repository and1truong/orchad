import {string,integer,enumeration,object,tool} from "./schema.ts";
import type {Role,Tool} from "./model.ts";
const target={kind:enumeration("course","item"),contentId:string(64)};
export const curationLibraryWrites=["learning_save_curation","learning_retire_with_replacement"];
export function curationTools(role:Role):Tool[]{
 return [
  tool("learning_get_curated_content","read",{offset:integer(100000),limit:integer(20,1)},
   "Read tenant-authorized published endorsed, featured and spotlight metadata with explicit curation reasons; no learner/body data.",[]),
  tool("learning_get_retirement_alternative","read",target,
   "Read an explicit currently available replacement for retired content. Existing learning versions never change."),
  ...(["admin","content_admin"].includes(role)?[
   tool("learning_get_curation","read",target,"Read tenant content curation and lifecycle metadata."),
   tool("learning_save_curation","write",{...target,policy:object({
    endorsed:{type:"boolean"},featured:{type:"boolean"},spotlight:{type:"boolean"},retiring:{type:"boolean"}
   }),reason:string(600)},"Set explicit organization promotions or mark published content retiring; does not change enrollments."),
   tool("learning_preview_retirement","read",{...target,replacementId:string(64)},
    "Review aggregate pinned-version enrollment, course/collection dependency and assignment-plan impact. Returns a hash for this exact replacement."),
   tool("learning_retire_with_replacement","destructive",{...target,replacementId:string(64),previewHash:string(64),reason:string(600)},
    "Retire new discovery/enrollment and link an available explicit replacement after unchanged impact review; preserve all existing pinned learning.")
  ]:[])
 ];
}
