import{r as a}from"./path-DhJOhaQA.js";import{V as n}from"./events-BhE15HtZ.js";const m=async r=>{if(r.args.length===0){r.stderr.write("touch: missing operand\n");return 1}let o=0;for(const s of r.args){const t=a(r.cwd,s);try{r.vfs.touch(t)}catch(e){if(e instanceof n){r.stderr.write(`touch: ${s}: ${e.message}
`);o=1}else{throw e}}}return o};export{m as default};
