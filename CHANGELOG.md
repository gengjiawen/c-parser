# Changelog

## [1.2.0](https://github.com/gengjiawen/c-parser/compare/v1.1.0...v1.2.0) (2026-08-02)


### Features

* **playground:** add svg favicon ([eede83e](https://github.com/gengjiawen/c-parser/commit/eede83e1cbe348f648d07826cc3999937829ac5e))


### Bug Fixes

* **lexer:** skip unterminated block comments to end of input ([897823c](https://github.com/gengjiawen/c-parser/commit/897823c58b0feb528c26e6ea3a9d1da3522c043e))
* **parser:** bound GCC range designator expansion ([35e10e2](https://github.com/gengjiawen/c-parser/commit/35e10e265795887c7cb5b90ae39af03976d45c11))
* **parser:** compute TopLevelAsm span from the directive, not after it ([7f4be5d](https://github.com/gengjiawen/c-parser/commit/7f4be5d189afa84b72c8484a44cb5d92e6853ad7))
* **parser:** read both value and bigValue for integer literals ([233c7ad](https://github.com/gengjiawen/c-parser/commit/233c7ad06c69ce86c14023d53b0273b682269da8))
* **parser:** span statements and expressions over their full extent ([bbf7c10](https://github.com/gengjiawen/c-parser/commit/bbf7c10b1dd9ce3c6fe3d95d4269bb021cc53694))
* **parser:** stop infinite loop on __attribute__ after a type specifier ([6f3d3e7](https://github.com/gengjiawen/c-parser/commit/6f3d3e7db90c55357d2c9c15d67c070014650652))
* **parser:** stop labels from swallowing the labelled null statement ([d715cf8](https://github.com/gengjiawen/c-parser/commit/d715cf8921f496c7e1aa3d772eb6846c8d194a1f))

## 1.1.0 (2026-02-15)


### Features

* add c11 examples ([11bb6be](https://github.com/gengjiawen/c-parser/commit/11bb6be41d58b62ccd21f01f6bea73c46717e526))
* add playground ([38a4c47](https://github.com/gengjiawen/c-parser/commit/38a4c477097f64ad125f6febbb351cbcc17a1308))
* **ast:** make loc optional and compute on demand ([6266d77](https://github.com/gengjiawen/c-parser/commit/6266d774da137246b54d3730c098f1eef256dd11))
* deploy to gh pages ([23331fb](https://github.com/gengjiawen/c-parser/commit/23331fbf0296f6812cd0d12cb27697115c0c4907))
* **parser:** track spans for type and declarator metadata ([8f72d70](https://github.com/gengjiawen/c-parser/commit/8f72d70c188714e23097036cc8894243dbddcb43))


### Bug Fixes

* add fmt:check script and use it in CI ([b53e3b6](https://github.com/gengjiawen/c-parser/commit/b53e3b65aa43a350f6a90b915fecfe43d393523a))
* change package name ([6dbad6b](https://github.com/gengjiawen/c-parser/commit/6dbad6bad06d896a0ed051e75f24ddfed9477df0))
* gcc extension and c11 parse bug ([68e8ff6](https://github.com/gengjiawen/c-parser/commit/68e8ff6ca4a3237abe05e5853ac55f4aebc5904a))
* install playground deps before build in deploy workflow ([34a34a2](https://github.com/gengjiawen/c-parser/commit/34a34a2d7588d6d4589d12ca2addf210cc8af79f))
* reorder examples ([cb37869](https://github.com/gengjiawen/c-parser/commit/cb3786988c8063155be4c9068f569aeb5c475863))
* update CI workflow to use Node.js LTS version and pnpm 9, removing matrix strategy for node versions. ([7fcc74c](https://github.com/gengjiawen/c-parser/commit/7fcc74c223f4d702cb9bb4cde90775e8815cf30a))


### Miscellaneous Chores

* **release:** force 1.1.0 ([8cc62a5](https://github.com/gengjiawen/c-parser/commit/8cc62a574d3649730719e993a90ca92001afb4d9))
