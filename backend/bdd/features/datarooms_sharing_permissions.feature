Feature: Dataroom Share Link Permissions
  As a dataroom owner
  I want to set granular permissions on a share link
  So that I can control how viewers interact with the content

  Scenario: Owner sets granular permissions for a dataroom share link
    Given I am an authenticated user
    And I have a dataroom named "Project Alpha"
    And the dataroom contains a document named "Financials.pdf"
    And the dataroom contains a document named "Strategy.docx"
    When I create a share link for the dataroom "Project Alpha"
    And I update the link's settings to make "Financials.pdf" not visible
    And I update the link's settings to make "Strategy.docx" not downloadable
    Then the share link settings for "Financials.pdf" should have "is_visible" as false
    And the share link settings for "Strategy.docx" should have "allow_download" as false

  Scenario: Viewer sees only visible content in a dataroom share link
    Given I am an authenticated user
    And a dataroom share link exists
    And its settings make "Financials.pdf" not visible
    And its settings make "Strategy.docx" visible
    When a viewer accesses the public data for the dataroom share link
    Then the response should contain the document "Strategy.docx"
    And the response should not contain the document "Financials.pdf"

  Scenario: An item inside an invisible folder is not visible
    Given I am an authenticated user
    And a dataroom share link exists
    And the dataroom has a folder "Legal Docs" containing a document "Agreement.pdf"
    And the link's settings make the folder "Legal Docs" not visible
    And the link's settings make the document "Agreement.pdf" visible
    When a viewer accesses the public data for the dataroom share link
    Then the response should not contain the folder "Legal Docs"
    And the response should not contain the document "Agreement.pdf"

  Scenario: Viewer respects the allow_download setting for an individual item
    Given I am an authenticated user
    And a dataroom share link exists
    And its settings make "Strategy.docx" visible but not downloadable
    When a viewer accesses the public data for the dataroom share link
    Then the data for "Strategy.docx" should have "allow_download" as false

  Scenario: A downloadable folder does not allow downloading a restricted item inside it
    Given I am an authenticated user
    And a dataroom share link exists
    And the dataroom has a folder "Public Reports" containing a document "InternalNotes.pdf"
    And the link's settings make the folder "Public Reports" downloadable
    And the link's settings make the document "InternalNotes.pdf" not downloadable
    When a viewer accesses the public data for the dataroom share link
    Then the data for the folder "Public Reports" should have "allow_download" as true
    And the data for the document "InternalNotes.pdf" should have "allow_download" as false
