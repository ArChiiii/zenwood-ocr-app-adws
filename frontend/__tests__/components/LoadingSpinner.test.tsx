import { render, screen } from "@testing-library/react";
import { LoadingSpinner } from "@/components/LoadingSpinner";

describe("LoadingSpinner", () => {
  it("renders with default label", () => {
    render(<LoadingSpinner />);
    expect(screen.getByText("Processing...")).toBeInTheDocument();
  });

  it("renders with custom label", () => {
    render(<LoadingSpinner label="Uploading file..." />);
    expect(screen.getByText("Uploading file...")).toBeInTheDocument();
  });

  it("renders the spinner element", () => {
    const { container } = render(<LoadingSpinner />);
    const spinner = container.querySelector(".animate-spin");
    expect(spinner).toBeInTheDocument();
  });
});
