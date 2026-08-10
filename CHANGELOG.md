# Changelog

## [2.0.0](https://github.com/gengjiawen/c-parser/compare/v1.2.0...v2.0.0) (2026-08-10)


### ⚠ BREAKING CHANGES

* **preprocessor:** parse() preprocesses by default — directives no longer leak into the parser as tokens, and macros expand in the AST. Pass preprocess: false for the previous raw token-stream behavior.

### Features

* **lexer:** support C11 digraphs ([cef526c](https://github.com/gengjiawen/c-parser/commit/cef526c1f9c0e4f81c3e4927d6a52bd150ac26d5))
* **lexer:** support universal character names and UTF-8 in identifiers ([8f67fd4](https://github.com/gengjiawen/c-parser/commit/8f67fd441bd0798ea0e9197835b3ba681933fad1))
* **parser:** support __builtin_offsetof with full member designators ([3af45be](https://github.com/gengjiawen/c-parser/commit/3af45be3447d1546d9d5cf7ab454a9ff3d89e2c9))
* **playground:** add QuickJS idioms example ([#14](https://github.com/gengjiawen/c-parser/issues/14)) ([8a3d467](https://github.com/gengjiawen/c-parser/commit/8a3d46709a2f522c1168ea256cd66746a08528bf))
* **playground:** expand QuickJS idioms example ([#16](https://github.com/gengjiawen/c-parser/issues/16)) ([ad49446](https://github.com/gengjiawen/c-parser/commit/ad494461399f3e3c5f4e67cc0b67a99f75fce526))
* **playground:** stack editor and result panels on mobile ([#11](https://github.com/gengjiawen/c-parser/issues/11)) ([3c3aea6](https://github.com/gengjiawen/c-parser/commit/3c3aea6b634aec1e563c614db0a036f73da8b6a8))
* **preprocessor:** add built-in C preprocessor, enabled by default ([#15](https://github.com/gengjiawen/c-parser/issues/15)) ([9a46c30](https://github.com/gengjiawen/c-parser/commit/9a46c30957d5d000f8fcae498f10be0d0c886c96))


### Bug Fixes

* **lexer:** diagnose unterminated block comments ([56dc3b8](https://github.com/gengjiawen/c-parser/commit/56dc3b8bb20b18f3e2dbc13ffdb6902c8990f15a))
* **lexer:** iterate instead of recursing on stray characters ([f243d88](https://github.com/gengjiawen/c-parser/commit/f243d885f82811ac2798c51376d8717db845fd51))
* **lexer:** size numeric escapes by the literal's encoding prefix ([aff635c](https://github.com/gengjiawen/c-parser/commit/aff635ce26e3626b5bee90189087bb447549c9d5))
* **parser:** accept _Atomic as a pointer qualifier ([e21c843](https://github.com/gengjiawen/c-parser/commit/e21c843598638b25cd2f0382c74ea47efcfb1cc8))
* **parser:** allow a label at the end of a compound statement ([2ca7348](https://github.com/gengjiawen/c-parser/commit/2ca7348c3fba5f3013af331c1099ebd9ea61683a))
* **parser:** count only syntactic nesting ([04e5425](https://github.com/gengjiawen/c-parser/commit/04e54250c87b44f9c755368bd5cb0c1785180132))
* **parser:** guard recursion depth so deep nesting cannot crash parse() ([c4be48a](https://github.com/gengjiawen/c-parser/commit/c4be48a411b27de099b7075de714f0c45b87459f))
* **parser:** honor aggregate alignment modifiers ([612161e](https://github.com/gengjiawen/c-parser/commit/612161e79e7bc47eb3362eca9ef72c85ed758e4b))
* **parser:** keep a pending _Alignas off the struct body it precedes ([129c614](https://github.com/gengjiawen/c-parser/commit/129c614b7228f07f9f8e17e1585b11faa436239f))
* **parser:** keep array dimensions on parenthesized parameter declarators ([1022e54](https://github.com/gengjiawen/c-parser/commit/1022e5490280e9acec883a570bb3731869f8af8e))
* **parser:** keep pointer declarators inside redundant parameter parens ([88fb880](https://github.com/gengjiawen/c-parser/commit/88fb8807015940f12519e913e8d10068885f80a5))
* **parser:** nest abstract function-pointer declarators correctly ([ec7c27c](https://github.com/gengjiawen/c-parser/commit/ec7c27cf1157eab94eb25b1e5e87ec8ab7f0eb03))
* **parser:** parse compound literals as sizeof/_Alignof operands ([e915b7a](https://github.com/gengjiawen/c-parser/commit/e915b7a8de40974d49ed8be9faaab38cb94328a6))
* **parser:** preserve declarator nesting through function-pointer groups ([962832f](https://github.com/gengjiawen/c-parser/commit/962832fa9b67c66c51673fcb168b4b91f057b0c3))
* **parser:** preserve nested parameter pointer levels ([4777e9b](https://github.com/gengjiawen/c-parser/commit/4777e9ba73a6825272c68c48edd195c414d01b5e))
* **parser:** report the input discarded when nesting is cut off ([78b708d](https://github.com/gengjiawen/c-parser/commit/78b708d1cfda7f76cc71930c0fb1c6eb750b6e5c))
* **parser:** span each InitDeclarator over its own declarator text ([d0b351e](https://github.com/gengjiawen/c-parser/commit/d0b351e218330db1c179c4c2687c9e89ab43207a))
* **parser:** stop type-name qualifiers leaking into the enclosing declaration ([df04f0a](https://github.com/gengjiawen/c-parser/commit/df04f0a2e7e9b83465d6b286ba60ad929ae625ed))
* **parser:** wire _Alignof and enum constant folding to their implementations ([025f7ee](https://github.com/gengjiawen/c-parser/commit/025f7eec40b21db119e30bc401971426067b0bdc))
* **preprocessor:** delete the GNU comma for variadic-only macros ([2d55f33](https://github.com/gengjiawen/c-parser/commit/2d55f33cd55a90e07abee7f79c44edeca6da1378))
* **preprocessor:** keep a ## placemarker from swallowing the token before it ([c458c1b](https://github.com/gengjiawen/c-parser/commit/c458c1bf1d2d7f11c864106b8a7a7db8ff3c35e1))
* **preprocessor:** keep stray tokens through # stringification ([e924e8e](https://github.com/gengjiawen/c-parser/commit/e924e8e0ff9e77491bf29146db74f9d8682e38af))
* **preprocessor:** protect the operand of a macro-produced `defined` ([8d77f9b](https://github.com/gengjiawen/c-parser/commit/8d77f9b198c95d5e6c326a1cdf704638f9252d91))
* **preprocessor:** warn, don't error, on a bad literal in #error/#warning text ([334b949](https://github.com/gengjiawen/c-parser/commit/334b9493b6f967f340d969b2163045464ac7492f))

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
