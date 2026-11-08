export const number=(value=0)=>Math.floor(value).toLocaleString('en-US');
export const compact=(value=0)=>value>=1e6?`${(value/1e6).toFixed(1)}m`:value>=1000?`${(value/1000).toFixed(1)}k`:number(value);
export const clock=(value=0)=>`${String(Math.floor(Math.max(0,value)/60)).padStart(2,'0')}:${String(Math.floor(Math.max(0,value)%60)).padStart(2,'0')}`;
export function downloadJSON(data,name){const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
export async function request(path,token='',options={}){
  const response=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(token?{'x-admin-key':token}:{}),...options.headers}});
  let data;try{data=await response.json();}catch{throw Error('The runner returned an unreadable response.');}
  if(!response.ok)throw Error(data.error||`Request failed (${response.status}).`);return data;
}
