import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { recovery } from './password-recovery';

let started=false;
export async function startNativeRecoveryLinks(){
  if(started || Capacitor.getPlatform()!=='ios')return;
  started=true;
  let receivedEvent=false,lastUrl:string|undefined,lastReceived=0;
  const receive=(url:string)=>{
    if(url===lastUrl && Date.now()-lastReceived<1000)return true;
    if(!recovery.receiveLink(url))return false;
    lastUrl=url;lastReceived=Date.now();return true;
  };
  try{
    // Subscribe before checking a cold launch to cover the startup race. Never
    // print the URL: it can contain the single-use recovery credential.
    await App.addListener('appUrlOpen',({url})=>{if(receive(url))receivedEvent=true;});
    const launch=await App.getLaunchUrl();
    if(launch?.url && !receivedEvent)receive(launch.url);
  }catch{
    // Ordinary sign-in remains usable if the native link bridge is unavailable.
    started=false;
  }
}
