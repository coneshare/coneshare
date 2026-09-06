# Changelog


## [1.9.0](https://github.com/coneshare/coneshare/compare/v1.8.1...v1.9.0) (2026-09-06)


### Features

* **admin:** organization-wide dataroom governance, server-side sorting, and quota management ([7cafa48](https://github.com/coneshare/coneshare/commit/7cafa4827f465df0e5bd4eb845ac1254c8da98ed))
* **backend:** implement dataroom collaboration, v2 system vault storage, quotas, and permissions ([c8b198a](https://github.com/coneshare/coneshare/commit/c8b198af60487fdd641750f7bde024d2fb8c09e3))
* **datarooms:** add aggregate stats to dataroom links view and exclude bounces from avg duration ([6ed0460](https://github.com/coneshare/coneshare/commit/6ed046052223ad9e1f58152ff47131b0d261f987))
* **datarooms:** preserve activity audit trail across item lifecycle mutations ([f5bc95c](https://github.com/coneshare/coneshare/commit/f5bc95cb6d80c0758d42640f93c21bb4ff5136a7))
* **frontend:** implement dataroom collaboration, v2 system vault storage, quotas, and permissions ([7ccfdbc](https://github.com/coneshare/coneshare/commit/7ccfdbcf918df70bcc733c39bba3885285f76f27))


### Bug Fixes

* **backend:** touch parent folder mtime when contents change (close [#315](https://github.com/coneshare/coneshare/issues/315)) ([4dca46a](https://github.com/coneshare/coneshare/commit/4dca46a4269e7a56c85e7b1c42c1e7997dc7edff))
* **datarooms:** add partial unique constraint on vault folders and harden subfolder creation ([7250a72](https://github.com/coneshare/coneshare/commit/7250a7236834713cc21064eed406f44585d55411))
* **datarooms:** clear created_by on subfolders during v2 upgrade to restore vault invariant and deduct quota ([fc38468](https://github.com/coneshare/coneshare/commit/fc384688ae260dfd653b6f6eb3306da205592a91))
* **datarooms:** decouple direct uploads from user personal storage quota ([372ba76](https://github.com/coneshare/coneshare/commit/372ba76514982c5a182c45034bf716b8113d0b8c))
* **datarooms:** fix unique visitors of stats ([a848e1b](https://github.com/coneshare/coneshare/commit/a848e1ba99c3912d668960e2ea17b21e7c29084a))
* **documents:** bypass user personal quota and enforce dataroom quota on vault document version promotion ([3835428](https://github.com/coneshare/coneshare/commit/38354283eb21fa18cb716a1775b0685c689f8209))
* **frontend:** add skeleton loading placeholders for sidebar quota and nav user ([4e22aa3](https://github.com/coneshare/coneshare/commit/4e22aa369b030d726e0e6fa8e3421adde6b95b27))
* order datarooms by creation time and localize toast messages ([21a2cf5](https://github.com/coneshare/coneshare/commit/21a2cf55f5795d3551e595237927bd573cf7fa58))
* **qna:** address review feedback on Q&A toggles ([d3e51d3](https://github.com/coneshare/coneshare/commit/d3e51d35a765969826d34483e78949f3384c738b))
* **tests:** update test case ([6a383b9](https://github.com/coneshare/coneshare/commit/6a383b902278e05941f673fae674dd97e7fb8c5a))
* **viewer:** reload dataroom documents reopened after navigating away ([1a6eacf](https://github.com/coneshare/coneshare/commit/1a6eacf0a1b191dc8df06240b02dab6232114af3))


### Performance Improvements

* **analytics:** optimize dashboard summary view and eliminate N+1 qu… ([#323](https://github.com/coneshare/coneshare/issues/323)) ([83c2dd9](https://github.com/coneshare/coneshare/commit/83c2dd9bf527905d97e1bf7da00733b1e095bf7d))

## [1.8.1](https://github.com/coneshare/coneshare/compare/v1.8.0...v1.8.1) (2026-08-26)


### Improvements

* **admin:** add user storage quota recalculation ([e0f7ae3](https://github.com/coneshare/coneshare/commit/e0f7ae36e607d6f76e376d3df19321da35220297))
* **i18n:** add full German language support across frontend and backend ([a52e258](https://github.com/coneshare/coneshare/commit/a52e2581725032f76b5652efd711311e664dcb88))


### Bug Fixes

* **backend:** respect owner language in automation email notifications ([48e781a](https://github.com/coneshare/coneshare/commit/48e781aff23fd993f4314b91483303eb687c4623))
* **backend:** return 404 for unmatched paths instead of 500 error ([#302](https://github.com/coneshare/coneshare/issues/302)) ([abf108e](https://github.com/coneshare/coneshare/commit/abf108e724fe214683f114c41b98c6fabb1dfb6f))
* **frontend:** guard dialogs, forms and action buttons against concurrent async requests ([6c0a205](https://github.com/coneshare/coneshare/commit/6c0a205b31e05eaa3f4c9c836d62711be9156c84))
* **frontend:** improve translations, header localization, and folder dialog UX ([e5d2b3b](https://github.com/coneshare/coneshare/commit/e5d2b3ba0134ad986ca83f4c21866ce926479bdc))
* **quota:** resolve negative user total_document_size on cloud import and dataroom deletion ([0c2e4e5](https://github.com/coneshare/coneshare/commit/0c2e4e5fa83d38c3efff12610d7f1e3183f63a2f))

## [1.8.0](https://github.com/coneshare/coneshare/compare/v1.7.1...v1.8.0) (2026-08-18)


### Features

* **api:** add api keys for external integration (e.g. MCP servers) ([37df3d6](https://github.com/coneshare/coneshare/commit/37df3d603d51394e26c511224d703a5a4c9c3002))
* **documents:** add soft-delete and trash page ([0934ce0](https://github.com/coneshare/coneshare/commit/0934ce05531a0b834f074ffc0e6293e90676a12c))
* **backend:** add i18n support for backend ([6c015b2](https://github.com/coneshare/coneshare/commit/6c015b2aba8f2d89a56f73745bb9cf62e764f6c7))
* **frontend:** add i18n support for frontend ([cd54bfa](https://github.com/coneshare/coneshare/commit/cd54bfaac51bf14b72f705a6d2de6be1e5a5ef77))
* **frontend:** add in-page MCP setup instructions to API keys page ([887e8e3](https://github.com/coneshare/coneshare/commit/887e8e30bb0f6410ad9cd2e21a0e21ce5c8290c6))
* **frontend:** persist document list sorting configuration across reloads ([38ec57e](https://github.com/coneshare/coneshare/commit/38ec57ed60c1457ded019c4a05693b056d8be5f3))
* **mcp-server:** add remote MCP server ([4d1724e](https://github.com/coneshare/coneshare/commit/4d1724e36ca677da8977f04b264dc48c37b2f2ae))
* **mcp:** add dataroom and document CRUD tools and default watermark resolution ([3bb9b3d](https://github.com/coneshare/coneshare/commit/3bb9b3dfe79253818bc0350b29dc38ac2e79dac7))
* **mcp:** add upload document ([3e16c5f](https://github.com/coneshare/coneshare/commit/3e16c5f7cc0a1d12fd613b34c4e680b6c5722e01))


### Bug Fixes

* **datarooms:** preserve custom item order and exclude soft-deleted documents ([c2ddf26](https://github.com/coneshare/coneshare/commit/c2ddf2629f114658bdfada7fae35b6847113bcaa))
* **documents:** handle name collisions on rename and add translations ([334e6a6](https://github.com/coneshare/coneshare/commit/334e6a66c0244ea3d69c6851f60791006f24baa2))
* **frontend:** prevent move dialog overflow and add missing translations ([25c888a](https://github.com/coneshare/coneshare/commit/25c888a2ec915a5c0157c05f54e0f5db36c63c06))
* **frontend:** resolve dataroom move dialog folder extraction and translate remove actions ([55905f9](https://github.com/coneshare/coneshare/commit/55905f97d9fa17d3d0c70a7acbc0d9e5de570bf4))


## [1.7.1](https://github.com/coneshare/coneshare/compare/v1.7.0...v1.7.1) (2026-07-27)


### Bug Fixes

* **cloudfiles:** fallback to active provider connection during document refresh ([c2b41c2](https://github.com/coneshare/coneshare/commit/c2b41c2938426ca68cb35e7e309443f24771d986))
* **frontend:** fix dataroom files navigation and video seeking ([3bcec86](https://github.com/coneshare/coneshare/commit/3bcec864de5f6810f4794312d22da0a2bbde0dce))

## [1.7.0](https://github.com/coneshare/coneshare/compare/v1.6.0...v1.7.0) (2026-07-23)


### Features


* **automations:** coalesce view-session events for Email notification ([1f3d56d](https://github.com/coneshare/coneshare/commit/1f3d56d0bb47c290e9ad02ce6e021889b30f8e99))
* **cloudfiles:** display cloud storage integrations and file sync info ([ff7859f](https://github.com/coneshare/coneshare/commit/ff7859f336b9ac59e27021e1467752a249635e03))
* **filerequests:** file request export to cloud storage ([386b8ea](https://github.com/coneshare/coneshare/commit/386b8ea52fd58c983e7cf9bbcf882e509bad1a05))
* **frontend:** display user storage quota usage on admin users page ([e5aa7b3](https://github.com/coneshare/coneshare/commit/e5aa7b30f9744126a2292b0947618ae04829c99a))
* **frontend:** support drag-and-drop file/folder uploads in document list and dataroom ([4efe808](https://github.com/coneshare/coneshare/commit/4efe808c5a2c8c49d1d5d4845e65284369a1db9b))
* **settings:** support per-user custom storage quota limits ([e42b631](https://github.com/coneshare/coneshare/commit/e42b63194ffd32803a41e29d49771b0c68216f4b))
* **sharelinks:** clickable links tracking ([ec3adac](https://github.com/coneshare/coneshare/commit/ec3adacabb221abce642aa41f86348976113aeae))
* **sharelinks:** add nda feature ([ac81a03](https://github.com/coneshare/coneshare/commit/ac81a034bbdc0a5f8b874430932ba05e29561494))


### Bug Fixes

* **automations:** ensure destination linking and reschedule debounced email tasks ([63b3fb3](https://github.com/coneshare/coneshare/commit/63b3fb35c2ffc8da206e5479c1ab79d67c0eeaf7))
* **dataroom:** refactor dataroom sibling nav to file tree ([28b738b](https://github.com/coneshare/coneshare/commit/28b738b521906d5c326152beda78c1572ae9db7f))
* dynamic check video file size on preview ([a04dac1](https://github.com/coneshare/coneshare/commit/a04dac174a42b274067174c1f0ce826b4b7c401b))
* **frontend:** fix file request copy link issue ([755273d](https://github.com/coneshare/coneshare/commit/755273d6c3e73c57761d308162d029744335e7c6))
* **frontend:** sync user profile, quota, and avatar inside sidebar context ([a504abf](https://github.com/coneshare/coneshare/commit/a504abf1b71a914a283ba7edd2a9806b0c2470ba))
* **preview:** resolve indirect object JSON serialization and add preview retry trigger ([5d78d23](https://github.com/coneshare/coneshare/commit/5d78d2372adb457fdd6d176f6cf1535895dee6b7))


## [1.6.0](https://github.com/coneshare/coneshare/compare/v1.5.1...v1.6.0) (2026-07-09)


### Features

* **documents:** add version list/restore to documents ([4b986a0](https://github.com/coneshare/coneshare/commit/4b986a0090afc9bdf69e9e3c394ff9f0f8811b04))
* **documents:** support update new version of cloud files ([928f6a3](https://github.com/coneshare/coneshare/commit/928f6a32caae94a903d270e92a4d9e3c47da4f7d))
* **documents:** update document header, add rename operation ([59a0a73](https://github.com/coneshare/coneshare/commit/59a0a737fbe0ddf22acb3816db5e61385643ce99))
* **datarooms:** add hybrid preview link overlay and PDF flattening ([3baa8cd](https://github.com/coneshare/coneshare/commit/3baa8cd6e1d044e5a8a4a8ff305f792753a698ce))
* **datarooms:** support video previewing and streaming ([8e750cb](https://github.com/coneshare/coneshare/commit/8e750cb2741086c05904973adb3ad8b72d53736b))
* **settings:** support white labeling (logo, branding etc..) ([5246aa3](https://github.com/coneshare/coneshare/commit/5246aa30a1471d62264e4bba2a68f7f090a83bc0))


### Bug Fixes

* **backend:** fix download filename issue ([c43bb20](https://github.com/coneshare/coneshare/commit/c43bb20bb02d9f7d2a97218a2e0f3788b2ec60eb))
* **backend:** fix import gdrive internal files ([4147124](https://github.com/coneshare/coneshare/commit/41471242d8547d092cc9a8334629fde5015fedb5))
* **backend:** fix openapi warnings ([00dbecd](https://github.com/coneshare/coneshare/commit/00dbecd0903831005f83ead3b65b601412648b83))
* **cloudfiles:** secure import rollback on errors ([e41d00a](https://github.com/coneshare/coneshare/commit/e41d00a936d1b8bf2c718b74e89437c530bc7089))
* **documents:** fix issue that max video priview size confilict with file preview size ([b11ece9](https://github.com/coneshare/coneshare/commit/b11ece9cffbd4d3897b2b2d766c2ca9274cbb0ab))

## [1.5.1](https://github.com/coneshare/coneshare/compare/v1.5.0...v1.5.1) (2026-06-30)


### Bug Fixes

* **dashboard:** render file icons and dataroom links in dashboard widgets ([aec1c55](https://github.com/coneshare/coneshare/commit/aec1c559efaff238be18778e7b6b1a86e38b9393))
* **dataroom:** use FileTypeIcon in permissions and activity logs and fix spacer alignment ([0967d30](https://github.com/coneshare/coneshare/commit/0967d3055598f06d8596d03988f8eef44a23b169))
* **frontend:** align AddContentDialog file/folder icons with main file list ([a23e5ae](https://github.com/coneshare/coneshare/commit/a23e5ae07d0c116e405e2d8feb25de12be614885))
* **frontend:** close actions dropdown on item select and add test coverage ([8fa0ec7](https://github.com/coneshare/coneshare/commit/8fa0ec74fa18ac67db92767514c6cc6e69043f67))
* **frontend:** implement expandable folder tree in dataroom sidebar ([3eef317](https://github.com/coneshare/coneshare/commit/3eef317990bdf21d350814f45bf2f34baa3144ec))
* **viewer:** close action dropdown on select in dataroom viewer and add radix gotcha memory ([cc2f51c](https://github.com/coneshare/coneshare/commit/cc2f51cbefdc87fadd2f2464813363f60aa89d44))

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
