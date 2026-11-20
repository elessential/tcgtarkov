import { prisma } from "./db.js";
import { seedGameMode } from "./seedData.js";

const gameMode = process.env.TARKOV_GAME_MODE === "pve" ? "pve" : "regular";

try {
  const report = await seedGameMode(gameMode);
  console.log(`Seeded ${report.uniqueItems} unique items across ${report.pools.length} ${gameMode} pools. Cached ${report.cachedImages} images; ${report.missingCachedImages} unavailable.`);
} catch (error) {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
