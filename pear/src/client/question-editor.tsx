import React from "react";
import type { Question } from "../shared/model.ts";
type Props = { q: Question; update: (next: Question) => void };
export function QuestionSettings({ q, update }: Props) {
  return (
    <>
      <label>
        Question type
        <select
          aria-label="Question type"
          value={q.kind ?? "mcq"}
          onChange={(e) => {
            const kind = e.target.value as Question["kind"];
            const common = {
              id: q.id,
              prompt: q.prompt,
              points: q.points ?? 1,
              kind,
              correct: 0,
            };
            update(
              kind === "mcq"
                ? { ...common, options: ["", ""] }
                : kind === "matching"
                  ? {
                      ...common,
                      options: ["First meaning", "Second meaning"],
                      prompts: ["First term", "Second term"],
                      matches: [0, 1],
                    }
                  : kind === "blanks"
                    ? {
                        ...common,
                        options: [],
                        prompts: ["Word"],
                        correctAnswers: [""],
                      }
                    : { ...common, options: [], rubric: "" },
            );
          }}
        >
          <option value="mcq">Multiple choice</option>
          <option value="matching">Matching</option>
          <option value="blanks">Fill blanks</option>
          <option value="long_answer">Long answer · human assessed</option>
        </select>
      </label>
      <label>
        Question points
        <input
          aria-label="Question points"
          type="number"
          min={1}
          max={20}
          value={q.points ?? 1}
          onChange={(e) => update({ ...q, points: Number(e.target.value) })}
        />
      </label>
    </>
  );
}
export function ExtendedQuestion({ q, update }: Props) {
  const k = q.kind;
  if (k === "long_answer")
    return (
      <label>
        Assessment rubric
        <textarea
          aria-label="Assessment rubric"
          required
          maxLength={600}
          value={q.rubric ?? ""}
          onChange={(e) => update({ ...q, rubric: e.target.value })}
        />
      </label>
    );
  const prompts = q.prompts ?? [],
    answers =
      k === "matching"
        ? prompts.map((_, i) => q.options[q.matches![i]])
        : (q.correctAnswers ?? []);
  const rebuild = (ps: string[], as: string[]) =>
    update(
      k === "matching"
        ? { ...q, prompts: ps, options: as, matches: ps.map((_, i) => i) }
        : { ...q, prompts: ps, correctAnswers: as },
    );
  return (
    <>
      {prompts.map((prompt, i) => (
        <div className="panel" key={i}>
          <label>
            {k === "matching" ? "Matching term" : "Blank label"} {i + 1}
            <input
              aria-label={`${k === "matching" ? "Matching term" : "Blank label"} ${i + 1}`}
              required
              maxLength={240}
              value={prompt}
              onChange={(e) =>
                rebuild(
                  prompts.map((v, j) => (j === i ? e.target.value : v)),
                  answers,
                )
              }
            />
          </label>
          <label>
            {k === "matching" ? "Matching meaning" : "Expected word"} {i + 1}
            <input
              aria-label={`${k === "matching" ? "Matching meaning" : "Expected word"} ${i + 1}`}
              required
              maxLength={k === "matching" ? 240 : 200}
              value={answers[i]}
              onChange={(e) =>
                rebuild(
                  prompts,
                  answers.map((v, j) => (j === i ? e.target.value : v)),
                )
              }
            />
          </label>
          <button
            type="button"
            className="ghost"
            disabled={prompts.length <= (k === "matching" ? 2 : 1)}
            onClick={() =>
              rebuild(
                prompts.filter((_, j) => j !== i),
                answers.filter((_, j) => j !== i),
              )
            }
          >
            Remove pair / blank {i + 1}
          </button>
        </div>
      ))}
      <button
        type="button"
        disabled={prompts.length >= 8}
        onClick={() => rebuild([...prompts, ""], [...answers, ""])}
      >
        Add {k === "matching" ? "matching pair" : "blank"}
      </button>
    </>
  );
}
