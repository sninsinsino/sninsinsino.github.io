const i={1:"A",2:"NS",5:"CNAME",6:"SOA",15:"MX",16:"TXT",28:"AAAA"};const u=async e=>{let n="A";let o;for(const s of e.args){if(s.startsWith("-")||s.startsWith("+"))continue;const t=s.toUpperCase();if(["A","AAAA","CNAME","MX","NS","TXT","SOA"].includes(t)){n=t}else{o=s}}if(!o){e.stderr.write("dig: missing domain\n");e.stderr.write("Usage: dig [type] domain\n");return 1}const a=`https://dns.google/resolve?name=${encodeURIComponent(o)}&type=${n}`;try{const s=await fetch(a,{headers:{Accept:"application/dns-json"},signal:e.signal});if(!s.ok){e.stderr.write(`dig: DNS query failed (HTTP ${s.status})
`);return 1}const t=await s.json();e.stdout.write(`; <<>> Lifo dig <<>> ${n} ${o}
`);e.stdout.write(`;; Got answer:
`);e.stdout.write(`;; ->>HEADER<<- status: ${t.Status===0?"NOERROR":"NXDOMAIN"}
`);e.stdout.write(`
`);if(t.Question&&t.Question.length>0){e.stdout.write(`;; QUESTION SECTION:
`);for(const r of t.Question){e.stdout.write(`;${r.name}.		IN	${i[r.type]??r.type}
`)}e.stdout.write(`
`)}if(t.Answer&&t.Answer.length>0){e.stdout.write(`;; ANSWER SECTION:
`);for(const r of t.Answer){const d=i[r.type]??String(r.type);e.stdout.write(`${r.name}.	${r.TTL}	IN	${d}	${r.data}
`)}e.stdout.write(`
`)}else{e.stdout.write(`;; No answers found.

`)}e.stdout.write(`;; SERVER: dns.google
`);return 0}catch(s){const t=s instanceof Error?s.message:String(s);if(t.includes("Failed to fetch")||t.includes("NetworkError")){e.stderr.write(`dig: connection to DNS server failed
`);e.stderr.write(`Note: This may be a CORS restriction or network issue.
`)}else{e.stderr.write(`dig: ${t}
`)}return 1}};export{u as default};
