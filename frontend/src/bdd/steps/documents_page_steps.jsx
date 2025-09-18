import React from "react";
import { render, screen } from "@testing-library/react";
import { describeFeature, loadFeature } from "@amiceli/vitest-cucumber";
import { expect } from "vitest";
import DocumentsPage from "../../pages/DocumentsPage";
import { MemoryRouter } from "react-router-dom";

const feature = await loadFeature("./src/bdd/features/documents_page.feature");

describeFeature(feature, ({ Scenario }) => {
  Scenario("User views the documents page with mock data", ({ Given, Then, And }) => {
    Given("the user is on the documents page", () => {
      // DocumentsPage renders child components that use react-router's <Link>.
      // We wrap it in MemoryRouter to provide the necessary context for the test.
      render(
        <MemoryRouter>
          <DocumentsPage />
        </MemoryRouter>
      );
    });

    Then(/^they should see the "(.*)" document$/, (documentName) => {
      expect(screen.getByText(documentName)).toBeInTheDocument();
    });

    And(/^they should see the "(.*)" folder$/, (folderName) => {
      expect(screen.getByText(folderName)).toBeInTheDocument();
    });
  });
});
