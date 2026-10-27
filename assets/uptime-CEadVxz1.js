const u=async e=>{const r=performance.now();const s=Math.floor(r/1e3);const t=Math.floor(s/3600);const n=Math.floor(s%3600/60);const c=s%60;const o=[];if(t>0)o.push(`${t} hour${t!==1?"s":""}`);if(n>0)o.push(`${n} minute${n!==1?"s":""}`);o.push(`${c} second${c!==1?"s":""}`);e.stdout.write(`up ${o.join(", ")}
`);return 0};export{u as default};
