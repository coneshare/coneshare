import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { EmptyDocuments } from "../../components/documents/EmptyDocuments";
import i18n from "../../i18n";

describe("EmptyDocuments", () => {
  it("renders the main heading and instructional text", () => {
    i18n.changeLanguage('en');
    render(<EmptyDocuments />);
    expect(
      screen.getByRole("heading", { name: "No documents yet" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("Drag and drop files or folders here, or use the upload button to get started.")
    ).toBeInTheDocument();
  });

  it("renders translated text when language is changed", async () => {
    await i18n.changeLanguage('zh-hans');
    render(<EmptyDocuments />);
    expect(
      screen.getByRole("heading", { name: "暂无文档" })
    ).toBeInTheDocument();
    expect(
      screen.getByText("将文件或文件夹拖放到此处，或使用上传按钮开始。")
    ).toBeInTheDocument();
    await i18n.changeLanguage('en');
  });
});
