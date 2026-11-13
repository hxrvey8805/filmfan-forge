// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { HomeLists } from '../src/components/HomeLists';
import { listMetadata } from '../src/lib/list-metadata';
import { findListCategories } from '../src/lib/list-catalogue';
import { homeListKey, readLists } from '../src/lib/home-list-storage';
import type { LibraryShelf } from '../src/lib/list-sources';
vi.mock('../src/lib/list-metadata',()=>({listMetadata:vi.fn()}));
vi.mock('../src/lib/list-catalogue', async original => ({...await original<typeof import('../src/lib/list-catalogue')>(),findListCategories:vi.fn()}));
vi.mock('../src/components/SearchModal',()=>({default:()=>null}));
vi.mock('../src/components/PosterRow',()=>({default:({items,onPosterClick}:any)=><div>{items.map((t:any)=><button key={t.type+':'+t.id} onClick={()=>onPosterClick(t)}>{t.title}</button>)}</div>}));
const anime={id:1,type:'movie' as const,title:'Romantic anime fixture',posterPath:'',year:2016};
const cartoon={id:2,type:'movie' as const,title:'Other animation fixture',posterPath:''};
const outside={id:3,type:'movie' as const,title:'Unselected anime fixture',posterPath:''};
const shelves:LibraryShelf[]=[{id:'watch',name:'Watch list',mode:'shelf',titles:[anime,cartoon]},{id:'fav',name:'Favourites',mode:'shelf',titles:[outside]}];
const facts=new Map([['movie:1',{genres:['romantic anime film'],directors:[],minutes:[89]}],['movie:2',{genres:['animated comedy film'],directors:[],minutes:[89]}],['movie:3',{genres:['romantic anime film'],directors:[],minutes:[89]}]]);
beforeEach(()=>{localStorage.clear();vi.stubGlobal('ResizeObserver',class {observe(){}disconnect(){}unobserve(){}});vi.mocked(listMetadata).mockResolvedValue({facts,failed:false});});
afterEach(()=>{cleanup();localStorage.clear();vi.clearAllMocks();vi.unstubAllGlobals();vi.useRealTimers();});
const tap=(name:string|RegExp)=>fireEvent.click(screen.getByRole('button',{name}));
const type=(label:string,text:string)=>fireEvent.change(screen.getByLabelText(label),{target:{value:text}});
it('creates a combined smart list from selected sources and retains the stacked layout and posters',async()=>{
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Romantic anime');
  expect(screen.getByText('Let Geek sort for you')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Choose lists'));
  fireEvent.click(screen.getByLabelText('Watch list'));
  tap('Create list');
  expect(await screen.findByRole('button',{name:anime.title})).toBeTruthy();
  expect(screen.queryByRole('button',{name:cartoon.title})).toBeNull();
  expect(screen.queryByRole('button',{name:outside.title})).toBeNull();
  expect(readLists(homeListKey('test'))[0]).toMatchObject({sources:['watch'],request:'Romantic anime',mode:'smart'});
  const list=screen.getByRole('button',{name:'Romantic anime'});expect(list.getAttribute('aria-expanded')).toBe('true');
  tap('Edit rule');type('List name','Date night');tap('Save changes');
  expect(await screen.findByRole('button',{name:'Date night'})).toBeTruthy();
  expect(readLists(homeListKey('test'))[0]).toMatchObject({request:'Romantic anime'});
});
it('lets users choose a catalogue meaning, saves the ID and never discards another condition',async()=>{
  vi.mocked(findListCategories).mockResolvedValue([{id:'Q444',label:'Time travel',description:'Concept of moving between points in time',roles:['topic']}]);
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Time travel movies under 90 minutes');tap('Smart match');
  expect((screen.getByRole('button',{name:'Create list'}) as HTMLButtonElement).disabled).toBe(true);
  tap('Find a match');fireEvent.click(await screen.findByRole('button',{name:'Topic: Time travel'}));tap('Create list');
  const saved=readLists(homeListKey('test'))[0];
  expect(saved).toMatchObject({mode:'smart',rule:{kind:'all',rules:expect.arrayContaining([{kind:'runtime',minutes:90,inclusive:false,scope:'movie'},{kind:'topic',entityId:'Q444',value:'Time travel',scope:'movie'}])}});
});
it('does not let a stale category response replace the changed request',async()=>{
  let done!:(value:any)=>void;
  vi.mocked(findListCategories).mockImplementation(()=>new Promise(resolve=>{done=resolve;}));
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Time travel movies');tap('Smart match');tap('Find a match');
  tap('Edit matching rule');type('What belongs in this list?','Anime');
  await act(async()=>done([{id:'Q444',label:'Time travel',description:'Concept',roles:['topic']}]));
  expect(screen.queryByRole('button',{name:'Topic: Time travel'})).toBeNull();
  tap('Create list');expect(readLists(homeListKey('test'))[0]).toMatchObject({rule:{kind:'genre',value:'Anime'}});
});
it('keeps an existing legacy director rule and source choices when editing its display name',async()=>{
  localStorage.setItem(homeListKey('test'),JSON.stringify([{id:'lynch',name:'David Lynch movies',mode:'smart',sources:['watch'],rule:{kind:'director',value:'David Lynch',scope:'movie'}}]));
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('David Lynch movies');await screen.findByRole('button',{name:'Edit rule'});tap('Edit rule');type('List name','Lynch night');tap('Save changes');
  expect(readLists(homeListKey('test'))[0]).toMatchObject({name:'Lynch night',sources:['watch'],rule:{kind:'director',value:'David Lynch',scope:'movie'}});
});
it('creates not-out-yet from chosen lists and removes a title when its release day arrives',async()=>{
  vi.useFakeTimers({toFake:['Date']});vi.setSystemTime(new Date(2026,10,12,12));
  vi.mocked(listMetadata).mockResolvedValue({failed:false,facts:new Map([
    ['movie:1',{...facts.get('movie:1')!,releaseDates:[{date:'2026-11-13',precision:'day' as const}]}],
    ['movie:2',{...facts.get('movie:2')!,releaseDates:[{date:'2026-11-10',precision:'day' as const}]}],
    ['movie:3',{...facts.get('movie:3')!,releaseDates:[{date:'2027-01-01',precision:'year' as const}]}],
  ])});
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Not out yet');
  expect(screen.getByRole('button',{name:'Smart match'}).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Movies and TV shows not released yet.')).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Choose lists'));fireEvent.click(screen.getByLabelText('Watch list'));
  tap('Create list');
  expect(await screen.findByRole('button',{name:anime.title})).toBeTruthy();
  expect(screen.queryByRole('button',{name:cartoon.title})).toBeNull();
  expect(screen.queryByRole('button',{name:outside.title})).toBeNull();
  expect(readLists(homeListKey('test'))[0]).toMatchObject({name:'Not out yet',mode:'smart',sources:['watch'],rule:{kind:'release',state:'upcoming'}});
  await act(async()=>{vi.setSystemTime(new Date(2026,10,13,0,1));window.dispatchEvent(new Event('focus'));});
  await waitFor(()=>expect(screen.queryByRole('button',{name:anime.title})).toBeNull());
  expect(screen.getByText('No matches in the selected lists yet.')).toBeTruthy();
});

