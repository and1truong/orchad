import {createHmac,timingSafeEqual} from "node:crypto";
// Server/receiver utility. Never imported into the browser bundle.
export function signWebhook(secret:string,timestamp:string,body:string){
 return createHmac("sha256",secret).update(timestamp+"."+body,"utf8").digest("hex");
}
export function verifyWebhook(secret:string,timestamp:unknown,signature:unknown,body:string,now=Date.now()){
 if(typeof timestamp!=="string"||!/^\d{10,13}$/.test(timestamp)||typeof signature!=="string"||!/^v1=[a-f0-9]{64}$/.test(signature)||Buffer.byteLength(body)>48*1024)return false;
 const seconds=Number(timestamp);if(!Number.isSafeInteger(seconds)||Math.abs(now/1000-seconds)>300)return false;
 const expected=signWebhook(secret,timestamp,body),received=signature.slice(3);
 return timingSafeEqual(Buffer.from(expected,"hex"),Buffer.from(received,"hex"));
}
