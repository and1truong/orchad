import React, {useEffect, useState} from 'react';
import {request, type Session} from './api.ts';

export function EnginePackages(p: {session: Session; busy: boolean; run: (fn: () => Promise<void>) => Promise<boolean>; isCurrent: () => boolean; tick: number; author?: boolean}) {
  const [data, setData] = useState<any>(null), [job, setJob] = useState<any>(null), [file, setFile] = useState<File | null>(null);
  const [provenance, setProvenance] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [offset, setOffset] = useState(0);
  useEffect(() => {
    let active = true;
    request<any>('/api/scorm-engine/packages?author=' + !!p.author + '&offset=' + offset, p.session).then(value => {if (active && p.isCurrent()) {setData(value); setError('');}}).catch(e => {if (active && p.isCurrent()) setError(e.message);});
    return () => {active = false;};
  }, [refresh, offset, p.tick]);
  useEffect(() => {
    if (!job || !['queued', 'running'].includes(job.status)) return;
    let active = true;
    const timer = setInterval(() => {void request<any>('/api/scorm-engine/jobs/' + job.jobId, p.session).then(value => {
      if (!active || !p.isCurrent()) return;
      setJob({...value, jobId: value.id});
      if (['ready', 'failed'].includes(value.status)) setRefresh(n => n + 1);
    }).catch(e => {if (active && p.isCurrent()) {setError(e.message); clearInterval(timer);}});}, 500);
    return () => {active = false; clearInterval(timer);};
  }, [job?.jobId, job?.status, p.tick]);
  async function importPackage(event: React.FormEvent) {
    event.preventDefault();
    await p.run(async () => {
      if (!file || file.size > 32 * 1024 * 1024 || !confirmed || !provenance.trim()) throw Error('Choose a ZIP within 32 MiB and confirm content rights.');
      const context = await request<any>('/api/context?documentId=' + encodeURIComponent('library:' + p.session.principal.tenant), p.session);
      const q = new URLSearchParams({filename: file.name, provenance: provenance.trim(), version: '1', confirmed: 'true', revision: String(context.revision), key: crypto.randomUUID()});
      const response = await fetch('/api/scorm-engine/import?' + q, {method: 'POST', credentials: 'same-origin', headers: {'Content-Type': 'application/zip', 'X-CSRF-Token': p.session.csrf, 'X-Pear-Epoch': p.session.sessionEpoch}, body: file});
      const value = await response.json();
      if (!response.ok) throw Error(value.error?.message ?? 'Package import failed');
      if (p.isCurrent()) setJob(value);
    });
  }
  async function review(row: any, action: string) {
    await p.run(async () => {
      const context = await request<any>('/api/context?documentId=' + encodeURIComponent('library:' + p.session.principal.tenant), p.session);
      await request('/api/scorm-engine/review', p.session, {packageId: row.id, version: row.version, sha256: row.sha256, action, reason, confirmed, revision: context.revision, key: crypto.randomUUID()});
      if (p.isCurrent()) setRefresh(n => n + 1);
    });
  }
  async function exportPackage(row: any) {
    await p.run(async () => {
      const response = await fetch('/api/scorm-engine/packages/' + row.id + '/' + row.version + '/export', {credentials: 'same-origin', headers: {'X-Pear-Epoch': p.session.sessionEpoch}});
      if (!response.ok) throw Error('Package export was denied');
      const blob = await response.blob(); if (!p.isCurrent()) return;
      const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = row.filename; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }
  return <section className="panel" aria-label="SCORM engine packages"><h2>SCORM engine packages</h2>
    <p>Multi-file packages. Playback is currently unavailable.</p>
    {!data?.importsEnabled && <p>Package imports require reviewed loopback development fixtures.</p>}
    {error && <p role="alert">{error}</p>}
    {job && <div role="status">Import: {job.status}{job.error && <p role="alert">{job.error}</p>}{job.warnings?.map((w: string) => <p key={w}>{w}</p>)}</div>}
    {p.author && <><form onSubmit={e => {void importPackage(e);}}><fieldset disabled={p.busy || !data?.importsEnabled}>
      <label>SCORM engine ZIP<input aria-label="SCORM engine ZIP" type="file" accept=".zip,application/zip" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>Content rights and provenance<input aria-label="Content rights and provenance" required maxLength={500} value={provenance} onChange={e => setProvenance(e.target.value)} /></label>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm the rights and will review the exact executable package.</label>
      <button>Import SCORM engine package</button>
    </fieldset></form><label>Engine package review reason<input aria-label="Engine package review reason" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label></>}
    {data?.items.map((row: any) => <article key={row.id + ':' + row.version}><h3>{row.title}</h3><p>{row.standard} · version {row.version} · {row.state}</p><p>SHA-256: {row.sha256}</p>
      {p.author && <><button disabled={p.busy || !confirmed || !reason.trim() || !data.importsEnabled || !['quarantined', 'published'].includes(row.state)} onClick={() => {void review(row, row.state === 'quarantined' ? 'publish' : 'retire');}}>{row.state === 'quarantined' ? 'Publish reviewed engine package' : 'Retire engine package'}</button>
        <button disabled={p.busy || !confirmed || !reason.trim() || !data.importsEnabled || row.state === 'revoked'} onClick={() => {void review(row, 'revoke');}}>Revoke engine package</button>
        <button disabled={p.busy || !data.importsEnabled} onClick={() => {void exportPackage(row);}}>Export original engine ZIP</button></>}
    </article>)}
    <button disabled={p.busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous engine packages</button>
    <button disabled={p.busy || data?.nextOffset == null} onClick={() => setOffset(data.nextOffset)}>Next engine packages</button>
  </section>;
}
