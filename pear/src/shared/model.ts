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
export interface Lesson {
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
  prompts?: string[];
  matches?: number[];
  correctAnswers?: string[];
  rubric?: string;
  prompt: string;
  options: string[];
  correct: number;
}
export interface Course {
  title: string;
  summary: string;
  topic: string;
  language: "en" | "vi";
  duration: number;
  level: "beginner" | "intermediate";
  provider: string;
  aiProcessingAllowed: boolean;
  license: "self-authored";
  completionPolicy:
    | "human_attestation_and_quiz"
    | "human_attestation_review_and_quiz";
  lessons: Lesson[];
  modules?: CourseModule[];
  quiz: {
    passScore: number;
    maxAttempts: number;
    questions: Question[];
    shuffleQuestions?: boolean;
    shuffleOptions?: boolean;
    answerRelease?: "never" | "after_pass" | "after_exhausted";
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
