// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { RoomChat } from '../src/components/RoomChat';
import { readQuestionAllowance, questionAllowanceLabel, type QuestionAllowance } from '../src/lib/question-allowance';
import { ProAccessContext } from '../src/hooks/use-pro-access';
import { planFixture } from './pro-access-fixture';
import { CompanionAnswerError } from '../supabase/functions/_shared/companion-answer-error';

afterEach(cleanup);
const renderChat=(allowance:QuestionAllowance)=>{
  const onAsk=vi.fn().mockResolvedValue(undefined);
  const onViewPlan=vi.fn();
  render(<RoomChat expanded={false} onExpand={()=>{}} timestamp="00:30" valid onEditPosition={()=>{}}
    positionButton={createRef()} messages={[]} historyError={null} loading={false} onAsk={onAsk}
    remainingFree={0} coins={0} onStore={()=>{}} onViewPlan={onViewPlan} allowance={allowance}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'Your question'}),{target:{value:'Why did that happen?'}});
  return {onAsk,onViewPlan,send:screen.getByRole('button',{name:'Send question'}) as HTMLButtonElement};
};
it('shows monthly totals separately from purchased credits, without daily freebies or coins',()=>{
  const {send}=renderChat({mode:'monthly',plan:'annual',included:9,limit:10,purchased:3,renewsAt:'2026-12-13T12:00:00Z'});
  expect(screen.getByText('9 of 10 left this month · 3 purchased questions')).toBeTruthy();
  expect(screen.queryByText(/free questions|150 coins/)).toBeNull();expect(send.disabled).toBe(false);
});
it('allows Free users to send a purchased question with no coins or subscription',async()=>{
  const {send,onAsk}=renderChat({mode:'monthly',plan:'free',included:0,limit:0,purchased:1,renewsAt:null});
  expect(screen.getByText('1 purchased question')).toBeTruthy();fireEvent.click(send);
  await waitFor(()=>expect(onAsk).toHaveBeenCalledWith('Why did that happen?'));
});
it('does not offer Free users included AI or enable an unfinished checkout',()=>{
  const {send,onAsk,onViewPlan}=renderChat({mode:'monthly',plan:'free',included:0,limit:0,purchased:0,renewsAt:null});
  const input=screen.getByRole('textbox',{name:'Your question'}) as HTMLTextAreaElement;
  expect(input.disabled).toBe(true);expect(input.value).toBe('');
  fireEvent.keyDown(input,{key:'Enter'});fireEvent.submit(screen.getByRole('form',{name:'Ask Geek'}));
  expect(onAsk).not.toHaveBeenCalled();
  expect(screen.getByText('Free includes no AI questions.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'View plans'}));expect(onViewPlan).toHaveBeenCalledOnce();
  expect(send.disabled).toBe(true);expect(screen.getByText(/when purchases launch/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'View store'})).toBeNull();
});
it.each(['monthly','annual'] as const)('%s keeps its composer enabled with included questions',plan=>{
  const {send}=renderChat({mode:'monthly',plan,included:10,limit:10,purchased:0,renewsAt:'2026-12-13T12:00:00Z'});
  expect((screen.getByRole('textbox',{name:'Your question'}) as HTMLTextAreaElement).disabled).toBe(false);
  expect(send.disabled).toBe(false);
});
it('locks shortcuts and the keyboard on Free even while the legacy beta counter has questions',()=>{
  render(<ProAccessContext.Provider value={planFixture('free')}><RoomChat expanded onExpand={()=>{}}
    timestamp="00:30" valid onEditPosition={()=>{}} positionButton={createRef()} messages={[]} historyError={null}
    loading={false} onAsk={vi.fn()} remainingFree={5} onStore={()=>{}} allowance={{mode:'beta'}}
    focusAction={<button>Start focus</button>}/></ProAccessContext.Provider>);
  expect((screen.getByRole('textbox',{name:'Your question'}) as HTMLTextAreaElement).disabled).toBe(true);
  for(const prompt of screen.getAllByRole('button',{name:/Use prompt:/}))expect((prompt as HTMLButtonElement).disabled).toBe(true);
  expect((screen.getByRole('button',{name:'Start focus'}) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.queryByText(/5 private beta/)).toBeNull();
});
it('locks an existing draft on downgrade and unlocks only when a purchased question is confirmed',async()=>{
  const onAsk=vi.fn().mockResolvedValue(undefined);
  const chat=(allowance:QuestionAllowance)=><ProAccessContext.Provider value={planFixture('free')}>
    <RoomChat expanded={false} onExpand={()=>{}} timestamp="00:30" valid onEditPosition={()=>{}}
      positionButton={createRef()} messages={[]} historyError={null} loading={false} onAsk={onAsk}
      remainingFree={5} onStore={()=>{}} allowance={allowance}/></ProAccessContext.Provider>;
  const view=render(chat({mode:'monthly',plan:'monthly',included:1,limit:10,purchased:0,renewsAt:'2026-12-13T12:00:00Z'}));
  const input=screen.getByRole('textbox',{name:'Your question'}) as HTMLTextAreaElement;
  fireEvent.change(input,{target:{value:'Explain this scene'}});
  view.rerender(chat({mode:'monthly',plan:'free',included:0,limit:0,purchased:0,renewsAt:null}));
  expect(input.disabled).toBe(true);fireEvent.submit(screen.getByRole('form',{name:'Ask Geek'}));
  expect(onAsk).not.toHaveBeenCalled();
  view.rerender(chat({mode:'unavailable'}));expect(input.disabled).toBe(true);
  view.rerender(chat({mode:'monthly',plan:'free',included:0,limit:0,purchased:1,renewsAt:null}));
  expect(input.disabled).toBe(false);expect(input.value).toBe('Explain this scene');
  fireEvent.click(screen.getByRole('button',{name:'Send question'}));
  await waitFor(()=>expect(onAsk).toHaveBeenCalledWith('Explain this scene'));
  view.rerender(chat({mode:'monthly',plan:'free',included:0,limit:0,purchased:0,renewsAt:null}));
  expect(input.disabled).toBe(true);
});
it('rejects malformed balances and does not turn an error into free questions',()=>{
  expect(readQuestionAllowance({mode:'monthly',plan:'free',included:10,limit:10,purchased:0,renewsAt:null})).toEqual({mode:'unavailable'});
  expect(readQuestionAllowance({mode:'monthly',plan:'annual',included:10,limit:10,purchased:-1,renewsAt:null})).toEqual({mode:'unavailable'});
  expect(questionAllowanceLabel(readQuestionAllowance(null))).toBe('Question allowance unavailable');
  expect(readQuestionAllowance({mode:'beta'})).toEqual({mode:'beta'});
});
it('keeps a rejected question editable and retries only after an explicit tap',async()=>{
  const {onAsk,send}=renderChat({mode:'monthly',plan:'monthly',included:10,limit:10,purchased:0,renewsAt:null});
  onAsk.mockRejectedValueOnce(new CompanionAnswerError());fireEvent.click(send);
  const retry=await screen.findByRole('button',{name:'Try again'});
  expect(screen.getByRole('alert').textContent).toContain('No question used.');
  expect((screen.getByRole('textbox',{name:'Your question'}) as HTMLTextAreaElement).value).toBe('Why did that happen?');
  expect(onAsk).toHaveBeenCalledOnce();
  fireEvent.click(retry);await waitFor(()=>expect(onAsk).toHaveBeenCalledTimes(2));
  expect(onAsk).toHaveBeenLastCalledWith('Why did that happen?');
  await waitFor(()=>expect(screen.queryByRole('button',{name:'Try again'})).toBeNull());
});
it('does not offer the old retry after changing the timestamp or bypass a Free lock',async()=>{
  const onAsk=vi.fn().mockRejectedValue(new CompanionAnswerError());
  const chat=(timestamp:string,plan:'monthly'|'free'='monthly')=><RoomChat expanded={false} onExpand={()=>{}}
    timestamp={timestamp} valid onEditPosition={()=>{}} positionButton={createRef()} messages={[]} historyError={null}
    loading={false} onAsk={onAsk} remainingFree={null} onStore={()=>{}}
    allowance={{mode:'monthly',plan,included:plan==='monthly'?10:0,limit:plan==='monthly'?10:0,purchased:0,renewsAt:null}}/>;
  const view=render(chat('08:27'));
  fireEvent.change(screen.getByRole('textbox',{name:'Your question'}),{target:{value:'Summarise her speech.'}});
  fireEvent.click(screen.getByRole('button',{name:'Send question'}));await screen.findByRole('button',{name:'Try again'});
  view.rerender(chat('08:26'));expect(screen.queryByRole('button',{name:'Try again'})).toBeNull();
  view.rerender(chat('08:27','free'));
  expect((screen.getByRole('button',{name:'Try again'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('button',{name:'Try again'}));expect(onAsk).toHaveBeenCalledOnce();
});
