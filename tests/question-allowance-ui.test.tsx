// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { createRef } from 'react';
import { RoomChat } from '../src/components/RoomChat';
import { readQuestionAllowance, questionAllowanceLabel, type QuestionAllowance } from '../src/lib/question-allowance';

afterEach(cleanup);
const renderChat=(allowance:QuestionAllowance)=>{
  const onAsk=vi.fn().mockResolvedValue(undefined);
  render(<RoomChat expanded={false} onExpand={()=>{}} timestamp="00:30" valid onEditPosition={()=>{}}
    positionButton={createRef()} messages={[]} historyError={null} loading={false} onAsk={onAsk}
    remainingFree={0} coins={0} onStore={()=>{}} allowance={allowance}/>);
  fireEvent.change(screen.getByRole('textbox',{name:'Your question'}),{target:{value:'Why did that happen?'}});
  return {onAsk,send:screen.getByRole('button',{name:'Send question'}) as HTMLButtonElement};
};
it('shows monthly totals separately from purchased credits, without daily freebies or coins',()=>{
  const {send}=renderChat({mode:'monthly',plan:'annual',included:14,limit:15,purchased:3,renewsAt:'2026-12-13T12:00:00Z'});
  expect(screen.getByText('14 of 15 left this month · 3 purchased questions')).toBeTruthy();
  expect(screen.queryByText(/free questions|150 coins/)).toBeNull();expect(send.disabled).toBe(false);
});
it('allows Free users to send a purchased question with no coins or subscription',async()=>{
  const {send,onAsk}=renderChat({mode:'monthly',plan:'free',included:0,limit:0,purchased:1,renewsAt:null});
  expect(screen.getByText('1 purchased question')).toBeTruthy();fireEvent.click(send);
  await waitFor(()=>expect(onAsk).toHaveBeenCalledWith('Why did that happen?'));
});
it('does not offer Free users included AI or enable an unfinished checkout',()=>{
  const {send}=renderChat({mode:'monthly',plan:'free',included:0,limit:0,purchased:0,renewsAt:null});
  expect(send.disabled).toBe(true);expect(screen.getByText(/when purchases launch/)).toBeTruthy();
  expect(screen.queryByRole('button',{name:'View store'})).toBeNull();
});
it('rejects malformed balances and does not turn an error into free questions',()=>{
  expect(readQuestionAllowance({mode:'monthly',plan:'free',included:15,limit:15,purchased:0,renewsAt:null})).toEqual({mode:'unavailable'});
  expect(readQuestionAllowance({mode:'monthly',plan:'annual',included:15,limit:15,purchased:-1,renewsAt:null})).toEqual({mode:'unavailable'});
  expect(questionAllowanceLabel(readQuestionAllowance(null))).toBe('Question allowance unavailable');
  expect(readQuestionAllowance({mode:'beta'})).toEqual({mode:'beta'});
});
