import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { vi } from "vitest";

// Mock fetchModels before importing the component
vi.mock("@/lib/api", () => ({
  fetchModels: vi.fn(),
}));

import { ModelSelector } from "@/components/ModelSelector";
import { fetchModels } from "@/lib/api";

const mockFetchModels = vi.mocked(fetchModels);

describe("ModelSelector", () => {
  beforeEach(() => {
    mockFetchModels.mockReset();
  });

  it("shows loading state initially", () => {
    mockFetchModels.mockReturnValue(new Promise(() => {})); // never resolves
    render(<ModelSelector value="" onChange={vi.fn()} />);
    expect(screen.getByText("Loading models...")).toBeInTheDocument();
  });

  it("renders model options after loading", async () => {
    mockFetchModels.mockResolvedValue(["llava:7b", "llava:13b"]);
    render(<ModelSelector value="llava:7b" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText("llava:7b")).toBeInTheDocument();
      expect(screen.getByText("llava:13b")).toBeInTheDocument();
    });
  });

  it("calls onChange when a model is selected", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    mockFetchModels.mockResolvedValue(["llava:7b", "llava:13b"]);

    render(<ModelSelector value="llava:7b" onChange={onChange} />);

    await waitFor(() => {
      expect(screen.getByText("llava:13b")).toBeInTheDocument();
    });

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "llava:13b");
    expect(onChange).toHaveBeenCalledWith("llava:13b");
  });

  it("auto-selects first model if no value set", async () => {
    const onChange = vi.fn();
    mockFetchModels.mockResolvedValue(["llava:7b"]);

    render(<ModelSelector value="" onChange={onChange} />);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith("llava:7b");
    });
  });

  it("shows error message when Ollama is unavailable", async () => {
    mockFetchModels.mockRejectedValue(new Error("Connection refused"));

    render(<ModelSelector value="" onChange={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByText(/Ollama unavailable/)).toBeInTheDocument();
    });
  });
});
