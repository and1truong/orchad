// Original ADL RTE API/error and data-model access/dependency vectors.
export const scorm12PrecedenceWrites: [string, string, string][] = [
  ['cmi.core.student_id', '\ud800', '403'], ['cmi.core._children', 'invalid', '402'],
  ['cmi.core.undefined', '\ud800', '201'], ['external.undefined', '\ud800', '401'],
  ['cmi.core.lesson_status', 'invalid', '405'], ['cmi.core.score.raw', 'NaN', '405'],
];
export const scorm2004PrecedenceWrites: [string, string, string][] = [
  ['cmi.learner_id', '\ud800', '404'], ['cmi._version', 'invalid', '404'],
  ['cmi.comments_from_lms.0.comment', '\ud800', '404'], ['cmi.undefined', '\ud800', '401'],
  ['cmi.score.scaled', 'NaN', '406'], ['cmi.score.scaled', '1.01', '407'],
  ['cmi.interactions.0.type', 'choice', '408'], ['cmi.interactions.2.id', 'valid', '351'],
];
