function u(r,i,m){return new Promise((n,t)=>{const o=setTimeout(()=>t(new Error(m)),i);r.then(e=>{clearTimeout(o),n(e)},e=>{clearTimeout(o),t(e)})})}export{u as promiseWithTimeout};
