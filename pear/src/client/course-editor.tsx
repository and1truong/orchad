import { QuestionSettings, ExtendedQuestion } from "./question-editor.tsx";
import React, { useState } from "react";
import type { ContentItem, Course, Lesson, Question } from "../shared/model.ts";
import { requiredLessonIds } from "../shared/progression.ts";
export interface DraftSelection {
  id: string;
  course: Course;
  exists: boolean;
}
export interface ReusableItem {
  id: string;
  state: string;
  latest_version: number;
  published: ContentItem | null;
}
export function newCourse(): Course {
  return {
    title: "",
    summary: "",
    topic: "Learning skills",
    language: "en",
    duration: 10,
    level: "beginner",
    provider: "Pear Originals",
    license: "self-authored",
    aiProcessingAllowed: true,
    completionPolicy: "human_attestation_and_quiz",
    modules: [
      {
        id: "module-1",
        title: "Introduction",
        lessonIds: ["lesson-1"],
        prerequisiteIds: [],
      },
    ],
    lessons: [
      {
        id: "lesson-1",
        title: "Introduction",
        text: "",
        kind: "text",
        prerequisiteIds: [],
      },
    ],
    quiz: {
      passScore: 100,
      maxAttempts: 2,
      questions: [
        { id: "question-1", prompt: "", options: ["", ""], correct: 1 },
      ],
    },
  };
}
const freshId = (prefix: string) =>
  prefix + "-" + crypto.randomUUID().slice(0, 8);
