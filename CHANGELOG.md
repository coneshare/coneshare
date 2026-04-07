# Changelog

## [1.1.3](https://github.com/coneshare/coneshare/compare/v1.1.2...v1.1.3) (2026-04-07)


### Bug Fixes

* **backend:** rename duplicate root uploads by resolving root folder path ([acd882a](https://github.com/coneshare/coneshare/commit/acd882acc35ec76a415cf6a359cdb4267fe048be))
* **frontend:** align dataroom permission columns and clarify folder cascade ([679be34](https://github.com/coneshare/coneshare/commit/679be34ab678b4d6e44c121b3610ed2e02b796c7))
* **sharelinks:** honor dataroom item watermark in view-data and render ([ce48b64](https://github.com/coneshare/coneshare/commit/ce48b640f0cfa598eda085cdbb28e2901fce384f))
* **sharelinks:** require session auth for render-page endpoint ([3f51823](https://github.com/coneshare/coneshare/commit/3f51823aea004c118146a555f12e6fffc68c78e4))
* **viewer:** stabilize initial page detection in share link preview ([4946ca4](https://github.com/coneshare/coneshare/commit/4946ca4b19f108ad0cd41ea1447add36e651e0c5))

## [1.1.2](https://github.com/coneshare/coneshare/compare/v1.1.1...v1.1.2) (2026-03-09)


### Features

* Make password validators configurable via environment ([7c6221c](https://github.com/coneshare/coneshare/commit/7c6221c0198989b8ac984be99f11b9975139c527))
* Match container uid/gid with host ([aae283e](https://github.com/coneshare/coneshare/commit/aae283e7cf77a261929723886b5c31c937221f40))


### Bug Fixes

* Encode Content-Disposition filename using RFC 5987 ([ab77812](https://github.com/coneshare/coneshare/commit/ab778128aa6d601ef52424822385ece6c12ace22))
* Enforce dataroom document visibility for downloads ([739cde3](https://github.com/coneshare/coneshare/commit/739cde33a73df7ade84e026caf8eff8ab6143133))
* Enforce default authenticated access for DRF views ([4ffa818](https://github.com/coneshare/coneshare/commit/4ffa818eae444b1e0be419c354e09562ed8b3da1))
* fix None puid and pgid ([61db674](https://github.com/coneshare/coneshare/commit/61db674d9d006cb3a5c43e2bc7e49b2980f0f948))
* fix security headers in nginx ([d07aff7](https://github.com/coneshare/coneshare/commit/d07aff740efa7a711c96d17d4702d3493a3e2d8c))
* Secure upload/download handlers against path traversal ([6b152ca](https://github.com/coneshare/coneshare/commit/6b152ca27e069bf9ff202a8f1dddcf156e533147))
* Use list-form `check_call` to avoid shell interpretation ([0d5e996](https://github.com/coneshare/coneshare/commit/0d5e9968d23c407372d804567d0309ea67dadc8d))
* Validate content ownership in dataroom add-content endpoint ([5993994](https://github.com/coneshare/coneshare/commit/59939946976faedf093cea54caeeacdffa047303))

## [1.1.1](https://github.com/coneshare/coneshare/compare/v1.1.0...v1.1.1) (2026-03-06)


### Features

* Add download action to documents list item dropdown menu ([5960eeb](https://github.com/coneshare/coneshare/commit/5960eebace693da2130f16b6175fd2b07578f1ed))
* Add file request feature to portal features ([f1bd2b6](https://github.com/coneshare/coneshare/commit/f1bd2b6674fc92c58641a576618f7bd6cb8231a9))
* Add new 'copy document' functionality, enabling users to duplicate their documents ([2a1894d](https://github.com/coneshare/coneshare/commit/2a1894dc2339a0ffe324c344f8b877a7dc59ece6))
* Force file download by setting Content-Disposition header ([60cbae8](https://github.com/coneshare/coneshare/commit/60cbae852fe61e1ae7328208e32faa7e6719addd))


### Bug Fixes

* Allow multiple users to create same-named folders ([7eceaa3](https://github.com/coneshare/coneshare/commit/7eceaa3fa49cdd3fd200694467d328bece8ad747))
* Reorder functions to prevent initialization error in DocumentsPage ([9917fe5](https://github.com/coneshare/coneshare/commit/9917fe589f6bbb7fbd711c34333e02488b250b57))

## [1.1.0](https://github.com/coneshare/coneshare/compare/v1.0.0...v1.1.0) (2026-02-18)


### Features

* Add Docs link to header navigation bar ([ae9ddf9](https://github.com/coneshare/coneshare/commit/ae9ddf98feeefa6d887479f1e34029757fdd4d81))
* Add 'File Requests' Feature: Share Upload Link for Collecting Files from Users ([#118](https://github.com/coneshare/coneshare/pull/118)) ([#119](https://github.com/coneshare/coneshare/pull/119))
* Implement Release Please workflow for automated releases ([b89d92c](https://github.com/coneshare/coneshare/commit/b89d92c68fa4ff123a7bf4d14272c03c39d1e4ca))


### Bug Fixes

* Ensure atomic transaction for file upload finalization ([445f2b6](https://github.com/coneshare/coneshare/commit/445f2b6fe2536e184e6d0000d7cc9e3cd4e59814))
