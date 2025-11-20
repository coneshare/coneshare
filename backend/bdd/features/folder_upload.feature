Feature: Folder Structure Upload
  As an authenticated user,
  I want to upload files with paths to create a folder structure
  so that I can organize my documents upon upload.

  Scenario: User uploads files that create a nested folder structure
    Given I am an authenticated user
    And my document list is empty
    When I upload the following files in a batch:
      | filename         | path                               |
      | Q1_Summary.pdf   | My Reports/Q1_Summary.pdf          |
      | Old_Data.csv     | My Reports/Archive/Old_Data.csv    |
    Then the folder "My Reports" should exist at the root
    And the folder "Archive" should exist inside "My Reports"
    And the document "Q1_Summary.pdf" should exist in the folder "My Reports"
    And the document "Old_Data.csv" should exist in the folder "Archive"

  Scenario: User uploads a folder that already exists at the root
    Given I am an authenticated user
    And the folder "My Reports" exists at the root
    When I upload the following files in a batch:
      | filename         | path                      |
      | Q2_Summary.pdf   | My Reports/Q2_Summary.pdf |
    Then the folder "My Reports (2)" should exist at the root
    And the document "Q2_Summary.pdf" should exist in the folder "My Reports (2)"
