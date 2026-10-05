# Fibber

A type-safe translation system with runtime language delivery, built on
[FormatJS](https://formatjs.github.io/) and ICU MessageFormat.

Fibber separates the **contract** — which messages exist and the arguments
each one takes — from the **translations that fill it**. A build kit turns
enumerated content into per-locale JSON and typed modules; the runtime service
delivers and formats them.

## Workspace

| Directory                        | Contents                                           |
| -------------------------------- | -------------------------------------------------- |
| [`packages`](./packages)         | The library: the runtime service and the build kit |
| [`integrations`](./integrations) | Framework bridges                                  |
| [`examples`](./examples)         | Example apps                                       |

## Development

```sh
pnpm install
pnpm build
pnpm test
pnpm typecheck
pnpm lint
```

## License

MIT
