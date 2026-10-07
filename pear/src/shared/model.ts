import type { DiscoveryMetadata } from "./discovery.ts";
import type { EventSession } from "./blended.ts";
import type {
  Context,
  Description,
  Result,
  Tool,
} from "@orchard/bridge-contract";
export type { Context, Description, Result, Tool };
// Canonical contract permits null for read envelopes (shared helper Call is mutation-only).
export interface Call {
  requestId: string;
  documentId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  expectedRevision: number | null;
  idempotencyKey: string | null;
}
export const appId = "orchard-pear";
export type Role =
  | "learner"
  | "manager"
  | "content_admin"
  | "admin"
  | "assessor";
export interface Principal {
  id: string;
  tenant: string;
  name: string;
  role: Role;
  manager_id: string | null;
  active: number;
  auth_version: number;
}
export interface CaptionTrack { assetId:string; language:"en"|"vi"; label:string; }
export interface Lesson {
  captions?: CaptionTrack[];
  id: string;
  title: string;
  text: string;
  kind:
    | "text"
    | "video"
    | "link"
    | "audio"
    | "document"
    | "interactive"
    | "submission"
    | "event";
  assetId?: string;
  url?: string;
  transcript?: string;
  submission?: { rubric: string; maxAttempts: number; passScore: number };
  sessions?: EventSession[];
  prerequisiteIds: string[];
  contentRef?: { itemId: string; version: number };
}
export interface ContentItem {
  access?: "tenant" | "author" | "groups";
  groupIds?: string[];
  captions?: CaptionTrack[];
  discovery?: DiscoveryMetadata;
  title: string;
  summary: string;
  language: "en" | "vi";
  provider: string;
  license: "self-authored";
  aiProcessingAllowed: boolean;
  kind: Lesson["kind"];
  assetId?: string;
  text: string;
  url?: string;
  transcript?: string;
}
export interface CourseModule {
  id: string;
  title: string;
  lessonIds: string[];
  prerequisiteIds: string[];
}
export interface Question {
  id: string;
  kind?: "mcq" | "matching" | "blanks" | "long_answer";
  points?: number;
  title?: string;
  promptFormat?: "plain" | "original_markup";
  correctIndices?: number[];
  partialCredit?: boolean;
  feedbackSelected?: string[];
  feedbackNotSelected?: string[];
  blankChoiceOptions?: string[];
  blankChoiceCounts?: number[];
  passRate?: number;
  prompts?: string[];
  matches?: number[];
  correctAnswers?: string[];
  rubric?: string;
  prompt: string;
  options: string[];
  correct: number;
}
export interface Course {
  access?: "tenant" | "author" | "groups";
  groupIds?: string[];
  discovery?: DiscoveryMetadata;
  title: string;
  summary: string;
  topic: string;
  language: "en" | "vi";
  duration: number;
  level: "beginner" | "intermediate" | "advanced";
  provider: string;
  aiProcessingAllowed: boolean;
  license: "self-authored";
  completionPolicy:
    | "human_attestation_and_quiz"
    | "human_attestation_review_and_quiz";
  lessons: Lesson[];
  modules?: CourseModule[];
  quiz: {
    questionBankRef?:{bankId:string;version:number;questionIds:string[]};
    passScore: number;
    maxAttempts: number;
    unlimitedAttempts?: boolean;
    passMessage?: string;
    failMessage?: string;
    questions: Question[];
    showPreviousResponses?: boolean;
    retryIncorrectOnly?: boolean;
    requireCorrectToContinue?: boolean;
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    answerRelease?: "never" | "after_pass" | "after_exhausted" | "after_submission" | "after_question";
  };
}
export interface Bridge {
  describe(): Promise<Description>;
  getContext(): Promise<Context>;
  invoke(call: Call): Promise<Result>;
}
declare global {
  interface Window {
    agentBridgeV1?: Bridge;
  }
}
