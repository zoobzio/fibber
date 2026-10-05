#!/usr/bin/env node
// The `fibber` command. A committed launcher rather than the built file
// itself, so package managers can link the bin before the kit is built.
import "../.dist/cli.mjs";
