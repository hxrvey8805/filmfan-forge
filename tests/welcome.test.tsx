// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, expect, it, vi } from "vitest";
import Home from "../src/pages/Home";
import Auth from "../src/pages/Auth";
import { AppSession } from "../src/components/AppSession";

const auth = vi.hoisted(() => ({
  getSession: vi.fn(), onAuthStateChange: vi.fn(), signUp: vi.fn(),
  signInWithPassword: vi.fn(), resetPasswordForEmail: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth } }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });

function open(path: string) {
  return render(<AppSession><MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/" element={<Home />} />
    <Route path="/auth" element={<Auth />} />
    <Route path="/dashboard" element={<p>Watching library</p>} />
    <Route path="/onboarding" element={<p>Meet your Geek</p>} />
  </Routes></MemoryRouter></AppSession>);
}

it("shows the glasses until auth settles and honours a newer sign-in over a stale lookup", async () => {
  let resolve!: (value: unknown) => void;
  auth.getSession.mockReturnValue(new Promise(done => { resolve = done; }));
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
  open("/");
  expect(screen.getByRole("status", { name: "Opening CineGeek" })).toBeTruthy();
  expect(screen.queryByRole("link", { name: "Sign in" })).toBeNull();
  await act(async () => {
    auth.onAuthStateChange.mock.calls[0][0]("SIGNED_IN", { user: { id: "viewer" } });
    resolve({ data: { session: null } });
  });
  expect(screen.getByText("Watching library")).toBeTruthy();
});

it("opens signup from the welcome screen and waits for email confirmation when no session is issued", async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
  auth.signUp.mockResolvedValue({ data: { session: null }, error: null });
  open("/");
  fireEvent.click(await screen.findByRole("link", { name: "Create an account" }));
  expect(screen.queryByRole("status", { name: "Opening CineGeek" })).toBeNull();
  expect(auth.getSession).toHaveBeenCalledTimes(1);
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "film@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-secret" } });
  fireEvent.click(screen.getByRole("button", { name: "Create an account" }));
  expect(await screen.findByText("Check your email")).toBeTruthy();
  expect(auth.signUp.mock.calls[0][0].options.data).toEqual({ cinegeek_onboarding_version: 0 });
  expect(screen.queryByText("Watching library")).toBeNull();
});

it("sends an immediately confirmed signup to onboarding", async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
  auth.signUp.mockResolvedValue({ data: { session: { user: { id: 'new' } } }, error: null });
  open('/auth?mode=signup');
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'film@example.com' } });
  fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'test-secret' } });
  fireEvent.click(screen.getByRole('button', { name: 'Create an account' }));
  expect(await screen.findByText('Meet your Geek')).toBeTruthy();
});

it("keeps login errors on the form and clears reset instructions when switching to signup", async () => {
  auth.getSession.mockResolvedValue({ data: { session: null } });
  auth.onAuthStateChange.mockReturnValue({ data: { subscription: { unsubscribe() {} } } });
  auth.signInWithPassword.mockResolvedValue({ error: { code: "invalid_credentials" } });
  auth.resetPasswordForEmail.mockResolvedValue({ error: null });
  open("/auth");
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "geek@example.com" } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: "test-password" } });
  fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
  expect((await screen.findByRole("alert")).textContent).toMatch(/don’t match/);
  fireEvent.click(screen.getByRole("button", { name: "Forgot password?" }));
  expect((await screen.findByRole("status")).textContent).toContain("geek@example.com");
  expect(screen.queryByRole("alert")).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Create an account" }));
  expect(await screen.findByRole("button", { name: "Create an account" })).toBeTruthy();
  expect(screen.queryByText(/password reset link/)).toBeNull();
});
