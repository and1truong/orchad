# ADR-054: Original question titles and bounded formatting
Epic #49 G06/G12/G16. Base PR #112.

Questions can have an optional nonblank title up to 255 characters and a flat promptFormat selecting plain text or an original bounded markup grammar. The original profile supports bold, italic, underline, paragraphs and ordered/unordered lists, with author selection toolbar buttons. Prompt remains 400 characters, at most 32 formatted lines, and existing quiz/course/message budgets remain authoritative.

This is an original controlled grammar, not a provider HTML/Markdown parser or an exact import/export/rich-editor equivalence claim. React renders text/strong/em/u/paragraph/list nodes; arbitrary HTML, URLs, images and attributes are literal text. Parsing limits nesting to four levels and formatting node budget to 128, with literal fallback that never executes markup. Plain mode preserves all characters. Optional title is also literal text and is preserved when switching question type.

Author preview and human player share the same renderer and pure validation. Published versions and prior learner pins keep their exact original title/prompt. Title/format add only flat schema properties and retain canonical depth 6 and all limits. Original metadata may enter the learner bridge only when model-processing rights permit; correctness keys/feedback retain existing restrictions.

Three parser/React escaping/canonical-schema/actual pinned-domain regressions plus one author toolbar/preview/publish/learner EN/VI mobile fixture are authored; exact-head CI pending. Full rich-text editor/file/link/question-title import parity and exact reference formatting remain NOT VERIFIED. Explicit latest-quiz migration, awards gaps, provider/commercial conformance and production/manual accessibility/linguistic audits remain OPEN.
