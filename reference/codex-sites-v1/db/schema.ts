import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const rooms = sqliteTable("rooms", {
  code: text("code").primaryKey(),
  revision: integer("revision").notNull().default(0),
  data: text("data").notNull(),
});

export const siteControl = sqliteTable("site_control", {
  id: text("id").primaryKey(),
  activeRoom: text("active_room"),
});
