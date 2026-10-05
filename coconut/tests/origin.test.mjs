import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
// One trusted app-origin config (trusted-origin.txt) feeds native
// authorization (env! in main.rs), the guest capability (generated) and the
// launcher default (vite ?raw import). These checks keep all consumers and the
// guava default port consistent and exact — no wildcards, no drift.
test('trusted origin is a bare exact origin',()=>{const o=readFileSync(new URL('../trusted-origin.txt',import.meta.url),'utf8').trim();assert.match(o,/^https?:\/\/[^\s/]+$/);const u=new URL(o);assert.equal(u.username,'');assert.equal(u.password,'');assert.equal(u.pathname,'/');});
test('generated capability matches trusted origin',()=>{const o=readFileSync(new URL('../trusted-origin.txt',import.meta.url),'utf8').trim();const cap=JSON.parse(readFileSync(new URL('../src-tauri/capabilities/guest-replies.json',import.meta.url),'utf8'));assert.deepEqual(cap.remote.urls,[`${o}/*`]);assert.equal(cap.local,false);assert.deepEqual(cap.permissions,['allow-guest-reply']);});
test('native authorization consumes the shared origin constant',()=>{const rs=readFileSync(new URL('../src-tauri/src/main.rs',import.meta.url),'utf8');assert.match(rs,/env!\("TRUSTED_APP_ORIGIN"\)/);assert.match(rs,/u\.origin\(\)\.ascii_serialization\(\) == TRUSTED_APP_ORIGIN/);});
test('launcher default consumes the shared origin',()=>{assert.match(readFileSync(new URL('../src/main.tsx',import.meta.url),'utf8'),/trusted-origin\.txt\?raw/);});
test('trusted origin matches guava default origin',()=>{const guava=readFileSync(new URL('../../guava/src/server/start.ts',import.meta.url),'utf8');const port=guava.match(/PORT\s*\?\?\s*(\d+)/)[1];const o=new URL(readFileSync(new URL('../trusted-origin.txt',import.meta.url),'utf8').trim());assert.equal(o.port,port);assert.equal(o.hostname,'127.0.0.1');});
