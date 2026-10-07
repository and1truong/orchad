# External SCORM wrapper fixtures

These are isolated test assets, not production engine code. Generated course HTML/manifests are original Pear fixtures. No sample content, PII or credentials are uploaded to a cloud engine.

| Asset | Source | License | Pin |
|---|---|---|---|
| pipwerks-wrapper.js | Philip Hutchison, [SCORM_API_wrapper.js](https://github.com/pipwerks/scorm-api-wrapper/blob/master/src/JavaScript/SCORM_API_wrapper.js), v1.1.20180906 | MIT-style, original copyright/header retained; full terms in LICENSE-pipwerks.txt | Upstream Git blob e4693b346aa9520be078cf64cb88396de004b0bc; only CRLF converted to LF; normalized SHA-256 ec1702f1b0e620d7d1dc6a737b0daf47487a3b893fe5cab5deb35850f2901706 |
| adl-2004-wrapper.base64 | Advanced Distributed Learning, `Shared/JavaScript/APIWrapper.js` from [RosesOriginal.zip](https://github.com/adlnet/Starting-from-SCORM-A-Developers-Guide/blob/master/Steps/RosesOriginal.zip) | File's explicit CC BY-SA 3.0 Unported notice, attribution, disclaimer and license URI retained verbatim in decoded bytes | ZIP Git blob bba71ab3a7337ca8563a0ff44d60438485a1bac2; decoded file SHA-256 252099ca61c5f50c303c666d14155648d172940cabd714f2041b2bc81ad70311 |

The ADL wrapper is reproduced unmodified as a separate licensed work. Base64 preserves its original non-UTF-8 copyright byte and line endings. Decode for the test package; retain its notices and [CC BY-SA 3.0 terms](https://creativecommons.org/licenses/by-sa/3.0/legalcode) when redistributing it. The wider package contains Flash and remote xAPI examples; the full Roses package is not a supported playback fixture or bundled here. Do not equate a wrapper pass with an authoring-tool export or full ADL suite pass.

The legacy ADL Sample RTE is not vendored: its root README names Apache 2.0 while RTE_Readme/licenseCopyright.html names CC BY-NC-SA 3.0. Its Windows/Java/Tomcat runtime also differs from this test lane. Record this as an unresolved reference-suite/license/platform gate, without blocking independent fixtures or claiming certification.

Commercial Storyline/Captivate/Rise exports and Rustici differential testing require separately authorized fixtures/accounts. Their absence is an open compatibility gate; these wrapper tests do not claim equivalence.
