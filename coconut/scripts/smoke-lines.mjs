import {StringDecoder} from 'node:string_decoder';
// stderr chunks can split a marker anywhere, including before its prefix.
export function smokeLines(onMarker) {
  const decoder = new StringDecoder('utf8');
  let pending = '';
  return chunk => {
    pending += decoder.write(chunk);
    for (;;) {
      const end = pending.indexOf('\n');
      if (end < 0) break;
      const line = pending.slice(0, end).trimEnd();
      pending = pending.slice(end + 1);
      if (line.startsWith('COCONUT_SMOKE:')) onMarker(line);
    }
  };
}
