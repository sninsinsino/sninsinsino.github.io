import{r as f}from"./path-DhJOhaQA.js";import{V as h}from"./events-BhE15HtZ.js";async function l(t){const a=await crypto.subtle.digest("SHA-256",t);const o=new Uint8Array(a);let r="";for(let e=0;e<o.length;e++){r+=o[e].toString(16).padStart(2,"0")}return r}const $=async t=>{let a=0;let o=false;const r=[];for(const e of t.args){if(e==="-c"||e==="--check"){o=true}else{r.push(e)}}if(o&&r.length>0){const e=f(t.cwd,r[0]);let n;try{n=t.vfs.readFileString(e)}catch(s){if(s instanceof h){t.stderr.write(`sha256sum: ${r[0]}: ${s.message}
`);return 1}throw s}for(const s of n.trim().split("\n")){const i=s.match(/^([0-9a-f]{64})\s+(.+)$/);if(!i)continue;const[,d,c]=i;const u=f(t.cwd,c);try{const m=t.vfs.readFile(u);const w=await l(m);if(w===d){t.stdout.write(`${c}: OK
`)}else{t.stdout.write(`${c}: FAILED
`);a=1}}catch{t.stdout.write(`${c}: FAILED open or read
`);a=1}}return a}if(r.length===0){t.stderr.write("Usage: sha256sum [-c FILE] FILE...\n");t.stderr.write("Compute or verify SHA-256 checksums.\n");return 1}for(const e of r){const n=f(t.cwd,e);try{const s=t.vfs.readFile(n);const i=await l(s);t.stdout.write(`${i}  ${e}
`)}catch(s){if(s instanceof h){t.stderr.write(`sha256sum: ${e}: ${s.message}
`);a=1}else{throw s}}}return a};export{$ as default};
