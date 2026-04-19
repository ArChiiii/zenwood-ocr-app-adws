import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { FileUpload } from "@/components/FileUpload";

describe("FileUpload", () => {
  it("renders with default label when no file selected", () => {
    render(<FileUpload file={null} onChange={vi.fn()} />);
    expect(
      screen.getByText("Drop file here or click to select"),
    ).toBeInTheDocument();
  });

  it("renders custom label", () => {
    render(<FileUpload file={null} onChange={vi.fn()} label="Upload a PDF" />);
    expect(screen.getByText("Upload a PDF")).toBeInTheDocument();
  });

  it("shows file name when file is selected", () => {
    const file = new File(["content"], "report.pdf", {
      type: "application/pdf",
    });
    render(<FileUpload file={file} onChange={vi.fn()} />);
    expect(screen.getByText("report.pdf")).toBeInTheDocument();
  });

  it("calls onChange when a file is dropped", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();

    render(<FileUpload file={null} onChange={onChange} />);
    const input = document.querySelector(
      "input[type='file']",
    ) as HTMLInputElement;

    const file = new File(["test"], "test.pdf", { type: "application/pdf" });
    await user.upload(input, file);

    expect(onChange).toHaveBeenCalledWith(file);
  });

  it("renders the upload icon", () => {
    const { container } = render(<FileUpload file={null} onChange={vi.fn()} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeInTheDocument();
  });
});