export function CourseEditor({
  selection,
  reusableItems,
  busy,
  onSave,
  onNew,
}: {
  selection: DraftSelection;
  reusableItems: ReusableItem[];
  busy: boolean;
  onSave: (id: string, course: Course, exists: boolean) => void;
  onNew: () => void;
}) {
  const [id, setId] = useState(selection.id);
  const [course, setCourse] = useState<Course>(() => {
    const c = structuredClone(selection.course);
    c.modules ??= [
      {
        id: "module-1",
        title: "Lessons",
        lessonIds: c.lessons.map((l) => l.id),
        prerequisiteIds: [],
      },
    ];
    return c;
  });
  const [preview, setPreview] = useState(false);
  const update = (change: (c: Course) => void) =>
    setCourse((previous) => {
      const next = structuredClone(previous);
      change(next);
      return next;
    });
  const updateLesson = (lessonId: string, change: (l: Lesson) => void) =>
    update((c) => change(c.lessons.find((l) => l.id === lessonId)!));
  const updateQuestion = (questionId: string, change: (q: Question) => void) =>
    update((c) => change(c.quiz.questions.find((q) => q.id === questionId)!));
  const sequence = (c: Course) => {
    c.lessons = c.modules!.flatMap((m) =>
      m.lessonIds.map((lessonId) => c.lessons.find((l) => l.id === lessonId)!),
    );
  };
  const removeLesson = (c: Course, lessonId: string) => {
    c.lessons = c.lessons.filter((l) => l.id !== lessonId);
    for (const l of c.lessons)
      l.prerequisiteIds = l.prerequisiteIds.filter((x) => x !== lessonId);
    for (const m of c.modules!)
      m.lessonIds = m.lessonIds.filter((x) => x !== lessonId);
  };
  return (
    <section className="panel" aria-label="Course authoring">
      <h2>{selection.exists ? "Edit course draft" : "Create course draft"}</h2>
      <p className="muted">
        Save edits to the draft, then publish a new immutable version. Existing
        learners retain their enrolled version.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(id, course, selection.exists);
        }}
      >
        <fieldset disabled={busy}>
          <legend>Course metadata</legend>
          <div className="editor">
            <label>
              Course ID
              <input
                required
                maxLength={64}
                disabled={selection.exists}
                value={id}
                onChange={(e) => setId(e.target.value)}
              />
            </label>
            <label>
              Title
              <input
                required
                maxLength={160}
                value={course.title}
                onChange={(e) =>
                  update((c) => {
                    c.title = e.target.value;
                  })
                }
              />
            </label>
            <label>
              Summary
              <textarea
                required
                maxLength={600}
                value={course.summary}
                onChange={(e) =>
                  update((c) => {
                    c.summary = e.target.value;
                  })
                }
              />
            </label>
            <label>
              Topic
              <input
                required
                maxLength={80}
                value={course.topic}
                onChange={(e) =>
                  update((c) => {
                    c.topic = e.target.value;
                  })
                }
              />
            </label>
            <label>
              Course language
              <select
                value={course.language}
                onChange={(e) =>
                  update((c) => {
                    c.language = e.target.value as Course["language"];
                  })
                }
              >
                <option value="en">English</option>
                <option value="vi">Tiếng Việt</option>
              </select>
            </label>
            <label>
              Duration in minutes
              <input
                required
                type="number"
                min={1}
                max={600}
                value={course.duration}
                onChange={(e) =>
                  update((c) => {
                    c.duration = Number(e.target.value);
                  })
                }
              />
            </label>
            <label>
              Level
              <select
                value={course.level}
                onChange={(e) =>
                  update((c) => {
                    c.level = e.target.value as Course["level"];
                  })
                }
              >
                <option value="beginner">Beginner</option>
                <option value="intermediate">Intermediate</option>
              </select>
            </label>
            <label>
              Provider
              <input
                required
                maxLength={100}
                value={course.provider}
                onChange={(e) =>
                  update((c) => {
                    c.provider = e.target.value;
                  })
                }
              />
            </label>
            <label className="choice">
              <input
                type="checkbox"
                checked={course.aiProcessingAllowed}
                onChange={(e) =>
                  update((c) => {
                    c.aiProcessingAllowed = e.target.checked;
                  })
                }
              />
              Allow model processing of self-authored course content
            </label>
          </div>
        </fieldset>
        {course.modules!.map((module, moduleIndex) => (
          <fieldset
            key={module.id}
            disabled={busy}
            aria-label={`Module ${moduleIndex + 1}`}
          >
            <legend>Module {moduleIndex + 1}</legend>
            <label>
              Module title
              <input
                required
                maxLength={160}
                value={module.title}
                onChange={(e) =>
                  update((c) => {
                    c.modules![moduleIndex].title = e.target.value;
                  })
                }
              />
            </label>
            <p className="muted">Module ID: {module.id}</p>
            {moduleIndex > 0 && (
              <fieldset>
                <legend>Complete these modules first</legend>
                {course.modules!.slice(0, moduleIndex).map((previous) => (
                  <label className="choice" key={previous.id}>
                    <input
                      type="checkbox"
                      checked={module.prerequisiteIds.includes(previous.id)}
                      onChange={(e) =>
                        update((c) => {
                          const m = c.modules![moduleIndex];
                          m.prerequisiteIds = e.target.checked
                            ? [...m.prerequisiteIds, previous.id]
                            : m.prerequisiteIds.filter(
                                (x) => x !== previous.id,
                              );
                        })
                      }
                    />
                    {previous.title}
                  </label>
                ))}
              </fieldset>
            )}
            {module.lessonIds.map((lessonId, lessonIndex) => {
              const l = course.lessons.find((value) => value.id === lessonId)!,
                overallIndex = course.lessons.indexOf(l);
              return (
                <fieldset key={l.id} aria-label={`Lesson ${overallIndex + 1}`}>
                  <legend>Lesson {overallIndex + 1}</legend>
                  <label>
                    Content source
                    <select
                      value={
                        l.contentRef
                          ? `${l.contentRef.itemId}:${l.contentRef.version}`
                          : "inline"
                      }
                      onChange={(e) =>
                        updateLesson(l.id, (next) => {
                          const selected = reusableItems.find(
                            (item) =>
                              `${item.id}:${item.latest_version}` ===
                              e.target.value,
                          );
                          if (!selected) {
                            delete next.contentRef;
                            return;
                          }
                          const content = selected.published!;
                          next.contentRef = {
                            itemId: selected.id,
                            version: selected.latest_version,
                          };
                          next.title = content.title;
                          next.kind = content.kind;
                          next.text = content.text;
                          delete next.url;
                          delete next.assetId;
                          if (content.assetId) next.assetId = content.assetId;
                          delete next.transcript;
                          if (content.url) next.url = content.url;
                          if (content.transcript)
                            next.transcript = content.transcript;
                        })
                      }
                    >
                      <option value="inline">Inline lesson</option>
                      {l.contentRef &&
                        !reusableItems.some(
                          (item) =>
                            item.id === l.contentRef!.itemId &&
                            item.latest_version === l.contentRef!.version &&
                            item.state === "published",
                        ) && (
                          <option
                            value={`${l.contentRef.itemId}:${l.contentRef.version}`}
                          >
                            Pinned {l.contentRef.itemId} · v
                            {l.contentRef.version}
                          </option>
                        )}
                      {reusableItems
                        .filter(
                          (item) =>
                            item.state === "published" && item.published,
                        )
                        .map((item) => (
                          <option
                            key={item.id}
                            value={`${item.id}:${item.latest_version}`}
                          >
                            {item.published!.title} · v{item.latest_version}
                          </option>
                        ))}
                    </select>
                  </label>
                  {l.contentRef && (
                    <p className="muted">
                      Pinned to {l.contentRef.itemId} version{" "}
                      {l.contentRef.version}. Updating the source does not
                      update this draft automatically. Select the new version
                      explicitly.
                    </p>
                  )}
                  <label>
                    Lesson title
                    <input
                      required
                      maxLength={160}
                      disabled={!!l.contentRef}
                      value={l.title}
                      onChange={(e) =>
                        updateLesson(l.id, (next) => {
                          next.title = e.target.value;
                        })
                      }
                    />
                  </label>
                  <label>
                    Lesson format
                    <select
                      disabled={!!l.contentRef}
                      value={l.kind}
                      onChange={(e) =>
                        updateLesson(l.id, (next) => {
                          next.kind = e.target.value as Lesson["kind"];
                          delete next.assetId;
                          delete next.url;
                          delete next.transcript;
                        })
                      }
                    >
                      <option value="text">Text</option>
                      <option value="video">HTTPS video</option>
                      <option value="link">HTTPS link</option>
                      {l.contentRef &&
                        ["audio", "document", "interactive"].includes(
                          l.kind,
                        ) && (
                          <option value={l.kind}>
                            {l.kind} (uploaded item)
                          </option>
                        )}
                    </select>
                  </label>
                  <label>
                    {overallIndex === 0 ? "First lesson text" : "Lesson text"}
                    <textarea
                      required
                      disabled={!!l.contentRef}
                      maxLength={2500}
                      value={l.text}
                      onChange={(e) =>
                        updateLesson(l.id, (next) => {
                          next.text = e.target.value;
                        })
                      }
                    />
                  </label>
                  {["video", "link"].includes(l.kind) && !l.assetId && (
                    <label>
                      HTTPS media URL
                      <input
                        required
                        disabled={!!l.contentRef}
                        type="url"
                        maxLength={2048}
                        value={l.url ?? ""}
                        onChange={(e) =>
                          updateLesson(l.id, (next) => {
                            next.url = e.target.value;
                          })
                        }
                      />
                    </label>
                  )}
                  {["video", "audio", "interactive"].includes(l.kind) && (
                    <label>
                      Video transcript
                      <textarea
                        required
                        disabled={!!l.contentRef}
                        maxLength={2500}
                        value={l.transcript ?? ""}
                        onChange={(e) =>
                          updateLesson(l.id, (next) => {
                            next.transcript = e.target.value;
                          })
                        }
                      />
                    </label>
                  )}
                  {overallIndex > 0 && (
                    <fieldset>
                      <legend>Complete these lessons first</legend>
                      {course.lessons.slice(0, overallIndex).map((previous) => (
                        <label className="choice" key={previous.id}>
                          <input
                            type="checkbox"
                            checked={l.prerequisiteIds.includes(previous.id)}
                            onChange={(e) =>
                              updateLesson(l.id, (next) => {
                                next.prerequisiteIds = e.target.checked
                                  ? [...next.prerequisiteIds, previous.id]
                                  : next.prerequisiteIds.filter(
                                      (x) => x !== previous.id,
                                    );
                              })
                            }
                          />
                          {previous.title}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <div className="actions">
                    <button
                      type="button"
                      className="ghost"
                      disabled={lessonIndex === 0}
                      onClick={() =>
                        update((c) => {
                          const ids = c.modules![moduleIndex].lessonIds;
                          [ids[lessonIndex - 1], ids[lessonIndex]] = [
                            ids[lessonIndex],
                            ids[lessonIndex - 1],
                          ];
                          sequence(c);
                        })
                      }
                    >
                      Move lesson up
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={lessonIndex === module.lessonIds.length - 1}
                      onClick={() =>
                        update((c) => {
                          const ids = c.modules![moduleIndex].lessonIds;
                          [ids[lessonIndex + 1], ids[lessonIndex]] = [
                            ids[lessonIndex],
                            ids[lessonIndex + 1],
                          ];
                          sequence(c);
                        })
                      }
                    >
                      Move lesson down
                    </button>
                    <button
                      type="button"
                      className="ghost"
                      disabled={module.lessonIds.length === 1}
                      onClick={() => update((c) => removeLesson(c, l.id))}
                    >
                      Remove lesson
                    </button>
                  </div>
                </fieldset>
              );
            })}
            <div className="actions">
              <button
                type="button"
                disabled={course.lessons.length >= 8}
                onClick={() =>
                  update((c) => {
                    const lessonId = freshId("lesson");
                    c.lessons.push({
                      id: lessonId,
                      title: "New lesson",
                      text: "",
                      kind: "text",
                      prerequisiteIds: [],
                    });
                    c.modules![moduleIndex].lessonIds.push(lessonId);
                    sequence(c);
                  })
                }
              >
                Add lesson
              </button>
              <button
                type="button"
                className="ghost"
                disabled={moduleIndex === 0}
                onClick={() =>
                  update((c) => {
                    [c.modules![moduleIndex - 1], c.modules![moduleIndex]] = [
                      c.modules![moduleIndex],
                      c.modules![moduleIndex - 1],
                    ];
                    sequence(c);
                  })
                }
              >
                Move module up
              </button>
              <button
                type="button"
                className="ghost"
                disabled={course.modules!.length === 1}
                onClick={() =>
                  update((c) => {
                    const removed = c.modules!.splice(moduleIndex, 1)[0];
                    for (const lessonId of removed.lessonIds)
                      removeLesson(c, lessonId);
                    for (const m of c.modules!)
                      m.prerequisiteIds = m.prerequisiteIds.filter(
                        (x) => x !== removed.id,
                      );
                  })
                }
              >
                Remove module and lessons
              </button>
            </div>
          </fieldset>
        ))}
        <button
          type="button"
          disabled={busy || course.lessons.length >= 8}
          onClick={() =>
            update((c) => {
              const moduleId = freshId("module"),
                lessonId = freshId("lesson");
              c.modules!.push({
                id: moduleId,
                title: "New module",
                lessonIds: [lessonId],
                prerequisiteIds: [],
              });
              c.lessons.push({
                id: lessonId,
                title: "New lesson",
                text: "",
                kind: "text",
                prerequisiteIds: [],
              });
            })
          }
        >
          Add module
        </button>
        <fieldset disabled={busy}>
          <legend>Backend-graded MCQ</legend>
          <div className="editor">
            <label>
              Pass score percentage
              <input
                required
                type="number"
                min={1}
                max={100}
                value={course.quiz.passScore}
                onChange={(e) =>
                  update((c) => {
                    c.quiz.passScore = Number(e.target.value);
                  })
                }
              />
            </label>
            <label>
              Maximum attempts
              <input
                required
                type="number"
                min={1}
                max={10}
                value={course.quiz.maxAttempts}
                onChange={(e) =>
                  update((c) => {
                    c.quiz.maxAttempts = Number(e.target.value);
                  })
                }
              />
            </label>
          </div>
          <label className="choice">
            <input
              type="checkbox"
              checked={!!course.quiz.shuffleQuestions}
              onChange={(e) =>
                update((c) => {
                  c.quiz.shuffleQuestions = e.target.checked;
                })
              }
            />
            Shuffle question order per attempt
          </label>
          <label className="choice">
            <input
              type="checkbox"
              checked={!!course.quiz.shuffleOptions}
              onChange={(e) =>
                update((c) => {
                  c.quiz.shuffleOptions = e.target.checked;
                })
              }
            />
            Shuffle choices per attempt
          </label>
          <label>
            Answer release
            <select
              aria-label="Answer release"
              value={course.quiz.answerRelease ?? "never"}
              onChange={(e) =>
                update((c) => {
                  c.quiz.answerRelease = e.target.value as any;
                })
              }
            >
              <option value="never">Never release answer keys</option>
              <option value="after_pass">
                After passing · human player only
              </option>
              <option value="after_exhausted">
                After all allowed attempts · human player only
              </option>
            </select>
          </label>
          {course.quiz.questions.map((q, qi) => (
            <fieldset key={q.id} aria-label={`Question ${qi + 1}`}>
              <legend>Question {qi + 1}</legend>
              <label>
                {qi === 0 ? "First quiz question" : "Quiz question"}
                <textarea
                  required
                  maxLength={400}
                  value={q.prompt}
                  onChange={(e) =>
                    updateQuestion(q.id, (next) => {
                      next.prompt = e.target.value;
                    })
                  }
                />
              </label>
              <QuestionSettings
                q={q}
                update={(value) =>
                  updateQuestion(q.id, (next) => {
                    for (const key of Object.keys(next))
                      delete (next as any)[key];
                    Object.assign(next, value);
                  })
                }
              />
              {(q.kind ?? "mcq") === "mcq" ? (
                <>
                  {q.options.map((option, oi) => (
                    <div className="option-row" key={oi}>
                      <label>
                        Option {String.fromCharCode(65 + oi)}
                        <input
                          required
                          maxLength={240}
                          value={option}
                          onChange={(e) =>
                            updateQuestion(q.id, (next) => {
                              next.options[oi] = e.target.value;
                            })
                          }
                        />
                      </label>
                      <button
                        type="button"
                        className="ghost"
                        disabled={q.options.length <= 2}
                        onClick={() =>
                          updateQuestion(q.id, (next) => {
                            next.options.splice(oi, 1);
                            next.correct =
                              next.correct === oi
                                ? 0
                                : next.correct > oi
                                  ? next.correct - 1
                                  : next.correct;
                          })
                        }
                      >
                        Remove option {String.fromCharCode(65 + oi)}
                      </button>
                    </div>
                  ))}
                  <label>
                    Correct option
                    <select
                      value={q.correct}
                      onChange={(e) =>
                        updateQuestion(q.id, (next) => {
                          next.correct = Number(e.target.value);
                        })
                      }
                    >
                      {q.options.map((_, oi) => (
                        <option value={oi} key={oi}>
                          {String.fromCharCode(65 + oi)}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <ExtendedQuestion
                  q={q}
                  update={(value) =>
                    updateQuestion(q.id, (next) => {
                      for (const key of Object.keys(next))
                        delete (next as any)[key];
                      Object.assign(next, value);
                    })
                  }
                />
              )}
              <div className="actions">
                <button
                  type="button"
                  disabled={
                    (q.kind ?? "mcq") !== "mcq" || q.options.length >= 6
                  }
                  onClick={() =>
                    updateQuestion(q.id, (next) => {
                      next.options.push("");
                    })
                  }
                >
                  Add option
                </button>
                <button
                  type="button"
                  className="ghost"
                  disabled={course.quiz.questions.length === 1}
                  onClick={() =>
                    update((c) => {
                      c.quiz.questions = c.quiz.questions.filter(
                        (next) => next.id !== q.id,
                      );
                    })
                  }
                >
                  Remove question
                </button>
              </div>
            </fieldset>
          ))}
          <button
            type="button"
            disabled={course.quiz.questions.length >= 8}
            onClick={() =>
              update((c) => {
                c.quiz.questions.push({
                  id: freshId("question"),
                  prompt: "",
                  options: ["", ""],
                  correct: 0,
                });
              })
            }
          >
            Add question
          </button>
        </fieldset>
        <div className="actions">
          <button disabled={busy}>Save draft</button>
          <button
            type="button"
            className="ghost"
            onClick={() => setPreview(!preview)}
          >
            Preview draft
          </button>
          <button type="button" className="ghost" onClick={onNew}>
            New course
          </button>
        </div>
      </form>
      {preview && (
        <section aria-label="Draft preview" className="panel">
          <h3>{course.title || "Untitled draft"}</h3>
          <p>{course.summary}</p>
          <p>
            This unsaved preview never creates enrollment, progress or a quiz
            attempt.
          </p>
          {course.modules!.map((m) => (
            <section key={m.id}>
              <h4>{m.title}</h4>
              {m.lessonIds.map((lessonId) => {
                const l = course.lessons.find((next) => next.id === lessonId)!;
                return (
                  <div key={l.id}>
                    <h5>{l.title}</h5>
                    <p className="lesson-text">{l.text}</p>
                    <p>
                      Requires:{" "}
                      {requiredLessonIds(course, l).join(", ") || "none"}
                    </p>
                    {l.kind !== "text" && (
                      <p>
                        {l.kind}: {l.url}
                      </p>
                    )}
                    {l.transcript && <p>{l.transcript}</p>}
                  </div>
                );
              })}
            </section>
          ))}
          <p>
            {course.quiz.questions.length} questions · Pass{" "}
            {course.quiz.passScore}% · {course.quiz.maxAttempts} attempts
          </p>
          {course.quiz.questions.map((q) => (
            <div key={q.id}>
              <p>{q.prompt}</p>
              <ol>
                {q.options.map((option, oi) => (
                  <li key={oi}>{option}</li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}
    </section>
  );
}
