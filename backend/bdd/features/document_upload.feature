Feature: Document Upload Workflow
  As an authenticated user,
  I want to upload a document and see it in my document list
  to ensure my files are correctly managed.

  Scenario: User uploads their first document
    Given I am an authenticated user
    And my document list is empty
    When I upload a new document named "workflow_doc.pdf"
    Then the document list should contain 1 document
    And the document should be named "workflow_doc.pdf"
    And the document status should be "ready"
