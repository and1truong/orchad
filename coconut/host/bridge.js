(async()=>{
 const r=__REQUEST__;
 if(r.nonce&&r.nonce!==window.__coconutNonce)return;
 let result;
 try{
  const bridge=window.agentBridgeV1;
  if(!bridge)throw Error('UNSUPPORTED');
  if(r.op==='describe'||r.op==='getContext')result={ok:true,revision:null,data:await bridge[r.op](),error:null};
  else if(r.op==='invoke')result=await bridge.invoke(r.call);
  else throw Error('UNSUPPORTED');
 }catch(e){result={ok:false,revision:null,data:null,error:{code:String(e).includes('UNSUPPORTED')?'UNSUPPORTED':'INTERNAL',message:String(e),retryable:false}};}
 await window.__TAURI_INTERNALS__.invoke('guest_reply',{id:r.id,result,documentNonce:window.__coconutNonce});
})()
