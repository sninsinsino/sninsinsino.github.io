import{r as n}from"./path-DhJOhaQA.js";import{V as d}from"./events-BhE15HtZ.js";const w=async t=>{if(t.args.length===0){t.stderr.write("stat: missing operand\n");return 1}let o=0;for(const r of t.args){const s=n(t.cwd,r);try{const e=t.vfs.stat(s);const i="0"+e.mode.toString(8);const a=e.type==="directory"?"directory":"regular file";t.stdout.write(`  File: ${r}
`);t.stdout.write(`  Size: ${e.size}	Type: ${a}
`);t.stdout.write(`  Mode: ${i}
`);t.stdout.write(`  Created: ${new Date(e.ctime).toISOString()}
`);t.stdout.write(`  Modified: ${new Date(e.mtime).toISOString()}
`)}catch(e){if(e instanceof d){t.stderr.write(`stat: ${r}: ${e.message}
`);o=1}else{throw e}}}return o};export{w as default};
