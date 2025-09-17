Feature: Document Versioning
  As an authenticated user, I need to be able to upload a new version of an existing document.

  Scenario: User uploads a new version of an existing document
    Given I am an authenticated user
    And I have a document named "Annual Report v1.pdf"
    When I upload a new version of the document named "Annual Report v2.pdf"
    Then the document should have 2 versions
    And the document's latest version should be version number 2
    And the document status should be "processing"
