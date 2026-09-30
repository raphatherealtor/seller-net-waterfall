import { TopNav } from "@/components/layout/TopNav";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const { setThemeMock } = vi.hoisted(() => ({
  setThemeMock: vi.fn(),
}));

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: "light",
    setTheme: setThemeMock,
  }),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...rest
  }: {
    to: string;
    children: React.ReactNode;
  }) => (
    <a href={to} {...rest}>
      {children}
    </a>
  ),
  useRouterState: ({ select }: { select?: (state: { location: { pathname: string } }) => unknown }) => {
    const state = { location: { pathname: "/" } };
    return select ? select(state) : state;
  },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("appearance toggle", () => {
  it("switches from the resolved light theme to dark", async () => {
    const user = userEvent.setup();
    render(<TopNav />);

    const toggle = screen.getByTestId("nav.theme_toggle");
    expect(toggle).toHaveAttribute("aria-label", "Use dark appearance");

    await user.click(toggle);
    expect(setThemeMock).toHaveBeenCalledWith("dark");
  });
});
