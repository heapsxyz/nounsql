This supergraph is a [Next.js](https://nextjs.org/) project bootstrapped
with [`create-next-app`](https://github.com/vercel/next.js/tree/canary/packages/create-next-app).

## NounsDAO Supergraph

This is a WIP implementation of the nouns-dao supergraph.

It currently uses local yalc'd versions of @heaps packages (cli, engine, generators). If you are interested in pre-alpha
access reach out to waitlist@heaps.xyz.

This example uses the async postgres store vs. the sqlite3 store. So contains a simple docker-compose file to start a
postgres instance.

## Current Status
This current version has the following caveats:
- The type system is pre alpha and will change.
- BigInt's are natively supported through the postgres store. However, the most stable entity layer has a change to the
  BigInt type to a string pre insert / store to avoid issues with validation and serialization. This will be fixed in the next release.
- Re ^ this means a lot of the BigInt math has been stubbed to a string to avoid issues with the current stable release.
- Stubs for @graphprotocols BigInt, Bytes, and Address will be replaced by native JS types in an upcoming release.
- The next release natively supports relation joins. However, the current release does not support
  relations. This will be fixed in an upcoming release.

### Commands

To start the postgres instance

```bash
yarn infra:up
```

Once your db is up generate your schemas, entities, migrations & types

```bash
yarn codegen
```

To backfill the supergraph locally run the following command. This will fetch snaphots of data to use when watch is enabled to avoid refetching data from a remote source.

```bash
yarn backfill
```

To turn on watch mode

```bash
yarn backfill --watch
```
