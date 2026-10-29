import{r as l}from"./lifo-Dptx2yRk.js";import"./index-Cjn3rT7F.js";import"./extensions-BQXoq6hb.js";import"./preload-helper-Dx40qi2-.js";const u=async e=>{let i;let n=false;let s;const a=e.args;for(let t=0;t<a.length;t++){const r=a[t];switch(r){case"-O":i=a[++t]??"";break;case"-q":case"--quiet":n=true;break;default:if(!r.startsWith("-")){s=r}break}}if(!s){e.stderr.write("wget: missing URL\n");e.stderr.write("Usage: wget [-O file] [-q] url\n");return 1}if(!s.startsWith("http://")&&!s.startsWith("https://")){s="https://"+s}if(!i){try{const t=new URL(s);const r=t.pathname.split("/").filter(Boolean);i=r.length>0?r[r.length-1]:"index.html"}catch{i="index.html"}}if(!n){e.stderr.write(`--  ${s}
`);e.stderr.write(`Connecting... `)}try{const t=await fetch(s,{signal:e.signal});if(!n){e.stderr.write(`connected.
`);e.stderr.write(`HTTP request sent, awaiting response... ${t.status} ${t.statusText}
`)}const r=await t.text();const o=l(e.cwd,i);e.vfs.writeFile(o,r);if(!n){e.stderr.write(`Saving to: '${i}'
`);e.stderr.write(`${r.length} bytes saved.
`)}return t.ok?0:1}catch(t){const r=t instanceof Error?t.message:String(t);if(!n){e.stderr.write(`failed.
`)}if(r.includes("Failed to fetch")||r.includes("NetworkError")||r.includes("CORS")){e.stderr.write(`wget: unable to connect to ${s}
`);e.stderr.write(`Note: This may be a CORS restriction. The target server must allow cross-origin requests.
`)}else{e.stderr.write(`wget: ${r}
`)}return 1}};export{u as default};
