import {array,integer,string,enumeration,object,tool} from "./schema.ts";
import {questionSchema} from "./assessments.ts";
import type {Role} from "./model.ts";
export const questionBankSchema=object({title:string(160),access:enumeration("tenant","author","groups"),groupIds:array(string(64),8,1),aiProcessingAllowed:{type:"boolean"},questions:array(questionSchema,50,1)},["title","access","aiProcessingAllowed","questions"]);
export const questionBankRefSchema=object({bankId:string(64),version:integer(100,1),questionIds:array(string(64),50,1)});
export const questionBankLibraryWrites=["learning_save_question_bank","learning_retire_question_bank","learning_apply_question_bank"];
export function questionBankTools(role:Role){
 if(!["admin","content_admin"].includes(role))return [];
 return [
 tool("learning_get_question_banks","read",{offset:integer(100000),limit:integer(20,1)},"Read only visible self-authored bank metadata, immutable version IDs and question IDs. Learners/assessors receive no bank catalog.",[]),
 tool("learning_get_question_bank","read",{bankId:string(64),version:integer(100,1)},"Read one scoped immutable question bank version for authorized authoring, withholding model-prohibited content.",["bankId"]),
 tool("learning_save_question_bank","write",{bankId:string(64),bank:questionBankSchema,sourceCourseId:string(64)},"Publish a new immutable self-authored bank version. Only the original owner or administrator may update it.",["bankId","bank"]),
 tool("learning_retire_question_bank","destructive",{bankId:string(64)},"Retire a scoped bank from new draft applications; retain all existing course/attempt snapshots."),
 tool("learning_apply_question_bank","write",{courseId:string(64),source:questionBankRefSchema},"Apply up to fifty explicit questions from one pinned bank version into an authorized course draft. No official attempt or learning is changed."),
 ];
}
