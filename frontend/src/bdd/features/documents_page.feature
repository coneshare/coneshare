Feature: Documents Page Display

  Scenario: User views the documents page with mock data
    Given the user is on the documents page
    Then they should see the "Q1 Report.pdf" document
    And they should see the "Project Alpha" folder
