import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
const digest=(bytes:Uint8Array|ArrayBuffer)=>{const view=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);return {bytes:view.length,sha256:createHash('sha256').update(view).digest('hex')};};
export function assertSameBytes(actual:Uint8Array|ArrayBuffer,expected:Uint8Array|ArrayBuffer,label='bytes'){assert.deepEqual(digest(actual),digest(expected),label+' differ');}
