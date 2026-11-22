// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import Index from '../src/pages/Index';
import { AIPrivacyProvider } from '../src/components/AIPrivacy';
import { supabase as preview } from '../src/preview/client';
import { completeOnboarding } from '../src/lib/onboarding-service';
import { homeListKey } from '../src/lib/home-list-storage';

vi.mock('@/integrations/supabase/client', async () => import('../src/preview/client'));
const title = {id:335984,title:'Blade Runner 2049',type:'movie' as const,posterPath:'',year:2017};
let owner: string;
const add = (list_type: string) => preview.from('user_titles').insert({user_id:owner,title_id:title.id,
  title:title.title,type:title.type,poster_path:'',year:2017,progress:37,list_type});
const records = async () => (await preview.from('user_titles').select().eq('user_id',owner).eq('title_id',title.id)).data;
const shelves = async () => (await records()).map(row => row.list_type).sort();
beforeEach(async () => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  owner = (await preview.auth.signInWithPassword()).data.user.id;
  await preview.from('user_titles').delete().eq('title_id',title.id);
  await add('watchlist');
});
afterEach(async () => {cleanup();vi.unstubAllGlobals();localStorage.clear();await preview.auth.signOut();});
async function home() {
  render(<MemoryRouter><AIPrivacyProvider><Index/></AIPrivacyProvider></MemoryRouter>);
  await screen.findByRole('tablist',{name:'Library shelves'});
}
function tab(name:string) { fireEvent.mouseDown(screen.getByRole('tab',{name}),{button:0}); }
async function searchAdd(shelf:string,button:string) {
  tab(shelf); fireEvent.click(screen.getByRole('button',{name:button}));
  const modal = screen.getByRole('dialog');
  fireEvent.change(within(modal).getByRole('textbox'),{target:{value:'Blade Runner'}});
  const result = await within(modal).findByRole('button',{name:/Blade Runner 2049/});
  await act(async () => { fireEvent.click(result); });
}
async function choose(target:string) {
  fireEvent.click(within(screen.getByRole('tabpanel')).getByRole('button',{name:'Options for Blade Runner 2049'}));
  await act(async () => {fireEvent.click(within(screen.getByRole('dialog',{name:title.title})).getByRole('button',{name:target}));});
}

it('adding through search moves Watchlist to Watching and refreshes both shelves with progress', async () => {
  await home(); await searchAdd('Watching','Add to Currently Watching');
  expect(await shelves()).toEqual(['watching']);
  expect((await records())[0].progress).toBe(37);
  expect(within(screen.getByRole('tabpanel')).getByRole('button',{name:'Open Blade Runner 2049'})).toBeTruthy();
  tab('Watch list');
  expect(within(screen.getByRole('tabpanel')).queryByRole('button',{name:'Open Blade Runner 2049'})).toBeNull();
});
it('adding to Favourites through search removes the Watchlist copy', async () => {
  await home(); await searchAdd('Favourites','Add to Favourites');
  expect(await shelves()).toEqual(['favourite']);
  tab('Watch list'); expect(within(screen.getByRole('tabpanel')).queryByRole('button',{name:'Open Blade Runner 2049'})).toBeNull();
});
it('three-dot actions keep Watching + Favourites, then Watched + Favourites; Watchlist replaces both', async () => {
  await add('watching'); await home(); tab('Watching');
  await choose('Favourites');
  expect(await shelves()).toEqual(['favourite','watching']);
  expect(within(screen.getByRole('tabpanel')).getByRole('button',{name:'Open Blade Runner 2049'})).toBeTruthy();
  await choose('Watched');
  expect(await shelves()).toEqual(['favourite','watched']);
  tab('Favourites'); await choose('Watch list');
  expect(await shelves()).toEqual(['watchlist']);
  expect(within(screen.getByRole('tabpanel')).queryByRole('button',{name:'Open Blade Runner 2049'})).toBeNull();
});
it('adding Watched through search ends Watching but preserves Favourites and every My Lists copy', async () => {
  await add('watching'); await add('favourite');
  const lists = [{id:'mine',name:'My picks',mode:'manual',titles:[title]},
    {id:'another',name:'Another list',mode:'manual',titles:[title]}];
  localStorage.setItem(homeListKey(owner),JSON.stringify(lists));
  await home(); await searchAdd('Watched','Add to Watched');
  expect(await shelves()).toEqual(['favourite','watched']);
  expect(JSON.parse(localStorage.getItem(homeListKey(owner))!)).toEqual(lists);
  tab('Watching'); expect(within(screen.getByRole('tabpanel')).queryByRole('button',{name:'Open Blade Runner 2049'})).toBeNull();
});
it('adding from a custom list follows the shelf rules without affecting any other custom list', async () => {
  localStorage.setItem(homeListKey(owner),JSON.stringify([
    {id:'mine',name:'My picks',mode:'manual',titles:[title]},
    {id:'another',name:'Another list',mode:'manual',titles:[title]},
  ]));
  await home();fireEvent.click(screen.getByRole('button',{name:'My picks'}));
  fireEvent.click(within(document.getElementById('my-lists')!).getByRole('button',{name:'Options for Blade Runner 2049'}));
  await act(async () => fireEvent.click(within(screen.getByRole('dialog',{name:title.title})).getByRole('button',{name:'Watching'})));
  expect(await shelves()).toEqual(['watching']);
  const saved=JSON.parse(localStorage.getItem(homeListKey(owner))!);
  expect(saved[0].titles).toEqual([]); expect(saved[1].titles).toEqual([title]);
});
it('onboarding and its retry apply the same exclusive status without removing Favourites', async () => {
  await add('watched'); await add('favourite');
  await completeOnboarding(owner,[title]); await completeOnboarding(owner,[title]);
  await waitFor(async () => expect(await shelves()).toEqual(['favourite','watching']));
});

it.each(['Blade Runner 2049','Eraserhead','Peaky Blinders'])('top search opens %s in Ask your Geek without adding or moving any title', async name => {
  await add('watched'); await add('favourite');
  const before = (await preview.from('user_titles').select().eq('user_id',owner)).data;
  await home();
  const selectedTab = screen.getByRole('tab',{selected:true}).textContent;
  fireEvent.click(screen.getByRole('button',{name:'Find a title to ask your geek'}));
  const search = screen.getByRole('dialog',{name:'Ask your geek'});
  fireEvent.change(within(search).getByRole('textbox'),{target:{value:name}});
  const result = await within(search).findByRole('button',{name:new RegExp(name)});
  await act(async () => fireEvent.click(result));
  const setup = screen.getByRole('dialog',{name});
  expect(within(setup).getByRole('button',{name:'Enter room'})).toBeTruthy();
  expect(within(setup).getByLabelText('Your position')).toBeTruthy();
  expect((await preview.from('user_titles').select().eq('user_id',owner)).data).toEqual(before);
  expect(document.querySelector('[role="tab"][aria-selected="true"]')?.textContent).toBe(selectedTab);
});
