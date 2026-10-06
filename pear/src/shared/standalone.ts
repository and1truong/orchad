import { tool, string, integer } from "./schema.ts";
export const standaloneTools = [
  tool(
    "learning_enroll_item",
    "write",
    { itemId: string(64), version: integer(100000, 1) },
    "Track one visible immutable standalone version. Does not complete a course or grant a certificate.",
    ["itemId"],
  ),
  tool(
    "learning_get_my_items",
    "read",
    { offset: integer(100000), limit: integer(20, 1) },
    "Read own pinned standalone learning ledger. Completed status is learner-confirmed reading, never an assessment score.",
    [],
  ),
  tool(
    "learning_get_item_enrollment",
    "read",
    { itemEnrollmentId: string(128) },
    "Read own pinned standalone version, preserving retirement history and model processing permission.",
  ),
];
export const standaloneHumanTools = [
  tool("human_retake_completed_item","write",{itemEnrollmentId:string(128),version:integer(100000,1),confirmed:{type:"boolean",enum:[true]}},"Human explicitly starts a fresh reading record for this exact completed pinned version. No copied completion, timer or automatic award proof; original history remains.",["itemEnrollmentId","version","confirmed"]),
  tool(
    "human_complete_item",
    "write",
    {
      itemEnrollmentId: string(128),
      confirmed: { type: "boolean", enum: [true] },
    },
    "Learner explicitly confirms studying a tracked standalone item. No quiz score or course certificate is created; configured awards may derive credit from this real human-confirmed reading.",
  ),
];
