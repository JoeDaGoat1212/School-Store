# Firebirds Nest — visual assets plan (Higgsfield)

Status: **done.** Made with GPT Image 2.5 (won the test round; the fridge back wall is the Nano Banana test image).
Used about 65 credits (test round 21 + full batch 44); 98 left for snacks.
The finished files are in `public/showcase/` and are listed in `src/components/public/showcase/scene-assets.ts`.
To add a flavor later: make a backdrop with the style recipe below, save it as `public/showcase/bg/<name>.webp`,
and add it to `Scene` in `src/lib/product-look.ts` and to `SCENES` in `scene-assets.ts`.

Credits available at the start: 163 (Plus plan).

## Rules for every image

- **AI makes the world, not the products.** Backdrops, fruit, ice, splashes, materials.
  The drinks stay our own 3D models, and later wear photos of the real labels.
- **No brand names, logos, labels, text, cans, bottles, glasses, hands or people** in any prompt or result.
- **One style recipe for everything** (below), so the set looks like one photo shoot.
- **Wide shots keep the middle empty.** The 3D drink is placed there by the website.
- Finished files are shrunk to WebP (about 150–300 KB each) and only load when their flavor is shown.

## Style recipe (pasted into every backdrop prompt)

> Commercial beverage advertising photograph, bright and bold. Seamless studio backdrop in {COLOR} ({HEX}),
> slightly lighter toward the center. High-key soft key light from the upper left, crisp rim light,
> glossy highlights, true-to-life color. 85mm lens, f/8, foreground pieces sharp, background pieces gently
> out of focus. Real liquid splashes frozen mid-air with fine droplets. Real fruit with natural imperfections
> (seeds, pulp, tiny blemishes). Leave the center third of the frame completely empty for a product added later.
> Arrange elements along the left and right edges and the bottom corners. No product, no can, no bottle,
> no glass, no text, no logo, no label, no hands, no people. Photograph, not illustration, not a 3D render.

## 1. Flavor backdrops (16:9, 2K) — 12 images

| # | Flavor family | Color (hex) | What's in the scene |
|---|---|---|---|
| 1 | Strawberry | crimson red `#D81F3C` | whole and halved strawberries, pink-red juice splash |
| 2 | Cherry / fruit punch | cherry red `#C4122F` | cherries with stems, dark red splash |
| 3 | Grape | royal purple `#5A2A91` | purple grape clusters, purple splash |
| 4 | Orange | vivid orange `#F27A00` | orange wheels and segments, orange juice splash |
| 5 | Lemon | sunny yellow `#E3C21B` | lemon wheels and wedges, lemonade splash |
| 6 | Lime / lemon-lime | fresh green `#3F9E3A` | lime wheels and wedges, clear fizzy splash with bubbles |
| 7 | Blue / sports drinks | electric blue `#1C5FD6` | ice cubes, frost crystals, bright blue splash |
| 8 | Iced tea | leaf green `#4F9A5F` | tea leaves, mint sprigs, amber tea splash, ice |
| 9 | Cola | deep cola red-brown `#4B1610` (warm light) | ice cubes, dark cola splash full of fizz |
| 10 | Water | sky blue `#2F8FD1` | crystal-clear water splash, droplets, ice |
| 11 | Chocolate milk | cocoa brown `#6B3A22` | milk and chocolate-milk swirl splash, chocolate pieces |
| 12 | Tropical (mango, pineapple) | golden orange `#F2A11F` | pineapple chunks, mango cubes, passion fruit halves |

## 2. Falling pieces — sprite sheets (4K) — 4 images

Each sheet is one image with 6 objects, cut apart by us afterwards (free, no background-removal credits).

Shared text:
> Photographic cut-out reference sheet: six separate objects arranged in a neat 3 × 2 grid with generous
> space between them, each fully visible and not touching. Flat, even, shadowless background in {BACKGROUND}.
> Soft even studio light from the front, sharp focus, true-to-life color and texture, no color spill from the
> background onto the objects. No text, no labels.

| Sheet | Background | Objects |
|---|---|---|
| A — red & purple fruit | pure chroma green `#00FF00` | whole strawberry with leaves, halved strawberry, pair of cherries with stems, single cherry, small purple grape cluster, single grape |
| B — citrus | pure chroma green `#00FF00` | orange wheel, orange wedge, lemon wheel, lemon wedge, lime wheel, lime wedge |
| C — other | pure chroma green `#00FF00` | fresh mint sprig, square of milk chocolate, pineapple chunk, mango cube, passion fruit half, red chili pepper (for snacks later) |
| D — clear things | pure black `#000000` (clear objects can't go on green) | ice cube, crushed ice chunk, cluster of water droplets, rising soda bubbles, frost crystal, splash droplet |

## 3. Fridge materials — 4 images (custom Firebirds fridge: black body, orange + teal LED trim, frosty glass)

| # | Image | Shape | Prompt |
|---|---|---|---|
| F1 | Back wall | 1:1 | Front-on, perfectly flat photo texture of the inside back wall of a commercial drinks refrigerator: evenly backlit cool-white LED panel behind frosted acrylic, gentle falloff toward the edges, fine condensation droplets. No shelves, no products, no text. Orthographic, seamless. |
| F2 | Frost on the glass | 3:4 | Frost and condensation on clear glass, photographed against pure black. Frost thick along the bottom edge and corners, fading to clear in the middle; fine water droplets. Front view, no objects. *(Laid over the doors so only the frost shows.)* |
| F3 | Black metal | 1:1 | Seamless texture of matte black powder-coated sheet metal with a very fine brushed grain, evenly lit, front-on, no seams, no text. |
| F4 | Room behind the fridge | 16:9 | Dim, completely out-of-focus interior of a modern school snack shop in the evening: deep black and charcoal, soft orange and teal bokeh lights. No people, no readable signs, nothing in focus. |

## Credits

| Step | Images | Model and price each | Credits |
|---|---|---|---|
| **Test round** (pick the model): strawberry backdrop, orange backdrop, sheet A, back wall F1 | 4 × 2 models | Nano Banana Pro 2K = 2 (4K sheet = 4) · GPT Image 2.5 high 2K = 2.75 | **~21** |
| 12 flavor backdrops (2 already made in the test) + redos | ~10 + 5 | winning model, ~2–2.75 | **~35** |
| 4 sprite sheets (1 already made) + redos | ~3 + 2 | 4K, ~4 | **~20** |
| 4 fridge materials (1 already made) + redos | ~3 + 2 | ~2 | **~10** |
| **Drinks total** | | | **~86** |
| Saved for snacks later | | | ~40 |
| Left over | | | ~37 |

Skipped on purpose: video (35 credits per 5 seconds, heavy on school Wi-Fi) and image-to-3D models (9 each; our own 3D shapes are lighter and can change with the menu).

## Steps

1. ✅ You approve this file (prompts, colors, objects).
2. ✅ Test round (~21 credits). Picked GPT Image 2.5.
3. ✅ Full batch (44 credits, no redos needed).
4. ✅ Sprites cut out, everything compressed (2.5 MB total, each file loads only when needed), wired into the site.
   The hand-drawn pieces stay as a backup for flavors without photos.
5. ✅ Screenshots reviewed, pushed.
