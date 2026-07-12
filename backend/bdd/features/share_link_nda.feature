Feature: Share Link NDA Gate
  As a document owner
  I want to require viewers to accept an NDA before accessing my document
  So that I can protect confidential information

  Scenario: A viewer accepts the NDA and gains access to the document
    Given I am an authenticated user
    And I have a document with a share link that requires NDA
    When an anonymous viewer requests access to the view-data endpoint
    Then they should be denied access with an NDA required message
    When they submit the NDA acceptance request
    Then they should receive a view session ID
    And they should be granted access to the document
