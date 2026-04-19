import { render, screen } from "@testing-library/react";
import { ClassificationDisplay } from "@/components/ClassificationDisplay";

describe("ClassificationDisplay", () => {
  const baseResult = {
    category: "invoices",
    confidence: 0.85,
    rationale: "The document contains line items and a total amount.",
  };

  it("renders the category label", () => {
    render(<ClassificationDisplay result={baseResult} />);
    expect(screen.getByText("invoices")).toBeInTheDocument();
  });

  it("renders confidence as percentage", () => {
    render(<ClassificationDisplay result={baseResult} />);
    expect(screen.getByText("85% confidence")).toBeInTheDocument();
  });

  it("renders the rationale", () => {
    render(<ClassificationDisplay result={baseResult} />);
    expect(
      screen.getByText("The document contains line items and a total amount."),
    ).toBeInTheDocument();
  });

  it("renders progress bar with correct aria attributes", () => {
    render(<ClassificationDisplay result={baseResult} />);
    const progressbar = screen.getByRole("progressbar");
    expect(progressbar).toHaveAttribute("aria-valuenow", "85");
    expect(progressbar).toHaveAttribute("aria-valuemin", "0");
    expect(progressbar).toHaveAttribute("aria-valuemax", "100");
  });

  it("handles 0% confidence", () => {
    render(<ClassificationDisplay result={{ ...baseResult, confidence: 0 }} />);
    expect(screen.getByText("0% confidence")).toBeInTheDocument();
  });

  it("handles 100% confidence", () => {
    render(
      <ClassificationDisplay result={{ ...baseResult, confidence: 1.0 }} />,
    );
    expect(screen.getByText("100% confidence")).toBeInTheDocument();
  });

  it("replaces underscores with spaces in category", () => {
    render(
      <ClassificationDisplay
        result={{ ...baseResult, category: "vendor_bills" }}
      />,
    );
    expect(screen.getByText("vendor bills")).toBeInTheDocument();
  });
});
