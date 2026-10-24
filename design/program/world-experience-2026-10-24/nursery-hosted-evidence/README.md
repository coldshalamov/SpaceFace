# Current Nursery and adjacent hosted evidence

As of 24 October 2026 19:56 UTC. All larger goals remain open.

## Nursery formation
PR594 eee0a811f56b9ea9d9de3b1b914fe3115e2f18e3 passes32/32 in run40125405965. Actual synthetic ec0ecf25088b1e4e29c5a0a2ad79a598d9b0ef4e has parents8647a043 andeee0a811; exact tree305e67c638d907c9d936365534bc6a170efbf867. Broader run remains active/red.
[formation.log](formation.log):9465B SHA256de82124abc48addbc4697385100053c2f55f9cc332cf723e50962bc6091c2238, blob8243ab1aaa3adce05daf784f641408a42dbab391.
Artifact12573101072 ZIP SHA2568a9d8484f6f0dd77fce76bfa2a972c27ed83514bc1948a3a534179b66d050c85.
Earlier19-case feedback head29d5c57b is historical, not the formation gate.

## Caption coverage
PR59693e5c0417246e888f31ec452356d18a6c7d5e997 passes8/8, while run40124490084 terminated failure19:46:13UTC.
[captions.log](captions.log):2665B SHA256197f882e6f9af56077f2a0196b97ec3db62a64d96f206210da44718eb419037a, blobe6795bca1dba0e806db454d05da07ff3262b7020.
Artifact12571994344 ZIP SHA25609b57573ea3895129f46bf887ca22f51ed6d5711f308e8a310130ed8564e800c.

## Bar lifecycle observation
PR592b0f8ada4e65f0cbe239e7a0fcae731b06023d37f passes9 named tests, while run40124333188 terminated failure19:44:14UTC.
[bar-timing.log](bar-timing.log):1762B SHA256f5d5e2e7cc1bb16afcc4ccacef5f4aec62042c85b31de088ab000baa07f57907, blobd0adedcb562ae53166221c9c56b5573d1b31493f.
Artifact12572504845 ZIP SHA256fbfed1334cb89cd49a5b766b9a8406d5685847ed7e7ef7546f3cff5c4bee76cb.
This trace establishes late assertions-complete at181263.9ms beyond180-second cap, completed browser close in156ms, server exit about5ms later and commandSIGKILL181606ms. It is not a cleanup hang. Earlier untimestamped failures remain unresolved; no retroactive causal claim.

These are exact existing public diagnostics, not live-camera or ordinary-play acceptance. Last browser comparisons are incomplete where base runs cancelled. Do not call the whole CI green or all failures baseline-equivalent.
