import "dotenv/config";
import { seedDatabase } from "./db.js";

await seedDatabase();
console.log("Database has been seeded.");
