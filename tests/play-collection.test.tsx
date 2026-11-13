// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Packs from "../src/pages/Packs";
import { supabase as preview } from "../src/preview/client";

vi.mock("@/integrations/supabase/client", async () => import("../src/preview/client"));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("displays collectibles without valuation calls or any selling option",async()=>{
 await preview.auth.signInWithPassword();
 await preview.from('user_collection').insert({id:'touch-card',user_id:'design-preview-user',person_name:'Cast Member',person_type:'actor',person_id:17,profile_path:''});
 const invoke=vi.spyOn(preview.functions,'invoke');
 try{render(<Packs onStore={vi.fn()} onBalance={vi.fn()}/>);await screen.findByText('Cast Member');expect(screen.queryByRole('button',{name:/sell/i})).toBeNull();expect(invoke).not.toHaveBeenCalled();}
 finally{await preview.from('user_collection').delete().eq('id','touch-card');}
});
