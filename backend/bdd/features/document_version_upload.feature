Feature: Document Versioning
  As an authenticated user, I need to be able to upload a new version, promote an older version, and preview specific versions.

  Scenario: User uploads a new version of an existing document
    Given I am an authenticated user
    And I have a document named "Annual Report v1.pdf"
    When I upload a new version of the document named "Annual Report v2.pdf"
    Then the document should have 2 versions
    And the document's latest version should be version number 2
    And the document status should be "ready"

  Scenario: User promotes an older document version to be primary
    Given I am an authenticated user
    And I have a document named "Financial Report.pdf" with 3 versions
    When I promote version 2 of the document to be primary
    Then version 2 should be the primary version
    And the document size should match version 2's size
    And version 3 should not be the primary version

  Scenario: User previews a specific document version
    Given I am an authenticated user
    And I have a document named "Design Specs.pdf" with 2 versions
    When I request preview data for version 1
    Then the preview response should contain version 1 details
