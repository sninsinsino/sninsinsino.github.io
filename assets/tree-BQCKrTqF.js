import{r as C,V as I}from"./lifo-CcGkS150.js";import"./index-CTt8OI8K.js";import"./extensions-BQXoq6hb.js";import"./preload-helper-Dx40qi2-.js";const D=async e=>{let f=Infinity;let i=false;let o=".";for(let t=0;t<e.args.length;t++){const s=e.args[t];if(s==="-L"&&t+1<e.args.length){f=parseInt(e.args[++t],10)}else if(s==="-d"){i=true}else if(!s.startsWith("-")){o=s}}const c=C(e.cwd,o);let a=0;let m=0;function d(t,s,u){if(u>f)return;try{const g=e.vfs.readdir(t);const p=i?g.filter(r=>r.type==="directory"):g;const l=p.sort((r,n)=>r.name.localeCompare(n.name));for(let r=0;r<l.length;r++){const n=l[r];const y=r===l.length-1;const w=y?"└── ":"├── ";e.stdout.write(s+w+n.name+"\n");if(n.type==="directory"){a++;const $=s+(y?"    ":"│   ");const v=t==="/"?"/"+n.name:t+"/"+n.name;d(v,$,u+1)}else{m++}}}catch{}}try{e.vfs.stat(c)}catch(t){if(t instanceof I){e.stderr.write(`tree: '${o}': ${t.message}
`);return 1}throw t}e.stdout.write(o+"\n");d(c,"",1);const h=i?`
${a} directories
`:`
${a} directories, ${m} files
`;e.stdout.write(h);return 0};export{D as default};
