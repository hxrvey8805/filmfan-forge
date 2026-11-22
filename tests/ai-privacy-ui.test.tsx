// @vitest-environment jsdom
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {MemoryRouter} from 'react-router-dom';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({viewer:{id:'owner'} as {id:string}|null,rpc:vi.fn(),send:vi.fn(),saved:new Map<string,Record<string,boolean>>()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{rpc:mock.rpc}}));
vi.mock('@/hooks/use-viewer-session',()=>({useViewerSession:()=>mock.viewer}));
import {AIPrivacyProvider,useAIPrivacy} from '../src/components/AIPrivacy';
import {eraseLocalAccount} from '../src/lib/erase-local-account';
function Consumer(){const p=useAIPrivacy();return <><button disabled={!p.ready} onClick={async()=>{if(await p.ensure('companion'))mock.send();}}>Question</button><button disabled={!p.ready} onClick={()=>p.ensure('smart_lists')}>Smart list</button><button onClick={()=>p.withdraw('companion')}>Withdraw</button><output>{String(p.choices.companion===true)}</output></>;}
const tree=()=> <MemoryRouter><AIPrivacyProvider><Consumer/></AIPrivacyProvider></MemoryRouter>;
beforeEach(()=>{mock.viewer={id:'owner'};mock.send.mockReset();mock.saved.clear();mock.rpc.mockReset().mockImplementation(async(name,args)=>{
 const owner=mock.viewer?.id??'',choices={...mock.saved.get(owner)};
 if(name==='set_ai_privacy_choice'){choices[args.p_feature]=args.p_allowed;mock.saved.set(owner,choices);}
 return {data:choices,error:null};
});});afterEach(()=>{cleanup();localStorage.clear();});
it('does not send until explicit consent is saved, and Not now spends nothing',async()=>{
 render(tree());await waitFor(()=>expect((screen.getByText('Question')as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('Question'));
 expect(screen.getByRole('dialog',{name:'Meet your AI Geek'})).toBeTruthy();expect(screen.getByText('OpenRouter and OpenAI')).toBeTruthy();expect(mock.send).not.toHaveBeenCalled();fireEvent.click(screen.getByText('Not now'));expect(mock.send).not.toHaveBeenCalled();
 fireEvent.click(screen.getByText('Question'));fireEvent.click(screen.getByText('Allow and continue'));await waitFor(()=>expect(mock.send).toHaveBeenCalledTimes(1));
 expect(mock.rpc).toHaveBeenCalledWith('set_ai_privacy_choice',{p_feature:'companion',p_allowed:true,p_version:'2026-11-17'});
 fireEvent.click(screen.getByText('Withdraw'));await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('false'));
 fireEvent.click(screen.getByText('Question'));expect(screen.getByText('Allow and continue')).toBeTruthy();expect(mock.send).toHaveBeenCalledTimes(1);
});
it('remembers consent for later questions, reopening the app and signing back into the same account',async()=>{
 let view=render(tree());await waitFor(()=>expect((screen.getByText('Question')as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByText('Question'));fireEvent.click(screen.getByText('Allow and continue'));
 await waitFor(()=>expect(mock.send).toHaveBeenCalledTimes(1));
 fireEvent.click(screen.getByText('Question'));await waitFor(()=>expect(mock.send).toHaveBeenCalledTimes(2));expect(screen.queryByRole('dialog')).toBeNull();
 view.unmount();view=render(tree());await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('true'));
 fireEvent.click(screen.getByText('Question'));await waitFor(()=>expect(mock.send).toHaveBeenCalledTimes(3));expect(screen.queryByRole('dialog')).toBeNull();
 await act(async()=>{mock.viewer=null;view.rerender(tree());});expect(screen.getByRole('status').textContent).toBe('false');
 await act(async()=>{mock.viewer={id:'owner'};view.rerender(tree());});await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('true'));
 fireEvent.click(screen.getByText('Question'));await waitFor(()=>expect(mock.send).toHaveBeenCalledTimes(4));expect(screen.queryByRole('dialog')).toBeNull();
 expect(mock.rpc.mock.calls.filter(([name])=>name==='set_ai_privacy_choice')).toHaveLength(1);
});
it('does not share remembered permission with another account or the other AI feature',async()=>{
 mock.saved.set('owner',{companion:true});const view=render(tree());await waitFor(()=>expect(screen.getByRole('status').textContent).toBe('true'));
 fireEvent.click(screen.getByText('Smart list'));expect(screen.getByRole('dialog',{name:'Let Geek sort it'})).toBeTruthy();expect(screen.getByText('OpenRouter and Baidu (ERNIE)')).toBeTruthy();
 fireEvent.click(screen.getByText('Not now'));
 await act(async()=>{mock.viewer={id:'other'};view.rerender(tree());});await waitFor(()=>expect((screen.getByText('Question')as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByText('Question'));expect(screen.getByRole('dialog',{name:'Meet your AI Geek'})).toBeTruthy();expect(mock.send).not.toHaveBeenCalled();
 expect(mock.saved.get('owner')).toEqual({companion:true});
});
it('keeps essential sharing details visible while fuller privacy information is expandable',async()=>{
 render(tree());await waitFor(()=>expect((screen.getByText('Question')as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('Question'));
 const dialog=screen.getByRole('dialog');expect(dialog.getAttribute('aria-describedby')).toBeTruthy();
 expect(screen.getByText(/To answer at your viewing point/).textContent).toContain('timestamp and relevant story/chat context');
 const details=screen.getByText('Privacy details').closest('details');expect(details?.open).toBe(false);
 fireEvent.click(screen.getByText('Privacy details'));expect(details?.open).toBe(true);
 expect(screen.getByRole('link',{name:'Read the privacy notice'}).getAttribute('href')).toBe('/privacy');
 expect(mock.send).not.toHaveBeenCalled();
});
it('fails closed when saving consent fails',async()=>{
 render(tree());await waitFor(()=>expect((screen.getByText('Question')as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('Question'));
 mock.rpc.mockResolvedValue({data:null,error:'failure'});fireEvent.click(screen.getByText('Allow and continue'));await screen.findByRole('alert');expect(mock.send).not.toHaveBeenCalled();
});
it('cancels a pending choice when switching accounts',async()=>{
 const view=render(tree());await waitFor(()=>expect((screen.getByText('Question')as HTMLButtonElement).disabled).toBe(false));fireEvent.click(screen.getByText('Question'));
 await act(async()=>{mock.viewer={id:'other'};view.rerender(tree());});expect(screen.queryByText('Allow and continue')).toBeNull();expect(mock.send).not.toHaveBeenCalled();
});
it('erases only the selected viewer’s device records',()=>{
 const removed=['cinegeek.room.v1.owner','cinegeek.position.v1.owner.tv.1','cinegeek.home-lists.v1.owner.legacy-backup','cinegeek.xp.pending.owner.pack'];
 const kept=['cinegeek.room.v1.other','cinegeek.room.v1.owner-extra','another-app.owner'];
 for(const k of [...removed,...kept])localStorage.setItem(k,'value');eraseLocalAccount('owner');
 for(const k of removed)expect(localStorage.getItem(k)).toBeNull();for(const k of kept)expect(localStorage.getItem(k)).toBe('value');
});
