import { randomInt } from "node:crypto";

// Temporary passwords get read out loud or pasted into a Discord message and then
// changed on first login, so being sayable matters more than being short. Four
// words from 512 is ~36 bits, which against bcrypt at cost 12 is not the weak link
// — the message it was sent in is. Widen the list or add a word (+9 bits each) if
// that ever stops being true.
// ponytail: one flat array, no diceware file and no dependency. randomInt is the
// CSPRNG and rejects modulo bias, unlike the Math.random() this replaced.

export const PASSPHRASE_WORDS = 4;

// Short, common, unambiguous when spoken. scripts/check-passphrase.ts asserts the
// list stays unique, lowercase and large enough for the entropy claimed above.
export const WORDS = [
  "otter", "badger", "falcon", "walrus", "gecko", "lemur", "marten", "weasel",
  "beaver", "bison", "camel", "cobra", "coyote", "dingo", "donkey", "eagle",
  "egret", "finch", "gopher", "heron", "impala", "jackal", "kitten", "lizard",
  "llama", "magpie", "mantis", "narwhal", "ocelot", "osprey", "panda", "parrot",
  "pelican", "pigeon", "possum", "puffin", "quail", "rabbit", "raven", "robin",
  "salmon", "seal", "shark", "shrimp", "sparrow", "spider", "stork", "swan",
  "tapir", "terrier", "tiger", "toad", "turtle", "vulture", "wombat", "zebra",
  "alpaca", "antler", "beetle", "bobcat", "bumble", "cattle", "cricket", "cuckoo",

  "almond", "apple", "apricot", "banana", "basil", "beetroot", "berry", "biscuit",
  "bread", "butter", "cabbage", "carrot", "cashew", "celery", "cheddar", "cherry",
  "chestnut", "chives", "cinnamon", "citrus", "cocoa", "coconut", "coffee", "cookie",
  "cumin", "currant", "custard", "damson", "fennel", "garlic", "ginger", "grape",
  "hazel", "honey", "lemon", "lentil", "lettuce", "mango", "maple", "melon",
  "muffin", "mustard", "noodle", "nutmeg", "oatcake", "olive", "onion", "orange",
  "papaya", "parsley", "parsnip", "peach", "peanut", "pear", "pepper", "pickle",
  "plum", "pretzel", "pudding", "pumpkin", "radish", "raisin", "rhubarb", "rocket",
  "saffron", "sage", "salad", "scone", "sesame", "sorbet", "soup", "spinach",
  "sprout", "squash", "sultana", "syrup", "thyme", "toast", "tomato", "treacle",
  "truffle", "turnip", "vanilla", "walnut", "waffle", "wheat", "yoghurt", "yeast",

  "acorn", "amber", "autumn", "beach", "blossom", "boulder", "branch", "breeze",
  "brook", "canyon", "cavern", "cliff", "cloud", "clover", "comet", "coral",
  "crater", "creek", "crystal", "dawn", "desert", "dewdrop", "drizzle", "dune",
  "dusk", "ember", "fern", "fjord", "flint", "fog", "forest", "fossil",
  "frost", "galaxy", "garden", "geyser", "glacier", "granite", "grotto", "grove",
  "harbour", "heather", "hillside", "horizon", "iceberg", "island", "ivy", "jungle",
  "lagoon", "lake", "lava", "leaf", "lichen", "lightning", "marsh", "meadow",
  "mist", "moss", "mountain", "nebula", "oasis", "ocean", "orchard", "pebble",
  "pine", "planet", "pollen", "pond", "prairie", "quartz", "rainbow", "ravine",
  "reef", "ridge", "river", "sandbar", "sapling", "savanna", "shoreline", "sky",
  "sleet", "snowfall", "spring", "stream", "summit", "sunrise", "sunset", "thunder",
  "tide", "tundra", "valley", "volcano", "waterfall", "wave", "willow", "woodland",

  "anchor", "anvil", "apron", "arrow", "axle", "balloon", "barrel", "basket",
  "beacon", "bellow", "blanket", "bobbin", "bolt", "bottle", "bracket", "bridge",
  "bucket", "buckle", "button", "cable", "caliper", "candle", "canvas", "cauldron",
  "chisel", "clamp", "compass", "cordage", "crayon", "crowbar", "cushion", "drill",
  "easel", "engine", "envelope", "fabric", "fender", "filament", "flask", "funnel",
  "gasket", "gauge", "girder", "goggle", "grommet", "hammer", "handle", "harness",
  "hinge", "hopper", "jigsaw", "kettle", "keyring", "ladder", "lantern", "lathe",
  "lever", "magnet", "mallet", "marble", "mitten", "mortar", "nozzle", "paddle",
  "pallet", "parcel", "pendant", "piston", "plaster", "pliers", "pocket", "pulley",
  "quiver", "ratchet", "rivet", "rudder", "ruler", "saddle", "satchel", "scaffold",
  "shovel", "shutter", "sickle", "sieve", "socket", "spanner", "spindle", "spool",
  "sprocket", "stapler", "stencil", "stirrup", "stitch", "strap", "tackle", "tassel",
  "teapot", "thimble", "tinder", "tongs", "toolbox", "trellis", "trowel", "tunnel",
  "turbine", "valve", "vessel", "wagon", "washer", "wedge", "wheel", "winch",

  "abbey", "arcade", "arena", "atrium", "balcony", "bakery", "barn", "bazaar",
  "belfry", "cabin", "castle", "cathedral", "cellar", "chapel", "chimney", "cloister",
  "college", "corridor", "cottage", "courtyard", "dockyard", "dormer", "foundry", "gallery",
  "gateway", "granary", "hangar", "hearth", "kiosk", "library", "lighthouse", "lodge",
  "market", "mezzanine", "mill", "museum", "observatory", "parapet", "pavilion", "pergola",
  "pier", "plaza", "pottery", "quarry", "rotunda", "sawmill", "shipyard", "stable",
  "station", "studio", "terrace", "theatre", "tollgate", "turret", "veranda", "workshop",

  "ballad", "banjo", "bassoon", "cello", "chorus", "clarinet", "cymbal", "drumbeat",
  "fiddle", "flute", "guitar", "harmony", "harp", "lyric", "mandolin", "melody",
  "oboe", "octave", "opera", "organ", "piano", "rhythm", "sonata", "tempo",

  "azure", "bronze", "cobalt", "crimson", "emerald", "indigo", "ivory", "jade",
  "lavender", "lilac", "magenta", "maroon", "ochre", "scarlet", "sienna", "teal",
  "turquoise", "violet", "amethyst", "copper", "garnet", "obsidian", "onyx", "opal",
  "pearl", "platinum", "ruby", "sapphire", "silver", "topaz", "zircon", "pewter",

  "brave", "bright", "calm", "clever", "eager", "gentle", "honest", "joyful",
  "kindly", "lively", "mellow", "nimble", "patient", "quiet", "steady", "swift",
  "brisk", "cheerful", "curious", "daring", "earnest", "fearless", "graceful", "humble",
  "jolly", "keen", "loyal", "merry", "noble", "polite", "rugged", "sincere",
  "sturdy", "tender", "upbeat", "valiant", "witty", "zealous", "cosy", "modest",
];

/** A hyphenated passphrase, e.g. "otter-cobalt-thimble-meadow". */
export function generatePassphrase(words = PASSPHRASE_WORDS): string {
  return Array.from({ length: words }, () => WORDS[randomInt(WORDS.length)]).join("-");
}
