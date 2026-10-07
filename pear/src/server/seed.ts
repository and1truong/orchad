import type { Course } from "../shared/model.ts";
// All fixture material is authored for this repository. No external content/catalog.
export const courses: Record<string, Course> = {
  "systems-basics": {
    title: "Reliable systems basics",
    summary:
      "Understand retry amplification, bounded concurrency and safe recovery.",
    topic: "Distributed systems",
    language: "en",
    duration: 20,
    level: "beginner",
    provider: "Pear Originals",
    license: "self-authored",
    aiProcessingAllowed: true,
    completionPolicy: "human_attestation_and_quiz",
    lessons: [
      {
        id: "retry",
        title: "Retries need a budget",
        kind: "text",
        text: "A retry can help a transient failure. During overload, many retries multiply work and deepen the outage. Bound retry attempts, add jitter, and use an overall deadline. A retry is safe only when its operation is idempotent or the original outcome is reconciled.",
        prerequisiteIds: [],
      },
      {
        id: "capacity",
        title: "Protect capacity",
        kind: "text",
        text: "Bound the number of concurrent requests admitted to a service. Reject excess work early, before expensive processing. Observe queue latency and saturation. Cancellation does not prove a backend write was rolled back; reconcile the operation key before retrying.",
        prerequisiteIds: ["retry"],
      },
    ],
    quiz: {
      passScore: 100,
      maxAttempts: 2,
      questions: [
        {
          id: "q-retry",
          prompt: "What prevents retries from amplifying overload?",
          options: [
            "Unlimited immediate retries",
            "A retry budget, jitter and deadline",
            "A larger queue only",
          ],
          correct: 1,
        },
        {
          id: "q-write",
          prompt: "A write times out. What should happen before retrying?",
          options: [
            "Assume rollback",
            "Generate a new operation key",
            "Reconcile the original operation key",
          ],
          correct: 2,
        },
      ],
    },
  },
  "learning-vi": {
    title: "Học tập có chủ đích",
    summary: "Chia nhỏ mục tiêu, luyện nhớ và kiểm tra hiểu biết.",
    topic: "Learning skills",
    language: "vi",
    duration: 10,
    level: "beginner",
    provider: "Pear Originals",
    license: "self-authored",
    aiProcessingAllowed: true,
    completionPolicy: "human_attestation_and_quiz",
    lessons: [
      {
        id: "practice",
        title: "Luyện nhớ chủ động",
        kind: "text",
        text: "Sau khi đọc, hãy đóng tài liệu và tự giải thích bằng lời của mình. Kiểm tra lại chỗ chưa chắc chắn. Lặp lại sau một khoảng thời gian giúp củng cố trí nhớ. Điểm luyện tập của trợ lý không thay thế kết quả bài kiểm tra chính thức.",
        prerequisiteIds: [],
      },
    ],
    quiz: {
      passScore: 100,
      maxAttempts: 3,
      questions: [
        {
          id: "q-practice",
          prompt: "Cách nào giúp kiểm tra mình đã hiểu?",
          options: [
            "Chỉ đọc lại",
            "Tự giải thích rồi đối chiếu",
            "Chỉ xem điểm trợ lý",
          ],
          correct: 1,
        },
      ],
    },
  },
  "privacy-basics": {
    title: "Data sharing essentials",
    summary: "Decide which learning data may leave a trusted application.",
    topic: "Security",
    language: "en",
    duration: 15,
    level: "beginner",
    provider: "Pear Originals",
    license: "self-authored",
    aiProcessingAllowed: false,
    completionPolicy: "human_attestation_and_quiz",
    lessons: [
      {
        id: "privacy",
        title: "Consent and permitted use",
        kind: "text",
        text: "Data may be licensed for human reading without permission for model processing. A model recommendation does not grant access. Keep private assessment answers and credentials out of model context, and respect the license of the original learning material.",
        prerequisiteIds: [],
      },
    ],
    quiz: {
      passScore: 100,
      maxAttempts: 2,
      questions: [
        {
          id: "q-license",
          prompt:
            "Does assistant consent override content license restrictions?",
          options: ["Yes", "No"],
          correct: 1,
        },
      ],
    },
  },
};
