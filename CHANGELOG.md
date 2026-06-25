# Changelog


## [1.5.0](https://github.com/coneshare/coneshare/compare/v1.4.0...v1.5.0) (2026-06-25)


### Features

* **admin:** implement Admin User Detail page with quota usage, share links, and datarooms ([66106d8](https://github.com/coneshare/coneshare/commit/66106d83fcf7afedc400b0d2efdb71323cd8e85e))
* **datarooms:** support file/folder uploads in dataroom directly ([a94d63c](https://github.com/coneshare/coneshare/commit/a94d63c4b0802c0ded4b614afe4602c41ecc8c85))
* **frontend:** redesign public verification and file request forms with branding and footers ([e45d0c7](https://github.com/coneshare/coneshare/commit/e45d0c792d34a865f7267520fa8b0c92cb78f3eb))
* **sharelinks:** implement scanner-tolerant magic link email verification ([63ff763](https://github.com/coneshare/coneshare/commit/63ff7631b16a34c004895727fc4f29c471c49976))
* **viewer:** update eager document preview generation to lazy ([25ac1a1](https://github.com/coneshare/coneshare/commit/25ac1a1fc96e826b9958326dce160ee3ba925d21))
* **viewer:** support client pdfjs viewer ([bdcedd6](https://github.com/coneshare/coneshare/commit/bdcedd637fc69130d33d940ca83c77bb9095f198))
* **viewer:** add collapsible sibling navigation rail and keyboard shortcuts ([1a44f74](https://github.com/coneshare/coneshare/commit/1a44f74b455dea68469724858889d7bd1f2aad7e))
* **viewer:** implement inline dataroom document viewer and deep link routing ([dabf5de](https://github.com/coneshare/coneshare/commit/dabf5def9ce08bf1e50b48c9644a1aeb1479d6ab))
* **viewer:** redesign PDF viewer toolbar with floating glassmorphism and print support ([5df9722](https://github.com/coneshare/coneshare/commit/5df97228566c20d20a71506437a566cbf3c4a440))
* **viewer:** support dataroom preview action and add preview mode warning banner ([95a9793](https://github.com/coneshare/coneshare/commit/95a9793f642373f826844b8cdcce652ddc5f3a11))


### Bug Fixes

* **datarooms:** resolve out-of-sync 409 conflict during dataroom item reordering ([d9e175d](https://github.com/coneshare/coneshare/commit/d9e175d015d837f6c10efdda1352e376b2df86ed))


## [1.4.0](https://github.com/coneshare/coneshare/compare/v1.3.2...v1.4.0) (2026-06-02)


### Features

* **sharelinks:** show share link view counts in document lists ([eeec127](https://github.com/coneshare/coneshare/commit/eeec127238eda4de877dcc283739e955b24500ae))
* **filerequests:** add custom intake fields ([4fbcd3a](https://github.com/coneshare/coneshare/commit/4fbcd3aaba5e75042a88143b1d5c64d9d24b54d1))
* **filerequests:** add virus scan to upload documents ([44505b7](https://github.com/coneshare/coneshare/commit/44505b7e40a4fbaacd697914f8849a8f46299d45))
* **sharelinks:** add Q&A in dataroom and document link ([406208a](https://github.com/coneshare/coneshare/commit/406208a1def4c6f45853d7bea5a5d339ef9b52ab))
* **logging:** support Sentry integration ([d0800ac](https://github.com/coneshare/coneshare/commit/d0800ac2ea7b02ca11c7dabd34c09a491a6dec68))

### Bug Fixes

* **automation:** make event message more friendly ([b49acce](https://github.com/coneshare/coneshare/commit/b49acce5903e484ce92eae099b4fd1e7ff403678))
* **backend:** fix health check throttle ([dc59c58](https://github.com/coneshare/coneshare/commit/dc59c58effb105ffdb34f874cd6b0df9877199bf))

## [1.3.2](https://github.com/coneshare/coneshare/compare/v1.3.1...v1.3.2) (2026-05-21)


### Improvements

* **auth:** add configurable sign-up controls ([c298741](https://github.com/coneshare/coneshare/commit/c298741aff3dfdbbbbdf2b6646785eb7fbedd075))
* **filerequests:** embeding file request page ([5a397b9](https://github.com/coneshare/coneshare/commit/5a397b940dcb995431061459f3c6eb2f82c4a1bb))
* **filerequests:** enforce upload type policy and expose frontend controls ([6026ef8](https://github.com/coneshare/coneshare/commit/6026ef8cee42e3c5b49596c58fb565cfb8720b93))
* **settings:** add typed dynamic settings and redesign admin settings UI ([c383451](https://github.com/coneshare/coneshare/commit/c3834519a53ed6e1aa106984cc209cca521a7182))
* **datarooms:** add safe default pagination and viewer load-more ([d0df9ed](https://github.com/coneshare/coneshare/commit/d0df9edb25a470868a52a4f6ddc77f309956cfca))
* **datarooms:** optimize scoped view-data queries and ancestor lookup ([40a45ef](https://github.com/coneshare/coneshare/commit/40a45ef120b2a3426f8a34a22af0790534a5124b))
* **sharelinks:** avoid redundant scope queryset evaluations ([69208dc](https://github.com/coneshare/coneshare/commit/69208dcd29c6c5e7ed44d98f05c55c28550c098c))

## [1.3.1](https://github.com/coneshare/coneshare/compare/v1.3.0...v1.3.1) (2026-05-10)


### Bug Fixes

* **frontend:** add delete section in dataroom settings ([e9063e3](https://github.com/coneshare/coneshare/commit/e9063e3be11663e207dabe8549cafccd83f5a644))
* **frontend:** fix share action in dataroom list ([d459909](https://github.com/coneshare/coneshare/commit/d45990923a8fbbd2edd1e0dd1712d3dd1a1d824e))
* **frontend:** make dataroom viewer UI mobile friendly ([f35bfcc](https://github.com/coneshare/coneshare/commit/f35bfcc5caceaf3025f02b7a32d5db2bea01644f))
* **frontend:** show full response errors in Delivery Logs table ([81cae4d](https://github.com/coneshare/coneshare/commit/81cae4d99af3a70c3bb2fafa89f8200e773f0f3b))
* **sharelinks:** fix duplicated documents cause dataroom viewer 500 error ([abc483f](https://github.com/coneshare/coneshare/commit/abc483f1b35a0f3a1596940111ccc0e1cb5f6b40))

## [1.3.0](https://github.com/coneshare/coneshare/compare/v1.2.1...v1.3.0) (2026-05-06)


### Features

* **datarooms:** add settings to set dataroom branding and reorder ([93ff31d](https://github.com/coneshare/coneshare/commit/93ff31dc516297b19fcf4db037253583ad54bad5))
* **frontend:** update file type icons ([faeca0f](https://github.com/coneshare/coneshare/commit/faeca0f7ad727d602a4851aeb510297c74ee2fe0))
* **sharelinks:** show masked owner info on protected access dialogs ([faae29f](https://github.com/coneshare/coneshare/commit/faae29fc1ddbde9d50c1b614dc066ea505469324))
* **sharelinks:** return scoped items in share link viewer ([5388f8d](https://github.com/coneshare/coneshare/commit/5388f8d1fac949d444d8f50e6756faf18ccaf370))


### Bug Fixes

* **backend:** return 404 for missing APIs, not frontend template rendering ([d841c2a](https://github.com/coneshare/coneshare/commit/d841c2ab109388d0e038fd9d482a73a411d4be74))
* **sharelinks:** harden public access UX and 401 protection handling ([beb24ea](https://github.com/coneshare/coneshare/commit/beb24ea996dcf178680d2cdec526bd1116f123c8))
* fix GeoIP return None city issue ([d336b0c](https://github.com/coneshare/coneshare/commit/d336b0c63e8769255a8b656e5d993f1ff22259fd))


## [1.2.1](https://github.com/coneshare/coneshare/compare/v1.2.0...v1.2.1) (2026-04-20)


### Bug Fixes

* **frontend:** disable non-preview download when link forbids it ([e0e2f88](https://github.com/coneshare/coneshare/commit/e0e2f8882e5cbe0eb293ff2134c88302d822f1df))
* **frontend:** pass required props to document preview modal viewer ([24370bc](https://github.com/coneshare/coneshare/commit/24370bc68ccb4ac4d85bfcb8a65f3127eccc8076))


## [1.2.0](https://github.com/coneshare/coneshare/compare/v1.1.3...v1.2.0) (2026-04-16)


### Features

* **automations:** document activity automations feature ([ad20070](https://github.com/coneshare/coneshare/commit/ad200707882f29ff07339751dd58b8834d667ff7))
* **backend:** add coneshare open api ([19f1bfc](https://github.com/coneshare/coneshare/commit/19f1bfca556f8d67000cf7322d075866c735f6c8))
* **frontend:** add api docs link to sidebar ([adb5191](https://github.com/coneshare/coneshare/commit/adb5191ac8a7eab9f7e3afeafd54a5f5dea0dad7))
* **automations:** enrich webhook payload and include event_type ([d1a9e0c](https://github.com/coneshare/coneshare/commit/d1a9e0c25b6723fd2d45be30d28786a0324b9817))


### Fixes

* **datarooms:** fix datarooms doc/folder stars ([ace0ce9](https://github.com/coneshare/coneshare/commit/ace0ce9af14b33fe2195ed682a2bd1efe8cfc69e))


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
