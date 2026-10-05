# @fibber/schema

## 0.0.1

### Patch Changes

- [`8994d0f`](https://github.com/zoobzio/fibber/commit/8994d0fd980229bd32c14071aa5a5534707f221a) Thanks [@zoobzio](https://github.com/zoobzio)! - Resolve a message by its key: the resolver is now callable, so `$t("checkout.cart.title", values)` formats the same message as `$t.checkout.cart.title(values)`, typed off the contract the same way. The nested form is unchanged.

  A message can travel as data: the new `Message` type is a key alone for a message that takes no values (`"title"`), and a tuple pairing the key with its own values for one that does (`["greeting", { name }]`). The resolver and `format` take it whole — `$t(message)`. `@fibber/nuxt` exposes it as `AppFibberMessage`, next to the new `AppFibberKey`.

  **Renamed:** what was the `Message` type — the union of a contract's keys — is now `Key`, making room for the above. With it, the schema's `check.message` / `assert.message` are `check.key` / `assert.key`, and the kit's generated `Message` type and `isMessage` guard are `Key` and `isKey`.

  `format`, and the resolver called by key, now refuse a key typed as several messages when any of them takes values — pass a `Message` instead.
