import {readFileSync} from "node:fs";
import {evaluateRecording,type QualityCase} from "../evaluation/quality.ts";
const path=process.argv[2];if(!path)throw Error("Pass an explicitly captured original calibration recording; no provider calls are made");
const bytes=readFileSync(path);if(bytes.length>1024*1024)throw Error("Quality recording exceeds 1MiB");
const cases=JSON.parse(readFileSync(new URL("../evaluation/original-quality-cases.json",import.meta.url),"utf8")).cases as QualityCase[],result=evaluateRecording(cases,JSON.parse(bytes.toString("utf8")));
process.stdout.write(JSON.stringify(result,null,2)+"\n");
if(result.counts.failed||result.counts.notRun)process.exitCode=1;
