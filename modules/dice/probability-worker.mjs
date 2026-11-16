import {MonteCarlo} from '../../lib/@swrpg-online/monte-carlo/dist/index.esm.js';

self.addEventListener('message',event=>{
  const {id,options}=event.data;
  try{self.postMessage({id,probability:new MonteCarlo(options).simulate().successProbability});}
  catch(error){self.postMessage({id,error:error.message});}
});
