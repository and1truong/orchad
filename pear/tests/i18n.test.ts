import {test} from "node:test";
import assert from "node:assert/strict";
import {translateUI,getUILocale,setUILocale,formatUIDate,recommendationReason} from "../src/client/i18n.ts";
test("explicit interface locale switches labels with English override and preserves unknown diagnostic fallback",()=>{
 try{
  setUILocale("vi");assert.equal(getUILocale(),"vi");assert.equal(translateUI("Save draft"),"Lưu bản nháp");
  assert.equal(translateUI("course"),"Khóa học");assert.equal(translateUI("provider-original-untranslated"),"provider-original-untranslated");
  assert.equal(translateUI("Save draft","en"),"Save draft");
 }finally{setUILocale("en");}
});
test("recommendation reasons localize only explicit UI prefixes and retain user declarations verbatim",()=>{
 try{
  setUILocale("vi");assert.equal(recommendationReason("Declared interest: Save draft"),"Mối quan tâm đã khai báo: Save draft");
  assert.equal(recommendationReason("Preferred language: en"),"Ngôn ngữ ưu tiên: en");
  assert.equal(recommendationReason("Organization featured"),"Nội dung tổ chức làm nổi bật");
  assert.equal(recommendationReason("Unknown provider declaration"),"Unknown provider declaration");
 }finally{setUILocale("en");}
});
test("localized timestamps keep the report UTC boundary and reject no unknown date by fabricating a value",()=>{
 assert.equal(formatUIDate("Unknown legacy date","vi"),"Unknown legacy date");
 const time="2026-10-06T23:45:00.000Z";
 assert.equal(formatUIDate(time,"vi"),new Intl.DateTimeFormat("vi",{dateStyle:"medium",timeStyle:"short",timeZone:"UTC"}).format(new Date(time)));
 assert.notEqual(formatUIDate(time,"en"),formatUIDate(time,"vi"));
});
