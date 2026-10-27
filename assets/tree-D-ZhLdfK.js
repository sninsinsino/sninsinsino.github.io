import{r as C}from"./path-DhJOhaQA.js";import{V as I}from"./events-BhE15HtZ.js";const V=async t=>{let f=Infinity;let a=false;let o=".";for(let e=0;e<t.args.length;e++){const s=t.args[e];if(s==="-L"&&e+1<t.args.length){f=parseInt(t.args[++e],10)}else if(s==="-d"){a=true}else if(!s.startsWith("-")){o=s}}const c=C(t.cwd,o);let i=0;let m=0;function d(e,s,u){if(u>f)return;try{const g=t.vfs.readdir(e);const p=a?g.filter(r=>r.type==="directory"):g;const l=p.sort((r,n)=>r.name.localeCompare(n.name));for(let r=0;r<l.length;r++){const n=l[r];const y=r===l.length-1;const w=y?"└── ":"├── ";t.stdout.write(s+w+n.name+"\n");if(n.type==="directory"){i++;const $=s+(y?"    ":"│   ");const v=e==="/"?"/"+n.name:e+"/"+n.name;d(v,$,u+1)}else{m++}}}catch{}}try{t.vfs.stat(c)}catch(e){if(e instanceof I){t.stderr.write(`tree: '${o}': ${e.message}
`);return 1}throw e}t.stdout.write(o+"\n");d(c,"",1);const h=a?`
${i} directories
`:`
${i} directories, ${m} files
`;t.stdout.write(h);return 0};export{V as default};
