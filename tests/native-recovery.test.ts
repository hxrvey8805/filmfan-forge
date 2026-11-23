// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const bridge=vi.hoisted(()=>({addListener:vi.fn(),getLaunchUrl:vi.fn(),receiveLink:vi.fn(),platform:'ios'}));
vi.mock('@capacitor/app',()=>({App:bridge}));
vi.mock('@capacitor/core',()=>({Capacitor:{getPlatform:()=>bridge.platform}}));
vi.mock('../src/lib/password-recovery',()=>({recovery:{receiveLink:bridge.receiveLink}}));
beforeEach(()=>{vi.resetModules();vi.resetAllMocks();bridge.platform='ios';bridge.addListener.mockResolvedValue({remove:vi.fn()});bridge.getLaunchUrl.mockResolvedValue(undefined);bridge.receiveLink.mockReturnValue(true);});
afterEach(()=>vi.restoreAllMocks());
it('receives a cold launch only after installing the warm-link listener',async()=>{
 bridge.getLaunchUrl.mockImplementation(async()=>{expect(bridge.addListener).toHaveBeenCalled();return{url:'cold'};});
 const {startNativeRecoveryLinks}=await import('../src/lib/native-recovery');await startNativeRecoveryLinks();
 expect(bridge.receiveLink).toHaveBeenCalledExactlyOnceWith('cold');
});
it('receives a warm link without reopening or reloading the web view',async()=>{
 const {startNativeRecoveryLinks}=await import('../src/lib/native-recovery');await startNativeRecoveryLinks();
 bridge.addListener.mock.calls[0][1]({url:'warm'});expect(bridge.receiveLink).toHaveBeenCalledWith('warm');
});
it('does not let a stale launch URL replace a newer startup link',async()=>{
 bridge.getLaunchUrl.mockImplementation(async()=>{bridge.addListener.mock.calls[0][1]({url:'new'});return{url:'old'};});
 const {startNativeRecoveryLinks}=await import('../src/lib/native-recovery');await startNativeRecoveryLinks();
 expect(bridge.receiveLink).toHaveBeenCalledExactlyOnceWith('new');
});
it('deduplicates repeated native delivery of the same link',async()=>{
 bridge.getLaunchUrl.mockResolvedValue({url:'same'});
 const {startNativeRecoveryLinks}=await import('../src/lib/native-recovery');await startNativeRecoveryLinks();
 bridge.addListener.mock.calls[0][1]({url:'same'});expect(bridge.receiveLink).toHaveBeenCalledTimes(1);
});
it('does not connect the native bridge for website visitors',async()=>{
 bridge.platform='web';const {startNativeRecoveryLinks}=await import('../src/lib/native-recovery');await startNativeRecoveryLinks();
 expect(bridge.addListener).not.toHaveBeenCalled();expect(bridge.getLaunchUrl).not.toHaveBeenCalled();
});
it('allows reopening the same link after a failed connection instead of permanently suppressing it',async()=>{
 const now=vi.spyOn(Date,'now').mockReturnValue(1000);
 const {startNativeRecoveryLinks}=await import('../src/lib/native-recovery');await startNativeRecoveryLinks();
 bridge.addListener.mock.calls[0][1]({url:'retry'});now.mockReturnValue(3000);
 bridge.addListener.mock.calls[0][1]({url:'retry'});expect(bridge.receiveLink).toHaveBeenCalledTimes(2);
});
