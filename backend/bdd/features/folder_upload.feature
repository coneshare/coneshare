Feature: Folder Structure Upload
  As an authenticated user,
  I want to upload files with paths to create a folder structure
  so that I can organize my documents upon upload.

  Scenario: User uploads files that create a nested folder structure
    Given I am an authenticated user
    And my document list is empty
    When I upload a file named "Q1_Summary.pdf" with the path "My Reports/Q1_Summary.pdf"
    And I upload a file named "Old_Data.csv" with the path "My Reports/Archive/Old_Data.csv"
    Then the folder "My Reports" should exist at the root
    And the folder "Archive" should exist inside "My Reports"
    And the document "Q1_Summary.pdf" should exist in the folder "My Reports"
    And the document "Old_Data.csv" should exist in the folder "Archive"
