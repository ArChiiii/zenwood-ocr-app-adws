import { render, screen } from "@testing-library/react";
import { FileText } from "lucide-react";
import { FeatureCard } from "@/components/FeatureCard";

describe("FeatureCard", () => {
  it("renders feature label", () => {
    render(<FeatureCard feature="scan-conversion" icon={FileText} />);
    expect(screen.getByText("Scan Conversion")).toBeInTheDocument();
  });

  it("renders feature description", () => {
    render(<FeatureCard feature="document-classification" icon={FileText} />);
    expect(
      screen.getByText(/Classify a document into one of 9 categories/),
    ).toBeInTheDocument();
  });

  it("links to the correct process page", () => {
    render(<FeatureCard feature="handwriting-removal" icon={FileText} />);
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/process/handwriting-removal");
  });

  it("renders the icon", () => {
    const { container } = render(
      <FeatureCard feature="scan-conversion" icon={FileText} />,
    );
    // lucide-react renders an SVG element
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
