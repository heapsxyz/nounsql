import { PostgresStore } from "@heaps/engine";
import {EntityNames, ModelLookupType, models} from "@/lib/types/models";

export const store: PostgresStore<EntityNames, ModelLookupType> =
  new PostgresStore<EntityNames, ModelLookupType>(models);
