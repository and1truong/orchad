import {crc32} from '../src/server/scorm-archive.ts';
import {cmi5XML} from './cmi5-fixture.ts';
export const standaloneCMI5 = (origin='https://content.example.test') => cmi5XML().replace('lessons/intro.html?theme=blue#start',origin+'/lessons/intro.html?theme=blue#start').replace('lessons/practice.html',origin+'/lessons/practice.html');

// Real ZIP64 size/offset extra fields, EOCD64 record and locator. Small data
// keeps the fixture within quotas while every 32-bit sentinel requires ZIP64.
export function cmi5ZIP64(xml=cmi5XML(),oversized=false) {
  const entries=[{name:'cmi5.xml',data:Buffer.from(xml)},{name:'lessons/intro.html',data:Buffer.from('<!doctype html><title>Introduction</title>')},{name:'lessons/practice.html',data:Buffer.from('<!doctype html><title>Practice</title>')}];
  const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
  for(const entry of entries) {
    const name=Buffer.from(entry.name),crc=crc32(entry.data),size=BigInt(entry.data.length),local=Buffer.alloc(30),extra=Buffer.alloc(20),central=Buffer.alloc(46),centralExtra=Buffer.alloc(28);
    local.writeUInt32LE(0x04034b50);local.writeUInt16LE(45,4);local.writeUInt16LE(0x800,6);local.writeUInt32LE(crc,14);local.writeUInt32LE(0xffffffff,18);local.writeUInt32LE(0xffffffff,22);local.writeUInt16LE(name.length,26);local.writeUInt16LE(extra.length,28);
    extra.writeUInt16LE(1);extra.writeUInt16LE(16,2);extra.writeBigUInt64LE(size,4);extra.writeBigUInt64LE(size,12);
    central.writeUInt32LE(0x02014b50);central.writeUInt16LE((3<<8)|45,4);central.writeUInt16LE(45,6);central.writeUInt16LE(0x800,8);central.writeUInt32LE(crc,16);central.writeUInt32LE(0xffffffff,20);central.writeUInt32LE(0xffffffff,24);central.writeUInt16LE(name.length,28);central.writeUInt16LE(centralExtra.length,30);central.writeUInt32LE((0o100644<<16)>>>0,38);central.writeUInt32LE(0xffffffff,42);
    centralExtra.writeUInt16LE(1);centralExtra.writeUInt16LE(24,2);centralExtra.writeBigUInt64LE(oversized ? 64n*1024n*1024n : size,4);centralExtra.writeBigUInt64LE(size,12);centralExtra.writeBigUInt64LE(BigInt(offset),20);
    locals.push(local,name,extra,entry.data);centrals.push(central,name,centralExtra);offset+=local.length+name.length+extra.length+entry.data.length;
  }
  const directory=Buffer.concat(centrals),record=Buffer.alloc(56),locator=Buffer.alloc(20),end=Buffer.alloc(22);
  record.writeUInt32LE(0x06064b50);record.writeBigUInt64LE(44n,4);record.writeUInt16LE(45,12);record.writeUInt16LE(45,14);record.writeBigUInt64LE(BigInt(entries.length),24);record.writeBigUInt64LE(BigInt(entries.length),32);record.writeBigUInt64LE(BigInt(directory.length),40);record.writeBigUInt64LE(BigInt(offset),48);
  locator.writeUInt32LE(0x07064b50);locator.writeBigUInt64LE(BigInt(offset+directory.length),8);locator.writeUInt32LE(1,16);
  end.writeUInt32LE(0x06054b50);end.writeUInt16LE(0xffff,8);end.writeUInt16LE(0xffff,10);end.writeUInt32LE(0xffffffff,12);end.writeUInt32LE(0xffffffff,16);
  return Buffer.concat([...locals,directory,record,locator,end]);
}
