import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';

// Intentionally address loopback and the demo project only.
const documents='http://127.0.0.1:18189/v1/projects/demo-orcinal-release/databases/(default)/documents';
const accounts='http://127.0.0.1:19119/identitytoolkit.googleapis.com/v1/accounts:';
async function account() {
  const r=await fetch(accounts+'signUp?key=demo-orcinal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:randomUUID()+'@example.test',password:randomUUID(),returnSecureToken:true})});
  assert.equal(r.status,200);return r.json();
}
const [owner,other]=await Promise.all([account(),account()]);
const url=documents+'/profiles/'+owner.localId;
const values = list => ({arrayValue:{values:list.map(stringValue=>({stringValue}))}});
function request(method,token,fields,target=url) {
  return fetch(target,{method,headers:{...(token?{Authorization:'Bearer '+token}:{}),'Content-Type':'application/json'},...(fields?{body:JSON.stringify({fields})}:{})});
}
try {
  assert.equal((await request('PATCH',owner.idToken,{sizes:values(['44.5','45']),favorites:values(['a'.repeat(20)])})).status,200);
  assert.equal((await request('GET',owner.idToken)).status,200);
  for(const token of [null,other.idToken]){
    for(const method of ['GET','PATCH','DELETE'])assert.equal((await request(method,token,method==='PATCH'?{sizes:values([])}:null)).status,403);
  }
  assert.equal((await request('GET',owner.idToken,null,documents+'/profiles')).status,403);
  for(const fields of [{sizes:values(['41','42','43','44'])},{favorites:values(Array(81).fill('x'))},{role:{stringValue:'admin'}}])assert.equal((await request('PATCH',owner.idToken,fields)).status,403);
  assert.equal((await request('DELETE',owner.idToken)).status,200);
  assert.equal((await request('GET',owner.idToken)).status,404);
  console.log('Profile persistence, private reads, ownership, listing, limits and deletion passed.');
} finally {
  for(const {idToken} of [owner,other]) await fetch(accounts+'delete?key=demo-orcinal',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({idToken})});
}
