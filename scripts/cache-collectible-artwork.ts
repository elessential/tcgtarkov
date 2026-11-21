import { COLLECTIBLE_CARDS } from "../src/shared/collectibles.js";
import { resolveCollectibleArtwork } from "../src/server/collectibleArtwork.js";

const result = await resolveCollectibleArtwork();
const cached = [...result.byCardId.values()].filter((artwork) => artwork.imageLocal).length;
console.log(`Prepared local artwork for ${cached} of ${COLLECTIBLE_CARDS.length} collectible cards.`);
if (result.warning) console.warn(result.warning);
