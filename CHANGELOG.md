# Changelog

## [2.1.0](https://github.com/gengjiawen/c-parser/compare/v2.0.1...v2.1.0) (2026-09-09)


### Features

* **parser:** recognize GNU extended floating types ([#77](https://github.com/gengjiawen/c-parser/issues/77)) ([960a319](https://github.com/gengjiawen/c-parser/commit/960a319a363f77f7ff426fe4175af0c364283ad5))
* **preprocessor:** support elifdef and elifndef branches ([#66](https://github.com/gengjiawen/c-parser/issues/66)) ([9271e4b](https://github.com/gengjiawen/c-parser/commit/9271e4bb4cba829083dc86534d78df36aa7d8187))


### Bug Fixes

* **ast:** preserve C11 function prototype information ([#86](https://github.com/gengjiawen/c-parser/issues/86)) ([dc0251d](https://github.com/gengjiawen/c-parser/commit/dc0251da3fd21b1b6086ff5ba8e1c984c01dbba9))
* **lexer:** diagnose malformed active literal spellings ([#81](https://github.com/gengjiawen/c-parser/issues/81)) ([8c06053](https://github.com/gengjiawen/c-parser/commit/8c06053a5ce2e3a63235a6ccebd58d8c9f95dced))
* **lexer:** handle standalone carriage returns consistently ([#47](https://github.com/gengjiawen/c-parser/issues/47)) ([0e534b1](https://github.com/gengjiawen/c-parser/commit/0e534b1114d7436fccf37a12ae2f62206ba46eb4))
* **lexer:** ignore a leading byte order mark ([#45](https://github.com/gengjiawen/c-parser/issues/45)) ([33ae256](https://github.com/gengjiawen/c-parser/commit/33ae256999b66fa29a05df6aeb000e070f44ecdc))
* **lexer:** promote UTF-16 character literals to int ([#60](https://github.com/gengjiawen/c-parser/issues/60)) ([4916f55](https://github.com/gengjiawen/c-parser/commit/4916f55d8588bcd9f8b252a1264930eb22ad858a))
* **lexer:** recognize the GNU signed keyword alias ([#88](https://github.com/gengjiawen/c-parser/issues/88)) ([d25ef52](https://github.com/gengjiawen/c-parser/commit/d25ef52a094e32da188cdb65194f16765bed8082))
* **package:** provide mode-specific declaration graphs ([#72](https://github.com/gengjiawen/c-parser/issues/72)) ([1e13778](https://github.com/gengjiawen/c-parser/commit/1e13778390208a20b185ae74c90ac7f3b8ad1bd1))
* **package:** restrict published files to distribution artifacts ([#56](https://github.com/gengjiawen/c-parser/issues/56)) ([89f3021](https://github.com/gengjiawen/c-parser/commit/89f30215ecbc63a7ceaf05e0a06b66452126d1d8))
* **parser:** accept GNU empty external declarations ([#84](https://github.com/gengjiawen/c-parser/issues/84)) ([fd798d3](https://github.com/gengjiawen/c-parser/commit/fd798d34886968cf36f88bf2091e8a56cdba3dff))
* **parser:** accept interleaved declaration specifiers ([#74](https://github.com/gengjiawen/c-parser/issues/74)) ([872e883](https://github.com/gengjiawen/c-parser/commit/872e883996655d84e8e6c048e136de757bbde6c8))
* **parser:** accept unparenthesized GNU alignof operands ([#64](https://github.com/gengjiawen/c-parser/issues/64)) ([933f9f0](https://github.com/gengjiawen/c-parser/commit/933f9f098b3d7ec8414762d372bf644a017967d7))
* **parser:** assign attributes to their own declarators ([#79](https://github.com/gengjiawen/c-parser/issues/79)) ([53757ad](https://github.com/gengjiawen/c-parser/commit/53757adcfb958d4003bfc969cffe689943ec92e4))
* **parser:** bound range materialization per translation unit ([#55](https://github.com/gengjiawen/c-parser/issues/55)) ([0a4b387](https://github.com/gengjiawen/c-parser/commit/0a4b3870e08ae4244057c2d8d0cd2bd13157e74c))
* **parser:** concatenate declaration asm label strings ([#51](https://github.com/gengjiawen/c-parser/issues/51)) ([3a0e1bc](https://github.com/gengjiawen/c-parser/commit/3a0e1bcb63e71a6f43ea86e745fe16b3d5b63f3e))
* **parser:** concatenate string attribute arguments ([#85](https://github.com/gengjiawen/c-parser/issues/85)) ([b0148b1](https://github.com/gengjiawen/c-parser/commit/b0148b155fa47e63848d75bb11e3b57f8e84be7c))
* **parser:** consume attributes on enumerators ([#50](https://github.com/gengjiawen/c-parser/issues/50)) ([5e67454](https://github.com/gengjiawen/c-parser/commit/5e67454b69b5750172330035b94dcec574922ef6))
* **parser:** consume interleaved pragma control tokens ([#49](https://github.com/gengjiawen/c-parser/issues/49)) ([5306d3f](https://github.com/gengjiawen/c-parser/commit/5306d3fc8b05a5213c95e7512e834799c7184fb8))
* **parser:** consume trailing parameter attributes ([#61](https://github.com/gengjiawen/c-parser/issues/61)) ([66df89e](https://github.com/gengjiawen/c-parser/commit/66df89eeacbba8653b850345818ae87bde4f1468))
* **parser:** diagnose and recover malformed aggregate members ([#67](https://github.com/gengjiawen/c-parser/issues/67)) ([00484f2](https://github.com/gengjiawen/c-parser/commit/00484f2f76bdb400f4f5a5113130fd80922df7ff))
* **parser:** diagnose invalid expression placeholders and generic associations ([#83](https://github.com/gengjiawen/c-parser/issues/83)) ([025c242](https://github.com/gengjiawen/c-parser/commit/025c242a8bbbd7eb6da01e45941a3ff70a5a0441))
* **parser:** diagnose missing members and preserve closing braces ([#63](https://github.com/gengjiawen/c-parser/issues/63)) ([de00a14](https://github.com/gengjiawen/c-parser/commit/de00a143ba8bd7f28edafd75e19189312f3c3888))
* **parser:** evaluate complete integer attribute arguments ([#75](https://github.com/gengjiawen/c-parser/issues/75)) ([f7ebd77](https://github.com/gengjiawen/c-parser/commit/f7ebd77eab90a65f49fb977887ce394c29ce21a3))
* **parser:** evaluate integer constants with typed exact arithmetic ([#69](https://github.com/gengjiawen/c-parser/issues/69)) ([1df3f67](https://github.com/gengjiawen/c-parser/commit/1df3f673dbd0424d42ca75232b4e701769b9bc1d))
* **parser:** guard nesting through abstract array bounds ([#44](https://github.com/gengjiawen/c-parser/issues/44)) ([58f5eb5](https://github.com/gengjiawen/c-parser/commit/58f5eb5d2396a9284265babec4f13a6008c02f06))
* **parser:** isolate complete declaration attribute state ([#71](https://github.com/gengjiawen/c-parser/issues/71)) ([ea99ae1](https://github.com/gengjiawen/c-parser/commit/ea99ae1373bc5a080f508510c8f0d612e189c06f))
* **parser:** preserve field type attributes and isolate their state ([#82](https://github.com/gengjiawen/c-parser/issues/82)) ([699267d](https://github.com/gengjiawen/c-parser/commit/699267d41d9f40f503e15c79c352155e21d3d6a9))
* **parser:** preserve type constructor order across declarator contexts ([#78](https://github.com/gengjiawen/c-parser/issues/78)) ([75a9706](https://github.com/gengjiawen/c-parser/commit/75a9706014743ef1672030d7509fd44b1dd1caf5))
* **parser:** preserve unknown alignment instead of guessing ([#80](https://github.com/gengjiawen/c-parser/issues/80)) ([1e7f13a](https://github.com/gengjiawen/c-parser/commit/1e7f13a649f1f2146a5cd85d20cb6fd60cadd6e5))
* **parser:** restore enum and tag state at scope boundaries ([#62](https://github.com/gengjiawen/c-parser/issues/62)) ([5fae32e](https://github.com/gengjiawen/c-parser/commit/5fae32edd0f23c0319ba9343210a4efea72c67d7))
* **parser:** restore typedef names when leaving lexical scopes ([#52](https://github.com/gengjiawen/c-parser/issues/52)) ([e5f136e](https://github.com/gengjiawen/c-parser/commit/e5f136e8847e4bf0681bb2b222792c885da1b904))
* **parser:** retain trailing const and volatile qualifiers ([#54](https://github.com/gengjiawen/c-parser/issues/54)) ([e58c6a8](https://github.com/gengjiawen/c-parser/commit/e58c6a89b7841d0c96d412d5a59bc8a7785b4c57))
* **parser:** retain transparent union flags on bare definitions ([#87](https://github.com/gengjiawen/c-parser/issues/87)) ([e7c52f6](https://github.com/gengjiawen/c-parser/commit/e7c52f655ce12be601afd78b9e8292398f94cf0f))
* **parser:** shadow builtin typedef names at file scope ([#53](https://github.com/gengjiawen/c-parser/issues/53)) ([3dbfee3](https://github.com/gengjiawen/c-parser/commit/3dbfee33400ad288172aa5c1330f5a0a39d41786))
* **parser:** traverse flat type chains without recursion ([#70](https://github.com/gengjiawen/c-parser/issues/70)) ([6fc9a2f](https://github.com/gengjiawen/c-parser/commit/6fc9a2fdacba5a4f60edf20aa7cfe5d20647157b))
* **preprocessor:** accept zero in GCC line markers ([#48](https://github.com/gengjiawen/c-parser/issues/48)) ([7459c45](https://github.com/gengjiawen/c-parser/commit/7459c450c0fc82ead895e6c78bf405c757c20478))
* **preprocessor:** avoid call stack overflow for large macro arguments ([#41](https://github.com/gengjiawen/c-parser/issues/41)) ([039e70d](https://github.com/gengjiawen/c-parser/commit/039e70d516b59681f012c99dcb2f7fc5f9e62a2d))
* **preprocessor:** classify integer constants using intmax precision ([#59](https://github.com/gengjiawen/c-parser/issues/59)) ([3d4e73c](https://github.com/gengjiawen/c-parser/commit/3d4e73c51a2392e50e67be8d519ce1d6c54c3864))
* **preprocessor:** count live macro expansions for nesting limits ([#42](https://github.com/gengjiawen/c-parser/issues/42)) ([75063fd](https://github.com/gengjiawen/c-parser/commit/75063fd25ea2468d3fcd52085d680be918724e3d))
* **preprocessor:** guard recursive conditional evaluation ([#43](https://github.com/gengjiawen/c-parser/issues/43)) ([539ac44](https://github.com/gengjiawen/c-parser/commit/539ac44b03de34449997b15a471bf96efe31e42c))
* **preprocessor:** interpret pack pragma operands as tokens ([#73](https://github.com/gengjiawen/c-parser/issues/73)) ([64165f3](https://github.com/gengjiawen/c-parser/commit/64165f3fb6c64c584c97a024e471e8737035505a))
* **preprocessor:** preserve keyword alias spellings ([#46](https://github.com/gengjiawen/c-parser/issues/46)) ([be717bf](https://github.com/gengjiawen/c-parser/commit/be717bf3f7d9fda44df8e748050b355291bc263b))
* **preprocessor:** provide LP64 underlying type macros ([#65](https://github.com/gengjiawen/c-parser/issues/65)) ([4f2a8b7](https://github.com/gengjiawen/c-parser/commit/4f2a8b723eda34d9b639c1cd2002411c6e313049))
* **repo:** drop stray node_modules symlink from the tree ([#90](https://github.com/gengjiawen/c-parser/issues/90)) ([76f7f30](https://github.com/gengjiawen/c-parser/commit/76f7f3028a3045866bfb5289564df5eac1b572f4))

## [2.0.1](https://github.com/gengjiawen/c-parser/compare/v2.0.0...v2.0.1) (2026-09-09)


### Bug Fixes

* **ci:** unblock npm publish and modernise workflow actions ([#58](https://github.com/gengjiawen/c-parser/issues/58)) ([e967a44](https://github.com/gengjiawen/c-parser/commit/e967a441ed5e87e351a61e8d006948b8e7e5976a))

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
