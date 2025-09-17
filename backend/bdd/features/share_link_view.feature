Feature: Share Link Viewing
  As a viewer, I need to be able to access public share links, respecting any security controls set by the creator.

  Scenario: A viewer cannot access a password-protected share link without authorization
    Given I am an authenticated user
    And I have a document named "Secure Report.pdf"
    And I create a password-protected share link for that document
    When an anonymous viewer tries to access the share link data
    Then the API should respond with an unauthorized status
