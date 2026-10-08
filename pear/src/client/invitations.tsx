import React, {useEffect, useState} from 'react';
import {request, type Session} from './api.ts';
import {translateUI as t, formatUIDate} from './i18n.ts';

export function Invitations(p: {session: Session; busy: boolean; tick: number; isCurrent: () => boolean; run: (fn: () => Promise<void>) => Promise<boolean>}) {
  const [data, setData] = useState<any>(null), [offset, setOffset] = useState(0), [refresh, setRefresh] = useState(0), [error, setError] = useState(''), [notice, setNotice] = useState(''), [selected, setSelected] = useState<string[]>([]);
  const [userId, setUser] = useState(''), [subject, setSubject] = useState(''), [recipient, setRecipient] = useState(''), [days, setDays] = useState(1), [reason, setReason] = useState('');
  useEffect(() => {
    let active = true;
    void request<any>('/api/invitations?offset=' + offset, p.session).then(r => {if (active && p.isCurrent()) {setData(r); setError('');}}).catch(e => {if (active && p.isCurrent()) setError(e.message);});
    return () => {active = false;};
  }, [offset, refresh, p.tick]);
  const sendable=data?.items.filter((row:any)=>selected.includes(row.id)&&row.state==='pending'&&row.delivery!=='accepted')??[];
  const change = async (args: any) => {
    const context = await request<any>('/api/context?documentId=' + encodeURIComponent('library:' + p.session.principal.tenant), p.session);
    await request('/api/invitations', p.session, {...args, revision: context.revision, key: crypto.randomUUID()});
    if (p.isCurrent()) {setRefresh(n => n + 1); setNotice(t('Invitation saved.'));}
  };
  return <section className="panel" aria-label={t('User invitations')}>
    <h2>{t('User invitations')}</h2>
    <p>{t('Create the user in People first. The invited person must sign in with the exact organization identity you review here. A link alone does not grant access.')}</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    {data && !data.configured && <p>{t('Configure organization SSO before creating invitations.')}</p>}
    {data && !data.mailConfigured && <p>{t('Email transport is not configured. Invitation links can be shared manually; no email has been sent.')}</p>}
    <form aria-label={t('Invitation editor')} onSubmit={e => {e.preventDefault(); void p.run(() => change({action: 'create', userId, subject, recipient, expiresInDays: days, reason}));}}>
      <fieldset disabled={p.busy || !data?.configured}>
        <label>{t('Invited account ID')}<input required maxLength={64} pattern="[A-Za-z0-9_-]+" value={userId} onChange={e => setUser(e.target.value)}/></label>
        <label>{t('Invited issuer subject')}<input required maxLength={255} value={subject} onChange={e => setSubject(e.target.value)}/></label>
        <label>{t('Invitation email')}<input required type="email" maxLength={254} value={recipient} onChange={e => setRecipient(e.target.value)}/></label>
        <label>{t('Invitation expiry in days')}<input required type="number" min={1} max={30} value={days} onChange={e => setDays(Number(e.target.value))}/></label>
        <label>{t('Invitation review reason')}<input required maxLength={300} value={reason} onChange={e => setReason(e.target.value)}/></label>
        <button>{t('Create reviewed invitation')}</button>
      </fieldset>
    </form>
    <button disabled={p.busy || !data?.mailConfigured || sendable.length===0} onClick={()=>{
      const rows=[...sendable];
      if(window.confirm(t('Send welcome emails to selected recipients') + '?\n' + rows.map((r:any)=>r.recipient).join('\n')))void p.run(async()=>{
        let accepted=0,failed=0;
        for(const row of rows){
          if(!p.isCurrent())return;
          try{await request('/api/invitations/'+row.id+'/send',p.session,{});accepted++;}
          catch{failed++;}
        }
        if(p.isCurrent()){setSelected([]);setRefresh(n=>n+1);setNotice(t('Email transport results')+': '+accepted+' '+t('accepted by transport')+', '+failed+' '+t('failed to send')+'. '+t('Recipient delivery is not verified.'));}
      });
    }}>{t('Send selected welcome emails')} ({sendable.length})</button>
    {data?.items.map((row: any) => <section className="learning-row" key={row.id}>
      <div style={{overflowWrap: 'anywhere', minWidth: 0}}>
        <h3>{row.userId}</h3>{row.state==='pending'&&row.delivery!=='accepted'&&<label><input type="checkbox" aria-label={t('Select invitation')+' '+row.recipient} checked={selected.includes(row.id)} disabled={p.busy||!data.mailConfigured} onChange={e=>setSelected(ids=>e.target.checked?[...ids,row.id]:ids.filter(id=>id!==row.id))}/>{t('Select invitation')}</label>}<p>{row.recipient} · {t(({pending:'Invitation pending',accepted:'Invitation accepted',revoked:'Invitation revoked',expired:'Invitation expired',unavailable:'Invitation unavailable'} as Record<string,string>)[row.state])} · {t(({unsent:'Email not sent',sending:'Email sending',accepted:'Email accepted by transport',failed:'Email transport failed'} as Record<string,string>)[row.delivery])} · {formatUIDate(row.expiresAt)}</p>
        {row.state === 'pending' && <a href={row.url}>{t('Invitation link')}</a>}
      </div>
      <div className="actions">
        {row.state === 'pending' && <button disabled={p.busy || !data.mailConfigured || row.delivery === 'accepted'} onClick={() => {
          if (window.confirm(t('Send welcome email to') + ' ' + row.recipient + '?')) void p.run(async () => {
            await request('/api/invitations/' + row.id + '/send', p.session, {});
            if (p.isCurrent()) {setRefresh(n => n + 1); setNotice(t('Email accepted by transport; recipient delivery is not verified.'));}
          });
        }}>{t('Send welcome email')}</button>}
        {['pending', 'expired', 'unavailable'].includes(row.state) && <button disabled={p.busy} onClick={() => void p.run(() => change({action: 'revoke', invitationId: row.id, reason: 'Human revoked invitation'}))}>{t('Revoke invitation')}</button>}
      </div>
    </section>)}
    <div className="actions"><button disabled={p.busy || offset === 0} onClick={() => {setSelected([]);setOffset(Math.max(0, offset - 20));}}>{t('Previous invitations')}</button><button disabled={p.busy || data?.nextOffset == null} onClick={() => {setSelected([]);setOffset(data.nextOffset);}}>{t('Next invitations')}</button></div>
  </section>;
}
