Feature: Share Link Analytics
  As an authenticated user,
  I want to create a share link and see who has viewed it
  to track engagement with my documents.

  Scenario: A viewer accesses a document through a share link
    Given I am an authenticated user
    And I have a document named "Financial Report Q3.pdf"
    When I create a share link for that document
    And an external viewer with email "viewer@example.com" views the document via the share link
    Then a "Viewer" record should exist for "viewer@example.com"
    And a "View" record should exist, linking the viewer and the share link
