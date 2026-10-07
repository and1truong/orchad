import type {Session} from './api.ts';

export async function downloadSCORMSupport(session: Session, launchId: string | undefined, isCurrent: () => boolean) {
  const path = launchId ? '/launches/' + encodeURIComponent(launchId) + '/diagnostics' : '/diagnostics';
  const response = await fetch('/api/scorm-engine' + path, {credentials: 'same-origin', headers: {'X-Pear-Epoch': session.sessionEpoch}});
  if (!response.ok) throw Error('SCORM support download was denied');
  const blob = await response.blob(); if (!isCurrent()) return;
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = 'pear-scorm-support.json'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}
