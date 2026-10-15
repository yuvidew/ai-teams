import { defineConfig } from "drizzle-kit"

process.loadEnvFile(".env.local")

export default defineConfig({
  dialect: "postgresql",
  schema: "./db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: process.env.DATABASE_URL! },
})
