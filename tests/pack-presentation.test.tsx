// @vitest-environment jsdom
import {render,screen,cleanup} from '@testing-library/react';
import {afterEach,expect,it} from 'vitest';
import {CollectibleCard} from '../src/components/CollectibleCard';
import {PackOdds} from '../src/components/PackOdds';
afterEach(cleanup);

it('shows only the photo, name and role, without tier labels or tier colouring',()=>{
 const {container}=render(<CollectibleCard name="Leonardo DiCaprio" type="actor" photo="/photo.jpg"/>);
 expect(screen.getByText('Leonardo DiCaprio')).toBeTruthy();
 expect(screen.getByText('Actor')).toBeTruthy();
 expect(container.querySelector('img')?.getAttribute('src')).toContain('/photo.jpg');
 expect(container.querySelector('figure')?.hasAttribute('data-rarity')).toBe(false);
 expect(container.textContent).not.toMatch(/icon|star|established|featured|discovery/i);
});
it('keeps current odds and the list of eligible people inside closed details',()=>{
 const {container}=render(<PackOdds type="actor"/>);
 const details=container.querySelector('details')!;
 expect(details.open).toBe(false);
 expect(screen.getByText('60%')).toBeTruthy();
 expect(screen.getByText('30%')).toBeTruthy();
 expect(screen.getByText('8%')).toBeTruthy();
 expect(screen.getByText('2%')).toBeTruthy();
 expect(screen.getByText('Joseph Zada')).toBeTruthy();
 expect(screen.getByText('Leonardo DiCaprio')).toBeTruthy();
 expect(screen.queryByText('Christopher Nolan')).toBeNull();
 expect(screen.getByText(/Each name: 2% ÷ 12 ≈ 0.1667%/)).toBeTruthy();
});
it('offers both kinds of pack probabilities before a pack type is selected',()=>{
 render(<PackOdds/>);
 expect(screen.getByText('Joseph Zada')).toBeTruthy();
 expect(screen.getByText('Christopher Nolan')).toBeTruthy();
});
it('shows the original 60/30/10 odds for a v1 saved draw, not v2 odds',()=>{
 render(<PackOdds type="actor" drawn version="cinegeek-cast-1"/>);
 expect(screen.getByText(/earlier catalogue/)).toBeTruthy();
 expect(screen.getByText('10%')).toBeTruthy();
 expect(screen.queryByText('2%')).toBeNull();
 expect(screen.queryByText('Joseph Zada')).toBeNull();
});
it('distinguishes legacy unrecorded reveals from current probabilities',()=>{
 render(<PackOdds drawn/>);
 expect(screen.getByText(/no recorded odds/)).toBeTruthy();
 expect(screen.getByText('2%')).toBeTruthy();
});
it('does not misrepresent unknown future catalogues as current odds',()=>{
 render(<PackOdds drawn version="cinegeek-cast-999"/>);
 expect(screen.getByText(/Update CineGeek/)).toBeTruthy();
 expect(screen.queryByText('2%')).toBeNull();
});
