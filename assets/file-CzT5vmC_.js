import{r as d,e as f}from"./path-DhJOhaQA.js";import{V as c}from"./events-BhE15HtZ.js";const o={".txt":"ASCII text",".md":"Markdown text",".js":"JavaScript source",".ts":"TypeScript source",".json":"JSON data",".html":"HTML document",".css":"CSS stylesheet",".sh":"Shell script",".py":"Python script",".xml":"XML document",".yaml":"YAML data",".yml":"YAML data",".csv":"CSV data",".svg":"SVG image",".png":"PNG image data",".jpg":"JPEG image data",".gif":"GIF image data"};function m(t){for(let s=0;s<Math.min(t.length,512);s++){const e=t[s];if(e===9||e===10||e===13)continue;if(e>=32&&e<=126)continue;if(e>=128)continue;return false}return true}const p=async t=>{if(t.args.length===0){t.stderr.write("file: missing operand\n");return 1}let s=0;for(const e of t.args){const a=d(t.cwd,e);try{const r=t.vfs.stat(a);if(r.type==="directory"){t.stdout.write(`${e}: directory
`);continue}if(r.size===0){t.stdout.write(`${e}: empty
`);continue}const i=f(e);if(i&&o[i]){t.stdout.write(`${e}: ${o[i]}
`);continue}const n=t.vfs.readFile(a);if(m(n)){t.stdout.write(`${e}: ASCII text
`)}else{t.stdout.write(`${e}: data
`)}}catch(r){if(r instanceof c){t.stderr.write(`file: ${e}: ${r.message}
`);s=1}else{throw r}}}return s};export{p as default};
