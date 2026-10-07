import React, {useEffect, useRef, useState} from 'react';
import {request, type Session} from './api.ts';
import {downloadSCORMSupport} from './scorm-support.ts';
import type {SCORMReference} from '../shared/model.ts';

export function SCORMReferenceEditor(p: {session: Session; value?: SCORMReference; onChange: (value: SCORMReference) => void}) {
  const [page, setPage] = useState<any>(null), [offset, setOffset] = useState(0), [error, setError] = useState('');
  useEffect(() => {let current = true; request<any>('/api/scorm-engine/packages?author=true&offset=' + offset, p.session).then(data => {if (current) setPage(data);}).catch(e => {if (current) setError(e.message);}); return () => {current = false;};}, [p.session, offset]);
  const value = p.value ?? {packageId: '', version: 1, sha256: '', completion: 'completed_or_passed'};
  return <fieldset><legend>SCORM completion policy</legend>
    {error && <p role="alert">{error}</p>}
    <label>Published SCORM package<select required value={value.packageId + ':' + value.version} onChange={e => {
      const row = page?.items.find((r: any) => r.id + ':' + r.version === e.target.value);
      if (row) p.onChange({...value, packageId: row.id, version: row.version, sha256: row.sha256});
    }}><option value=":1">Choose an exact reviewed package</option>
      {value.packageId && !page?.items.some((r: any) => r.id === value.packageId && r.version === value.version) && <option value={value.packageId + ':' + value.version}>{value.packageId} · version {value.version}</option>}
      {page?.items.filter((r: any) => r.state === 'published' && r.playbackSupported).map((r: any) => <option key={r.id + ':' + r.version} value={r.id + ':' + r.version}>{r.title} · version {r.version}</option>)}
    </select></label>
    <button type="button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - 20))}>Previous SCORM choices</button>
    <button type="button" disabled={page?.nextOffset == null} onClick={() => setOffset(page.nextOffset)}>Next SCORM choices</button>
    <p>{value.packageId && 'SHA-256: ' + value.sha256}</p>
    <label>Required SCO status<select value={value.completion} onChange={e => p.onChange({...value, completion: e.target.value as SCORMReference['completion']})}><option value="completed_or_passed">Completed or passed</option><option value="passed">Passed</option></select></label>
    <label>Minimum score for every SCO<input type="number" min="0" max="100" value={value.minimumScore ?? ''} onChange={e => {const next = {...value}; if (e.target.value === '') delete next.minimumScore; else next.minimumScore = Number(e.target.value); p.onChange(next);}} /></label>
    <p>Every required SCO must finish with accepted server evidence. Course quizzes remain required.</p>
  </fieldset>;
}

