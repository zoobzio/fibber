# Packages

| Package                            | Directory            | Description                                                 |
| ---------------------------------- | -------------------- | ----------------------------------------------------------- |
| [`fibber`](./fibber)               | `packages/fibber`    | Umbrella package for the runtime                            |
| [`@fibber/catalog`](./catalog)     | `packages/catalog`   | Locale catalogs: providers and wire-protocol clients        |
| [`@fibber/core`](./core)           | `packages/core`      | The runtime service: deliver, resolve and format messages   |
| [`@fibber/kit`](./kit)             | `packages/kit`       | Build kit: enumerated content → per-locale JSON and modules |
| [`@fibber/schema`](./schema)       | `packages/schema`    | Message contract types and runtime validation               |
| [`@fibber/translate`](./translate) | `packages/translate` | LLM translation behind `fibber translate`                   |

The kit is a build-time tool and is not re-exported by `fibber`. Framework
integrations live in [`../integrations`](../integrations).
