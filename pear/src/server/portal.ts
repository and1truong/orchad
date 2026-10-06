import type {DatabaseSync} from "node:sqlite";
import type {Principal} from "../shared/model.ts";
import {defaultPortal} from "../shared/portal.ts";
import {reject} from "./errors.ts";
export class PortalService{
 constructor(readonly db:DatabaseSync){}
 authorize(p:Principal,name:string){if(name==="human_save_portal_branding"&&p.role!=="admin")reject("FORBIDDEN","Portal settings require tenant administrator");}
 read(p:Principal){const r=this.db.prepare("SELECT definition,version FROM portal_branding WHERE tenant=?").get(p.tenant) as any;return {branding:r?JSON.parse(r.definition):structuredClone(defaultPortal),version:r?.version??0};}
 write(p:Principal,a:any){this.authorize(p,"human_save_portal_branding");const b=a.branding;if(!b.name.trim()||/[\u0000-\u001f\u007f]/.test(b.name+b.tagline))reject("INVALID_ARGUMENT","Use nonempty portal name and printable presentation text");
  this.db.prepare("INSERT INTO portal_branding VALUES(?,?,1) ON CONFLICT(tenant) DO UPDATE SET definition=excluded.definition,version=portal_branding.version+1").run(p.tenant,JSON.stringify(b));return {...this.read(p),saved:true};
 }
}
