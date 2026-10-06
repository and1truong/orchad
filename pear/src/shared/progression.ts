import type { Course, Lesson } from "./model.ts";
// Module prerequisites require every lesson in each earlier prerequisite module.
// Existing courses without modules retain their exact lesson progression policy.
export function requiredLessonIds(course: Course, lesson: Lesson): string[] {
  const module = course.modules?.find((m) => m.lessonIds.includes(lesson.id));
  const moduleLessons =
    module?.prerequisiteIds.flatMap(
      (id) => course.modules!.find((m) => m.id === id)!.lessonIds,
    ) ?? [];
  return [...new Set([...lesson.prerequisiteIds, ...moduleLessons])];
}
