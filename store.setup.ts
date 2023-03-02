import {store} from "@/lib/store";
import * as fs from "fs";

export default async function () {
  const migrations = fs.readFileSync('./lib/types/migrations.txt', "utf-8")
  console.log(migrations);
  console.log("Running migration script...");
  await store.sql.unsafe(migrations).execute()
  await store.sql.end();
  console.log("Finished running migration script.");
}
