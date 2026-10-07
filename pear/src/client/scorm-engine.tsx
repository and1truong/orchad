import React, {useEffect, useRef, useState} from 'react';
import {request, type Session} from './api.ts';

export function EnginePackages(p: {session: Session; busy: boolean; run: (fn: () => Promise<void>) => Promise<boolean>; isCurrent: () => boolean; tick: number; author?: boolean}) {
  const [data, setData] = useState<any>(null), [job, setJob] = useState<any>(null), [file, setFile] = useState<File | null>(null);
  const [provenance, setProvenance] = useState(''), [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0), [offset, setOffset] = useState(0);
  const [launch, setLaunch] = useState<any>(null), [consent, setConsent] = useState(false), [playStatus, setPlayStatus] = useState('');
  const frame = useRef<HTMLIFrameElement>(null), currentLaunch = useRef<any>(null);
  useEffect(() => {
    let active = true;
    const message = (event: MessageEvent) => {
      const current = currentLaunch.current, value = event.data;
      if (!current || event.source !== frame.current?.contentWindow || event.origin !== current.contentOrigin || value?.kind !== 'pear-scorm-engine-status' || value.launchId !== current.launchId || !Number.isSafeInteger(value.sequence)) return;
      // Messages only request reconciliation. Durable acknowledgement comes from Pear's authenticated read.
      if (!value.acknowledged) {setPlayStatus('Package progress is pending server acknowledgement.'); return;}
      void request<any>('/api/scorm-engine/launches/' + current.launchId, p.session).then(result => {
        if (active && p.isCurrent() && currentLaunch.current === current && result.sequence >= value.sequence) setPlayStatus(result.finished ? 'Package finished and saved by the server; official learning is unchanged.' : 'Package progress saved by the server; official learning is unchanged.');
      }).catch(e => {if (active && p.isCurrent()) setPlayStatus(e.message);});
    };
    window.addEventListener('message', message);
    return () => {active = false; window.removeEventListener('message', message); currentLaunch.current = null;};
  }, [p.session]);
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
  async function play(row: any) {
    await p.run(async () => {
      const context = await request<any>('/api/context?documentId=' + encodeURIComponent('learning:' + p.session.principal.tenant + ':' + p.session.principal.id), p.session);
      const value = await request<any>('/api/scorm-engine/launch', p.session, {packageId: row.id, version: row.version, mode: p.author ? 'preview' : 'normal', confirmed: consent, revision: context.revision, key: crypto.randomUUID()});
      if (p.isCurrent()) {currentLaunch.current = value; setLaunch(value); setPlayStatus('Package progress has not been saved yet.');}
    });
  }
  async function close() {
    await p.run(async () => {
      const sequence = await new Promise<number>((resolve, reject) => {
        const target = frame.current?.contentWindow, current = launch;
        const timer = setTimeout(() => {window.removeEventListener('message', message); reject(Error('Package has not acknowledged its final checkpoint. Retry before closing.'));}, 12_000);
        function message(event: MessageEvent) {
          if (event.source !== target || event.origin !== current.contentOrigin || event.data?.kind !== 'pear-scorm-engine-ready-to-close' || event.data.launchId !== current.launchId || !Number.isSafeInteger(event.data.sequence)) return;
          clearTimeout(timer); window.removeEventListener('message', message); resolve(event.data.sequence);
        }
        window.addEventListener('message', message);
        target?.postMessage({kind: 'pear-scorm-engine-flush', launchId: current.launchId}, current.contentOrigin);
      });
      const status = await request<any>('/api/scorm-engine/launches/' + launch.launchId, p.session);
      if (status.sequence !== sequence) throw Error('Package final checkpoint is not durable yet. Retry before closing.');
      await request('/api/scorm-engine/launches/' + launch.launchId + '/close', p.session, {});
      if (p.isCurrent()) {currentLaunch.current = null; setLaunch(null); setPlayStatus('');}
    });
  }
  return <section className="panel" aria-label="SCORM engine packages"><h2>SCORM engine packages</h2>
    <p>Multi-file packages. {data?.runtimeEnabled ? 'SCORM 1.2 single-SCO playback is available. Package-reported progress is separate from official learning.' : 'Playback is currently unavailable.'}</p>
    {!data?.importsEnabled && <p>Package imports require reviewed loopback development fixtures.</p>}
    {error && <p role="alert">{error}</p>}
    {job && <div role="status">Import: {job.status}{job.error && <p role="alert">{job.error}</p>}{job.warnings?.map((w: string) => <p key={w}>{w}</p>)}</div>}
    {p.author && <><form onSubmit={e => {void importPackage(e);}}><fieldset disabled={p.busy || !data?.importsEnabled}>
      <label>SCORM engine ZIP<input aria-label="SCORM engine ZIP" type="file" accept=".zip,application/zip" required onChange={e => setFile(e.target.files?.[0] ?? null)} /></label>
      <label>Content rights and provenance<input aria-label="Content rights and provenance" required maxLength={500} value={provenance} onChange={e => setProvenance(e.target.value)} /></label>
      <label><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />I confirm the rights and will review the exact executable package.</label>
      <button>Import SCORM engine package</button>
    </fieldset></form><label>Engine package review reason<input aria-label="Engine package review reason" maxLength={300} value={reason} onChange={e => setReason(e.target.value)} /></label></>}
    {data?.runtimeEnabled && <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I consent to this engine package's separate reported tracking.</label>}
    {data?.items.map((row: any) => <article key={row.id + ':' + row.version}><h3>{row.title}</h3><p>{row.standard} · version {row.version} · {row.state}</p><p>SHA-256: {row.sha256}</p>
      {p.author && <><button disabled={p.busy || !confirmed || !reason.trim() || !data.importsEnabled || !['quarantined', 'published'].includes(row.state)} onClick={() => {void review(row, row.state === 'quarantined' ? 'publish' : 'retire');}}>{row.state === 'quarantined' ? 'Publish reviewed engine package' : 'Retire engine package'}</button>
        <button disabled={p.busy || !confirmed || !reason.trim() || !data.importsEnabled || row.state === 'revoked'} onClick={() => {void review(row, 'revoke');}}>Revoke engine package</button>
        <button disabled={p.busy || !data.importsEnabled} onClick={() => {void exportPackage(row);}}>Export original engine ZIP</button></>}
      {data?.runtimeEnabled && row.state === 'published' && <>{!row.playbackSupported && <p>This package requires SCORM features outside the current playback support.</p>}<button disabled={p.busy || !consent || !!launch || !row.playbackSupported} onClick={() => {void play(row);}}>{p.author ? 'Preview engine package' : 'Play or resume engine package'}</button></>}
    </article>)}
    {launch && <><iframe ref={frame} title="Isolated SCORM engine player" sandbox="allow-scripts allow-same-origin" src={launch.url} style={{width: '100%', height: '80vh', border: 0}} /><p role="status">{playStatus}</p><button disabled={p.busy} onClick={() => frame.current?.contentWindow?.postMessage({kind: 'pear-scorm-engine-retry', launchId: launch.launchId}, launch.contentOrigin)}>Retry engine checkpoint</button><button disabled={p.busy} onClick={() => {void close();}}>Close engine package</button></>}
    <button disabled={p.busy || offset === 0} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous engine packages</button>
    <button disabled={p.busy || data?.nextOffset == null} onClick={() => setOffset(data.nextOffset)}>Next engine packages</button>
  </section>;
}
