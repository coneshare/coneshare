import React from "react";
import { render, screen } from "@testing-library/react";
import { defineFeature, loadFeature } from "vitest-cucumber";
import { expect } from "vitest";
import DocumentsPage from "../../pages/DocumentsPage";
import { MemoryRouter } from "react-router-dom";

const feature = loadFeature("./src/bdd/features/documents_page.feature");

defineFeature(feature, (test) => {
  test("User views the documents page with mock data", ({ given, then, and }) => {
    given("the user is on the documents page", () => {
      // DocumentsPage renders child components that use react-router's <Link>.
      // We wrap it in MemoryRouter to provide the necessary context for the test.
      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      );
    });

    then(/^they should see the "(.*)" document$/, (documentName) => {
      expect(screen.getByText(documentName)).toBeInTheDocument();
    });

    and(/^they should see the "(.*)" folder$/, (folderName) => {
      expect(screen.getByText(folderName)).toBeInTheDocument();
    });
  });
});
