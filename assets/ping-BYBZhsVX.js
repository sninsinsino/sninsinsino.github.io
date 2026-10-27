const h=async t=>{let n=4;let r;const m=t.args;for(let e=0;e<m.length;e++){const i=m[e];if(i==="-c"){n=parseInt(m[++e]??"4",10);if(isNaN(n)||n<1)n=4}else if(!i.startsWith("-")){r=i}}if(!r){t.stderr.write("ping: missing host\n");t.stderr.write("Usage: ping [-c count] host\n");return 1}let a=r;if(!a.startsWith("http://")&&!a.startsWith("https://")){a="https://"+a}t.stdout.write(`PING ${r}: ${n} requests
`);const o=[];let d=0;for(let e=0;e<n;e++){if(t.signal.aborted)break;const i=performance.now();try{await fetch(a,{method:"HEAD",mode:"no-cors",signal:t.signal});const s=performance.now()-i;o.push(s);t.stdout.write(`Response from ${r}: time=${s.toFixed(1)}ms
`)}catch{const s=performance.now()-i;if(t.signal.aborted)break;d++;t.stdout.write(`Request to ${r}: timeout (${s.toFixed(1)}ms)
`)}if(e<n-1&&!t.signal.aborted){await new Promise(s=>{const c=setTimeout(s,1e3);const g=()=>{clearTimeout(c);s()};t.signal.addEventListener("abort",g,{once:true})})}}const l=o.length+d;const u=l>0?(d/l*100).toFixed(0):"0";t.stdout.write(`
--- ${r} ping statistics ---
`);t.stdout.write(`${l} packets transmitted, ${o.length} received, ${u}% packet loss
`);if(o.length>0){const e=Math.min(...o);const i=Math.max(...o);const s=o.reduce((c,g)=>c+g,0)/o.length;t.stdout.write(`rtt min/avg/max = ${e.toFixed(1)}/${s.toFixed(1)}/${i.toFixed(1)} ms
`)}return d===l?1:0};export{h as default};