export function SCORMLearningPlayer(p: {session: Session; binding: {enrollmentId: string; lessonId: string} | {itemEnrollmentId: string}; busy: boolean; run: (fn: () => Promise<void>) => Promise<boolean>; onSaved: () => Promise<void>}) {
  const [context, setContext] = useState<any>(null), [launch, setLaunch] = useState<any>(null), [consent, setConsent] = useState(false), [status, setStatus] = useState(''), [error, setError] = useState('');
  const [retakeConfirmed, setRetakeConfirmed] = useState(false);
  const sessionRef = useRef(p.session); sessionRef.current = p.session;
  const frame = useRef<HTMLIFrameElement>(null), activeLaunch = useRef<any>(null), binding = JSON.stringify(p.binding);
  async function refresh() {const value = await request<any>('/api/scorm-engine/player-context?' + new URLSearchParams(p.binding), p.session); setContext(value);}
  useEffect(() => {let active = true; request<any>('/api/scorm-engine/player-context?' + new URLSearchParams(p.binding), p.session).then(value => {if (active) setContext(value);}).catch(e => {if (active) setError(e.message);}); return () => {active = false; activeLaunch.current = null;};}, [p.session, binding]);
  useEffect(() => {
    let active = true;
    function message(event: MessageEvent) {
      const current = activeLaunch.current, data = event.data;
      if (!current || event.source !== frame.current?.contentWindow || event.origin !== current.contentOrigin || data?.kind !== 'pear-scorm-engine-status' || data.launchId !== current.launchId || !Number.isSafeInteger(data.sequence)) return;
      if (!data.acknowledged) {setStatus('Progress is waiting for server acknowledgement.'); return;}
      void request<any>('/api/scorm-engine/launches/' + current.launchId, p.session).then(async saved => {
        if (!active || activeLaunch.current !== current || saved.sequence < data.sequence) return;
        setStatus(saved.officialLearningChanged ? 'SCORM completion accepted for this enrollment.' : saved.finished ? 'SCO finished and saved. Other SCOs or completion requirements remain.' : 'SCO progress saved by the server.');
        await refresh(); await p.onSaved();
        if (saved.finished && saved.nextScoId && active && activeLaunch.current === current && !current.navigating && !current.closing) {
          current.navigating = true;
          await request('/api/scorm-engine/launches/' + current.launchId + '/close', p.session, {});
          if (!active || activeLaunch.current !== current) return;
          activeLaunch.current = null; setLaunch(null);
          await play(saved.nextScoId, current);
        }
      }).catch(e => {if (active && activeLaunch.current === current) {current.navigating = false; setError(e.message);}});
    }
    window.addEventListener('message', message); return () => {active = false; window.removeEventListener('message', message);};
  }, [p.session, binding]);
  async function play(scoId?: string, previous?: any) {
    await p.run(async () => {
      const revision = await request<any>('/api/context?documentId=' + encodeURIComponent('learning:' + p.session.principal.tenant + ':' + p.session.principal.id), p.session);
      const value = await request<any>('/api/scorm-engine/launch', p.session, {packageId: previous?.packageId ?? context.packageId, version: previous?.version ?? context.version, mode: 'normal', binding: p.binding, scoId, confirmed: previous?.consented ?? consent, revision: revision.revision, key: crypto.randomUUID()});
      const current = {...value, packageId: previous?.packageId ?? context.packageId, version: previous?.version ?? context.version, consented: previous?.consented ?? consent};
      activeLaunch.current = current; setLaunch(current); setStatus('SCO loaded; progress is not saved yet.'); setError('');
    });
  }
  async function close() {
    const current = activeLaunch.current;
    if (!current || current.closing || current.navigating) return;
    current.closing = true;
    try {await p.run(async () => {
      const sequence = await new Promise<number>((resolve, reject) => {
        const target = frame.current?.contentWindow;
        const timer = setTimeout(() => {window.removeEventListener('message', message); reject(Error('Final checkpoint is not acknowledged. Retry before closing.'));}, 12_000);
        function message(event: MessageEvent) {
          if (event.source !== target || event.origin !== current.contentOrigin || event.data?.kind !== 'pear-scorm-engine-ready-to-close' || event.data.launchId !== current.launchId || !Number.isSafeInteger(event.data.sequence)) return;
          clearTimeout(timer); window.removeEventListener('message', message); resolve(event.data.sequence);
        }
        window.addEventListener('message', message); target?.postMessage({kind: 'pear-scorm-engine-flush', launchId: current.launchId}, current.contentOrigin);
      });
      const saved = await request<any>('/api/scorm-engine/launches/' + current.launchId, p.session);
      if (saved.sequence !== sequence) throw Error('Final checkpoint is not durable.');
      await request('/api/scorm-engine/launches/' + current.launchId + '/close', p.session, {});
      if (sessionRef.current === p.session && activeLaunch.current === current) {activeLaunch.current = null; setLaunch(null); await refresh(); await p.onSaved();}
    });} finally {current.closing = false;}
  }
  return <section aria-label="Enrolled SCORM player"><p>This package reports completion for this exact enrollment. Every required SCO must meet the published policy.</p>
    {error && <p role="alert">{error}</p>}
    {context?.completed && <p>SCORM completion accepted.</p>}
    <label><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />I consent to SCORM progress tracking for this enrollment.</label>
    <button disabled={p.busy || !!launch || !consent || !context?.activities.some((a: any) => a.available)} onClick={() => {void play();}}>Play or resume enrolled SCORM package</button>
    <nav aria-label="SCORM activities">{context?.activities.filter((a: any) => a.visible !== false).map((a: any) => <button key={a.id} disabled={p.busy || !!launch || !consent || !a.available} onClick={() => {void play(a.id);}}>{a.title} · {a.status}{!a.available && ' · locked'}</button>)}</nav>
    {!launch && context?.retakeAvailable && !context.completed && <fieldset disabled={p.busy}><legend>Fresh SCORM attempt</legend><p>This starts with empty SCO progress and preserves the previous attempt.</p>
      <label><input type="checkbox" checked={retakeConfirmed} onChange={e => setRetakeConfirmed(e.target.checked)} />I confirm starting a fresh SCORM attempt.</label>
      <button disabled={!retakeConfirmed} onClick={() => {void p.run(async () => {
        const current = await request<any>('/api/context?documentId=' + encodeURIComponent('learning:' + p.session.principal.tenant + ':' + p.session.principal.id), p.session);
        await request('/api/scorm-engine/retake', p.session, {registrationId: context.registrationId, attemptId: context.attemptId, confirmed: retakeConfirmed, revision: current.revision, key: crypto.randomUUID()});
        await refresh(); setRetakeConfirmed(false);
      });}}>Start fresh SCORM attempt</button></fieldset>}
    {launch && <><button disabled={p.busy} onClick={() => {void p.run(() => downloadSCORMSupport(p.session, launch.launchId, () => sessionRef.current === p.session && activeLaunch.current === launch));}}>Download SCORM support details</button><iframe ref={frame} title="Isolated SCORM engine player" sandbox="allow-scripts allow-same-origin" src={launch.url} style={{width: '100%', height: '80vh', border: 0}} /><p role="status">{status}</p>
      <button disabled={p.busy} onClick={() => frame.current?.contentWindow?.postMessage({kind: 'pear-scorm-engine-retry', launchId: launch.launchId}, launch.contentOrigin)}>Retry engine checkpoint</button>
      <button disabled={p.busy || launch.navigating || launch.closing} onClick={() => {void close();}}>Close SCO and choose another</button></>}
  </section>;
}
