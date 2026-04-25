import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TaskTokenStatsPanel } from "../TaskTokenStatsPanel";

describe("TaskTokenStatsPanel", () => {
  it("renders loading state while task detail token usage is hydrating", () => {
    render(<TaskTokenStatsPanel loading tokenUsage={undefined} />);

    expect(screen.getByText("Loading token statistics…")).toBeInTheDocument();
    expect(screen.queryByText("No token usage recorded for this task yet.")).toBeNull();
  });

  it("renders empty state when detail is loaded without usage", () => {
    render(<TaskTokenStatsPanel loading={false} tokenUsage={undefined} />);

    expect(screen.getByText("No token usage recorded for this task yet.")).toBeInTheDocument();
    expect(screen.queryByText("Loading token statistics…")).toBeNull();
  });

  it("renders all token totals and usage timestamps", () => {
    render(
      <TaskTokenStatsPanel
        loading={false}
        tokenUsage={{
          inputTokens: 1200,
          outputTokens: 450,
          cachedTokens: 210,
          totalTokens: 1860,
          firstUsedAt: "2026-04-24T09:00:00.000Z",
          lastUsedAt: "2026-04-24T10:15:00.000Z",
        }}
      />,
    );

    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Cached")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getByText("1,200")).toBeInTheDocument();
    expect(screen.getByText("450")).toBeInTheDocument();
    expect(screen.getByText("210")).toBeInTheDocument();
    expect(screen.getByText("1,860")).toBeInTheDocument();

    const firstUsedTime = screen.getByText((_, element) => element?.tagName === "TIME" && element.getAttribute("datetime") === "2026-04-24T09:00:00.000Z");
    const lastUsedTime = screen.getByText((_, element) => element?.tagName === "TIME" && element.getAttribute("datetime") === "2026-04-24T10:15:00.000Z");

    expect(firstUsedTime).toBeInTheDocument();
    expect(lastUsedTime).toBeInTheDocument();
  });
});
