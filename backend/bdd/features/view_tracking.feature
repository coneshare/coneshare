Feature: View Tracking
  As a document owner
  I want to track viewer activity
  So that I can understand engagement

  Scenario: A viewer's activity is tracked for a document
    Given I am an authenticated user
    And I have a document with a share link
    When a viewer creates a view session for the share link from "198.51.100.1" with user agent "Test Browser"
    And the viewer spends 15 seconds on page 1
    Then a page view should be recorded for page 1 with a duration of 15 seconds
    And the total view duration for the session should be 15 seconds
    And the view session should have IP "198.51.100.1" and user agent "Test Browser"
