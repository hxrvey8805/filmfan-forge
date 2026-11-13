// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import Packs from "../src/pages/Packs";
import { supabase as preview } from "../src/preview/client";

vi.mock("@/integrations/supabase/client", async () => import("../src/preview/client"));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

it("lets a touch player inspect and dismiss a card without selling, then sells only on explicit selection", async () => {
  await preview.auth.signInWithPassword();
  await preview.from("user_collection").insert({
    id: "touch-card", user_id: "design-preview-user", person_name: "Cast Member",
    person_type: "actor", person_id: 17, profile_path: "",
  });
  try {
    const invoke = vi.spyOn(preview.functions, "invoke").mockImplementation(async name => {
      if (name === "calculate-person-value") return { data: { price: 80 }, error: null };
      if (name === "sell-card") return { data: { newBalance: 330, message: "Sold" }, error: null };
      throw new Error("Unexpected request: " + name);
    });
    const onBalance = vi.fn();
    render(<Packs onStore={vi.fn()} onBalance={onBalance} />);
    const card = await screen.findByRole("button", { name: "View Cast Member card" });
    expect(invoke).not.toHaveBeenCalled();
    fireEvent.click(card);
    await screen.findByRole("button", { name: "Sell card" });
    fireEvent.click(screen.getByRole("button", {name:"Close"}));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(invoke.mock.calls.map(call => call[0])).toEqual(["calculate-person-value"]);
    fireEvent.click(card);
    fireEvent.click(await screen.findByRole("button", { name: "Sell card" }));
    await waitFor(() => expect(onBalance).toHaveBeenCalledWith(330));
    expect(invoke).toHaveBeenCalledWith("sell-card",{ body:{ cardId:"touch-card" } });
    expect(screen.queryByRole("button", { name: "View Cast Member card" })).toBeNull();
  } finally { await preview.from("user_collection").delete().eq("id","touch-card"); }
});
