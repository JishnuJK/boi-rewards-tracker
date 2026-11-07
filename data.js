'use strict';
window.BoiData = (() => {
  const empty=()=>({months:{},actual:{},settings:{slab:true,extra:true,star:true}});
  const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
  function validate(v) {
    if(v===null)return empty();
    if(!object(v)||!object(v.months))throw Error('Invalid backup structure');
    const out=empty(); let count=0;
    const month=m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m);
    for(const [m,rows] of Object.entries(v.months)) {
      if(!month(m)||!Array.isArray(rows))throw Error('Invalid month');
      const ids=new Set();
      out.months[m]=rows.map(t=>{
        if(!object(t)||typeof t.id!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(t.id)||ids.has(t.id)||typeof t.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(t.date)||!t.date.startsWith(m+'-')||new Date(t.date+'T00:00:00Z').toISOString().slice(0,10)!==t.date||!Number.isFinite(t.amount)||t.amount<=0||t.amount>1e10)throw Error('Invalid transaction');
        ids.add(t.id); if(++count>10000)throw Error('Too many transactions');
        return {id:t.id,date:t.date,amount:t.amount};
      });
    }
    if(v.actual!==undefined&&!object(v.actual))throw Error('Invalid credited rewards');
    for(const [m,a] of Object.entries(v.actual||{})) {
      if(!month(m)||!object(a))throw Error('Invalid credited rewards');
      out.actual[m]={};
      for(const k of ['debit','slab','star','other']) if(a[k]!==undefined){if(!Number.isFinite(a[k])||a[k]<0||a[k]>1e10)throw Error('Invalid points');out.actual[m][k]=a[k];}
    }
    if(v.settings!==undefined&&!object(v.settings))throw Error('Invalid assumptions');
    for(const k of ['slab','extra','star']) if(v.settings?.[k]!==undefined){if(typeof v.settings[k]!=='boolean')throw Error('Invalid assumption');out.settings[k]=v.settings[k];}
    if(JSON.stringify(out).length>2000000)throw Error('Backup exceeds 2 MB');
    return out;
  }
  function download(v,name='boi-rewards-backup') {
    const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify(validate(v),null,2)],{type:'application/json'}));
    a.href=url;a.download=name+'-'+new Date().toISOString().replace(/[:.]/g,'-')+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  return {empty,validate,download};
})();
