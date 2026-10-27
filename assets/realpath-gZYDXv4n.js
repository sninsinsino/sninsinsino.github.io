import{r as o}from"./path-DhJOhaQA.js";import{V as n}from"./events-BhE15HtZ.js";const d=async r=>{if(r.args.length===0){r.stderr.write("realpath: missing operand\n");return 1}let t=0;for(const s of r.args){const a=o(r.cwd,s);try{r.vfs.stat(a);r.stdout.write(a+"\n")}catch(e){if(e instanceof n){r.stderr.write(`realpath: ${s}: ${e.message}
`);t=1}else{throw e}}}return t};export{d as default};