vi.mock('../src/lib/list-ai',()=>({interpretListWithAI:vi.fn()}));
import { interpretListWithAI } from '../src/lib/list-ai';
const aiComedy={kind:'suggestion' as const,rule:{kind:'all' as const,scope:'movie' as const,rules:[{kind:'genre' as const,value:'Comedy',scope:'movie' as const},{kind:'runtime' as const,minutes:90,inclusive:false,scope:'movie' as const}]}};
it('asks only on demand, requires confirmation and persists the interpretation with chosen source lists',async()=>{
  vi.mocked(interpretListWithAI).mockResolvedValue(aiComedy);
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Something funny and short');tap('Smart match');
  expect(interpretListWithAI).not.toHaveBeenCalled();tap('Ask Geek to interpret');
  await screen.findByText('Here’s how I’d sort it');
  expect((screen.getByRole('button',{name:'Create list'}) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByText(/under 90 minutes/)).toBeTruthy();
  fireEvent.click(screen.getByLabelText('Choose lists'));fireEvent.click(screen.getByLabelText('Watch list'));
  tap('Use this rule');tap('Create list');
  await screen.findByRole('button',{name:cartoon.title});
  expect(screen.queryByRole('button',{name:anime.title})).toBeNull();
  expect(readLists(homeListKey('test'))[0]).toMatchObject({request:'Something funny and short',mode:'smart',sources:['watch'],rule:aiComedy.rule});
  tap('Edit rule');type('List name','Friday options');tap('Save changes');
  expect(readLists(homeListKey('test'))[0]).toMatchObject({name:'Friday options',request:'Something funny and short',rule:aiComedy.rule});
  expect(interpretListWithAI).toHaveBeenCalledTimes(1);
});
it('clarifies vague names while keeping nickname and source choices',async()=>{
  vi.mocked(interpretListWithAI).mockResolvedValue({kind:'clarify',reason:'vague'});
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Friday options');tap('Smart match');tap('Ask Geek to interpret');
  await screen.findByRole('button',{name:'Describe what you mean'});
  expect((screen.getByRole('button',{name:'Create list'}) as HTMLButtonElement).disabled).toBe(true);
  tap('Describe what you mean');type('What belongs in this list?','Comedy movies under 90 minutes');tap('Create list');
  expect(readLists(homeListKey('test'))[0]).toMatchObject({name:'Friday options',request:'Comedy movies under 90 minutes',mode:'smart'});
});
it('discards a late AI interpretation after editing the request',async()=>{
  let finish!:(value:any)=>void;
  vi.mocked(interpretListWithAI).mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Something funny and short');tap('Smart match');tap('Ask Geek to interpret');
  tap('Edit matching rule');type('What belongs in this list?','Horror');
  await act(async()=>finish(aiComedy));
  expect(screen.queryByRole('button',{name:'Use this rule'})).toBeNull();tap('Create list');
  expect(readLists(homeListKey('test'))[0]).toMatchObject({rule:{kind:'genre',value:'Horror'}});
});
it('keeps manual selection available on provider failure and does not retry automatically',async()=>{
  vi.mocked(interpretListWithAI).mockRejectedValue(Error('The free AI is busy. Try later, or use a clear matching rule.'));
  render(<HomeLists viewer="test" shelves={shelves} onOpen={()=>{}}/>);
  tap('New list');type('List name','Something funny and short');tap('Smart match');tap('Ask Geek to interpret');
  expect(await screen.findByRole('alert')).toBeTruthy();
  expect((screen.getByRole('button',{name:'Create list'}) as HTMLButtonElement).disabled).toBe(true);
  tap('Pick titles');tap('Create list');
  expect(readLists(homeListKey('test'))[0]).toMatchObject({mode:'manual'});
  expect(interpretListWithAI).toHaveBeenCalledTimes(1);
});
