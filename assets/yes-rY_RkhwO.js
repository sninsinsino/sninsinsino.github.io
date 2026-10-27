const n=async e=>{const t=e.args.length>0?e.args.join(" "):"y";while(!e.signal.aborted){e.stdout.write(t+"\n");await new Promise(a=>setTimeout(a,0))}return 0};export{n as default};
