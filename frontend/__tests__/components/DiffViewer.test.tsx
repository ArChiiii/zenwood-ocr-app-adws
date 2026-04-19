import { render, screen } from "@testing-library/react";
import { DiffViewer } from "@/components/DiffViewer";

describe("DiffViewer", () => {
  it("renders del and ins tags from diff content", () => {
    const html = "Hello <del>old</del> <ins>new</ins> world";
    const { container } = render(<DiffViewer rawHtml={html} />);

    const del = container.querySelector("del");
    const ins = container.querySelector("ins");
    expect(del).toBeInTheDocument();
    expect(del?.textContent).toBe("old");
    expect(ins).toBeInTheDocument();
    expect(ins?.textContent).toBe("new");
  });

  it("renders plain text without markup", () => {
    render(<DiffViewer rawHtml="no changes here" />);
    expect(screen.getByText("no changes here")).toBeInTheDocument();
  });

  it("handles empty diff", () => {
    const { container } = render(<DiffViewer rawHtml="" />);
    const content = container.querySelector(".diff-content");
    expect(content).toBeInTheDocument();
    expect(content?.innerHTML).toBe("");
  });

  it("strips XSS payloads — only del/ins allowed", () => {
    const xss =
      '<script>alert("xss")</script><del>removed</del><img onerror="alert(1)" src="x"><ins>added</ins>';
    const { container } = render(<DiffViewer rawHtml={xss} />);

    // Script and img tags must be stripped by DOMPurify
    expect(container.querySelector("script")).toBeNull();
    expect(container.querySelector("img")).toBeNull();

    // del and ins survive
    expect(container.querySelector("del")?.textContent).toBe("removed");
    expect(container.querySelector("ins")?.textContent).toBe("added");
  });

  it("strips attributes from allowed tags", () => {
    const html = '<del onclick="alert(1)">text</del>';
    const { container } = render(<DiffViewer rawHtml={html} />);
    const del = container.querySelector("del");
    expect(del).toBeInTheDocument();
    expect(del?.getAttribute("onclick")).toBeNull();
  });
});
