# One More Run — Visual Bible

Source of truth for the future visual overhaul.

This document does **not** change gameplay. Speed curve, physics, collision, reachability, SAFE / RISK / DUAL_RISK rewards, streak / multiplier, Coin value, VariationDirector, track patterns, and Yandex integration stay as they are. Visual work may only re-skin presentation.

Status: approved art direction. Garden environment pass is in the renderer; gameplay is unchanged.

---

## 1. Art direction

One More Run is a **light, warm, handmade corridor** with one specific cat.

The player fantasy is not “a cute animal in a pretty world.” It is:

> I am this cat. The wide path is safe. The tight path looks tastier. One more run.

Emotional centre: the cat.  
Mechanical centre: greed vs survival.  
Visual job: make that choice readable, tempting, and worth restarting.

### Locked direction

- Light, sunlit, friendly.
- Cute, but not kawaii-generic.
- Handmade / felt / wood / paper. Things look cut from a few materials, not painted from a photograph.
- Flat 2D with one cel-style shadow. No realistic lighting.
- Simple shapes. Few details. High consistency.
- Feels like one artist drew every screen on the same morning.

### World metaphor

The playfield is already a vertical corridor with rectangular gates. The new world must **love those rectangles**.

The track is a sandy garden path between felt hedges. Obstacles are planters, crates, and clipped hedge blocks. Forks are two gaps in the same hedge wall. OFFSET, FUNNEL, OFFSET_GATE, and DOUBLE_GATE are still those gates — they just look like authored garden architecture, not debug hitboxes.

This is **not**:

- a fantasy forest;
- a magic meadow with butterflies and sparkles;
- a neon runner;
- a photoreal pet simulator;
- a 3D diorama with perspective ground planes.

If a prop does not help a corridor, a choice, or the cat, it does not belong.

### Tone

Warm morning. Calm until RISK appears. RISK is appetizing, not gory. Game Over is a sit-down, not a death screen.

---

## 2. Master Cat

Codename: **Loaf**.

Loaf is the only hero. Every in-game sprite, skin, icon, cover, screenshot, and future promo must come from this construction. There is no separate “marketing cat.”

### Final selection: Compact Crown Loaf

Four close construction studies were considered. They are variants of one archetype, not four characters.

| Study | Small difference | Decision |
| --- | --- | --- |
| A — Compact Crown | Broad round head, short body, soft right-ear fold, central fluffy plume | **Selected master** |
| B — Wide Cheeks | Head 8% wider and muzzle lower | Rejected: strong icon, but head consumes the rear-view body at gameplay size |
| C — Tall Ears | Both ear roots 0.5 units taller | Rejected: becomes a generic kitten silhouette; the fold reads less clearly |
| D — Shorter Body | Body 0.7 units shorter, paws closer | Rejected: cute at rest, but too little coat area for readable skins from behind |

**Compact Crown Loaf** wins because the rear silhouette remains readable at 40–48 px, the body still carries skin patterns, and the asymmetrical ears survive both lean and icon crop.

The approved Master Cat sheet (2026-09-14) is the locked visual refinement of Compact Crown / Stubborn Spark. It does not replace Loaf with a new cat. It locks:

- a **central fluffy plume tail**, clearly separated from the paws;
- a **soft, almost upright right ear** (careful fold, never a broken zigzag);
- a slightly rounder head/body read with short, distinct paw stubs.

This selection is final. Future exploration adjusts line quality, not anatomy.

### Personality (visual, not lore)

Determined, slightly worried, and a little greedy. Loaf is not smiling or posing for cuteness. The affection comes from the compressed loaf proportions and earnest face.

- Neutral brows angle inward by about 8°.
- Mouth is absent at gameplay size and a tiny InkBrown `X` only in icon / sit / front art.
- No blush, lashes, glossy pupils, tongue, or permanent grin.
- Neutral pose reads “focused”; reward squash reads “pleased”; sit pose reads “ready to try again.”

### Orientation and left/right canon

“Left” and “right” always mean **Loaf’s anatomical side**, never the viewer’s.

- The **right ear** is softly folded: almost upright, slightly shorter than the left, no zigzag.
- The **left head patch** wraps from crown to left eye.
- Rear gameplay view: left patch appears screen-left; softer right ear appears screen-right; the plume tail sits on the centre line.
- Front/icon view: left patch appears viewer-right; softer right ear appears viewer-left.

Never mirror the finished sprite to produce another view. Mirroring swaps the canon.

### Silhouette rules

A loaf of bread with ears. No neck. The head is the largest mass. The body is a short rounded brick tucked under the head. Legs are stubs. The tail is a compact central plume, not a whip and not a third paw.

In a one-colour silhouette, Loaf must retain:

1. oversized crown/head;
2. taller full left ear;
3. slightly lower, softly folded right ear;
4. body no wider than the head;
5. two short paw breaks at the bottom;
6. short fluffy plume on the centre line, sitting in the paw gap.

The head and body overlap by at least 1 unit. No background gap, neck line, or thin waist may appear between them.

### Master construction grid: 10 × 12

All canonical full-body views use a **10 × 12 logical-unit artboard**. Coordinates below are measured from `(0,0)` at top-left. Curves pass through these bounds; they are not independent stickers.

#### Rear gameplay view — canonical

This is the primary production view. Loaf faces up the corridor. The view is a straight rear: the central plume reads without a three-quarter cheat.

```text
ARTBOARD       x 0.0–10.0   y 0.0–12.0
VISIBLE BODY   x 0.8–9.2    y 0.4–11.3

HEAD           x 1.35–8.65  y 1.15–7.20
                rounded crown; widest at y 4.4; flatter lower edge
BODY           x 1.25–8.45  y 6.05–10.55
                overlaps head by 1.15; bottom corners radius 1.35
LEFT EAR       base x 1.85–3.75 at y 2.0; peak (2.45, 0.45)
RIGHT EAR      base x 6.55–8.35 at y 2.05
                rounded peak near (7.85, 0.85); soft inward tip, no zigzag
LEFT PAW       x 1.65–3.45   y 9.85–11.15
RIGHT PAW      x 5.95–7.75   y 9.85–11.15
TAIL           central plume; base (5.1, 8.35), bulge (5.1, 10.5)
                width 2.6–3.2; 3–4 large scallops; stays inside the paw gap
PATCH          x 1.55–4.55   y 1.10–5.85
                irregular rounded crown patch; 20–25% of head area
ANCHOR         (5.0, 7.9)
```

The body centre at `ANCHOR (5.0, 7.9)` maps to the current player centre. The future **30 × 30 gameplay hitbox** maps approximately to grid bounds `x 1.25–8.75`, `y 4.15–11.65`. Ears and crown may extend visually beyond it; the solid torso and paw span must stay close to the hitbox so collisions remain believable.

Recommended first export: **40 × 48 logical px** (4 px per grid unit). A 2× source may be used for cleaner raster downsampling. Do not change the player hitbox to fit the art.

#### Construction layer order

```text
1. Shadow silhouette (+5,+5 in world space; not baked differently per skin)
2. Body + head + ears + paw mass (one connected cream silhouette)
3. Coat patch / skin pattern
4. InkBrown outer outline
5. Central plume overlay (same viewBox; may rotate around the rump pivot)
```

No neck seam. No individual fur tufts. Paws are silhouette notches, not four detailed legs. The tail may use 3–4 large scallops so it reads as a plume at 40 px; never hair noise.

### Canonical views

#### Rear gameplay view

- Shows back of head, ears, upper back, two hind paw stubs, and a **central fluffy plume**.
- No eyes, nose, mouth, brows, or muzzle are visible.
- Left ginger patch wraps over the crown and ends on upper-left back of head. The left ear blade stays CatCream.
- The plume is CatGinger, compact, and sits in the gap between the paws. It must not read as a third paw.
- Right ear is almost upright with a careful soft fold; a small CatGinger inner is allowed. No zigzag crease.
- Head overlaps body; a short CatCream-to-CatCream value break is forbidden.

#### Front / icon view

Use the same 10 × 12 construction, then crop around the head for the icon.

```text
HEAD           same x 1.35–8.65, y 1.15–7.20
EYES           centres (3.65, 4.25) and (6.35, 4.25), diameter 0.45–0.55
BROWS          1.0-unit strokes centred at x 3.65 / 6.35, y 3.55
NOSE           CatGinger triangle centred (5.0, 5.15), width 0.55
MOUTH          optional InkBrown Y, total height ≤ 0.55; omit below 64 px
PATCH          anatomical left = viewer-right; crosses crown and surrounds
                the eye at (6.35, 4.25), never both eyes
```

The eyes are dots with no white, iris, pupil highlight, or eyelid rendering. The muzzle is implied by spacing, not drawn as a white oval.

For the final store icon:

- crop the head to occupy 82–88% of the square;
- keep both ear silhouettes fully interpretable; the outer right-ear edge may touch the crop;
- retain at least one full outline-width of background around the left patch side;
- use the exact front-view patch and ear construction;
- do not enlarge eyes for marketing;
- background is one flat token, preferably HedgeSage or FloorSand.

#### Side-ish lean

The default implementation should rotate the canonical rear sprite by the existing lean. If a separate lean asset becomes necessary:

- shift crown and body no more than `0.35` grid unit toward movement;
- compress the inside body edge by no more than `0.25` unit;
- tail lags by a small programmatic wag opposite movement;
- ears preserve their relative height and the soft right-ear fold;
- patch stays attached to the anatomical left crown;
- do not expose a profile eye or nose.

Left and right lean cannot be made by naive mirroring. The folded right ear and left patch must remain anatomical; draw both from the master construction or compose markings after transform.

#### Sit / Game Over view

Sit pose is front three-quarter so the player reconnects with Loaf after failure.

```text
HEAD           x 1.35–8.65  y 1.05–7.10 (same crown and ears)
BODY           x 2.05–7.95  y 6.35–10.60 (upright pear/loaf, no neck)
PAWS           two 1.45 × 0.95 rounded stubs at y 9.85–10.80
TAIL           fluffy plume resting on anatomical right, x 7.2–9.3, y 8.7–11.2
ANCHOR         (5.0, 8.0)
```

Face geometry is exactly the front/icon face. Body becomes narrower only because it is sitting; head, ears, patch, eye spacing, line, and colour do not change. Pose may be squashed vertically by 4–6%, never “injured.”

### Shape and proportion lock

| Part | Locked rule |
| --- | --- |
| Head | 7.3 units wide; ~55–60% of visible height including ears |
| Crown | Round sides, slightly flattened lower edge; not a perfect circle |
| Body | 7.2 units wide × 4.5 high in rear view; shorter than head |
| Neck | None |
| Legs | Two visible stubs in rear/front; no articulated knees |
| Tail | Compact central plume; 3–4 large scallops; shorter than body; not a right-side comma |
| Full left ear | Peak at y ≈ 0.45; simple rounded triangle, fully CatCream |
| Folded right ear | Almost upright; peak slightly lower; soft inward tip, never a zigzag |
| Eye spacing | 2.7 units centre-to-centre; eyes ≤ 0.55-unit dots |
| Patch | Anatomical left crown/eye; 20–25% of head |
| Outline | 4 px InkBrown at 40×48 export |
| Shadow | +5,+5 ShadowDust, hard edge, one silhouette |

### Default fur and colour zones

- Main head, body, paws: **CatCream**
- Anatomical-left crown/eye patch: **CatGinger**
- Central plume (and sit-side plume): **CatGinger**
- Eyes, brows, mouth, outline: **InkBrown**
- Shadow: **ShadowDust**
- Inner ear: CatGinger at restrained opacity or a CatCream/InkBrown controlled mix; no pink token
- Nose: **CatGinger**

The patch is one rounded asymmetrical blob. It begins above the left ear root, passes over the left crown, and surrounds—but does not perfectly circle—the left eye in front view. It may not become a heart, star, lightning bolt, letter, or logo.

No fur texture is required at gameplay size. If a felt cue is later approved, it is a single low-contrast grain mask applied uniformly to all coat zones, never painted hairs.

### Recognition kit

These traits **are** Loaf. Every skin and every view keeps them:

1. compact crown/head;
2. no neck and short loaf body;
3. full anatomical-left ear plus softly folded anatomical-right ear;
4. anatomical-left head patch;
5. short **central fluffy plume** (sit view may rest the same plume on the anatomical right);
6. dot eyes and worried brows where the face is visible.

Colour is supportive, not sufficient. In silhouette, traits 1–3 and 5 must identify Loaf. In a head crop, traits 1, 3, 4, and 6 must identify Loaf.

### Skin compatibility lock

The selected rear body supplies enough uninterrupted area for Cream, Ginger Stripe, Tuxedo, Charcoal Dip, Calico, Peach Garden, Honey, Paper Crease, Sage Paws, Festival Thread, Moon Ink, and Snowcap.

- Base coat occupies the same head/body masks for every skin.
- The canonical left patch zone always remains visibly contrasted, though its colour may invert.
- Body patterns clip inside the same silhouette and stop at the outline.
- Stripes use no more than three broad marks on the back and two on the tail.
- Tuxedo bib is visible mainly in front/sit art; rear view uses a dark back plus light paw tips.
- Calico gets only one additional rump spot beyond the canonical patch.
- Paper Crease gets one internal crease; it does not replace the hard shadow.
- Sage Paws changes paw zones only.
- Festival Thread places its one ribbon on the tail without changing tail silhouette.
- Dark skins retain InkBrown outline and must be value-separated from it with an existing lighter token.

If a skin needs a new head, longer body, different ears, or different eye layout to work, it is not a Loaf skin.

### Animation constraints for Loaf

- Idle/run: 4 rear frames derived from the same Master Cat (`assets/characters/run/loaf-run-01.svg` … `04.svg`). Each frame keeps the full baked drawing. Only the paw tips are cut and overlaid with a small opposite offset (plant vs tuck) plus a tiny body lean. Head, ears, patch, colours, and overall silhouette stay the same. Do not clip the tail or rump.
- Timing: 10 fps, looping. Do not add a second independent bob on top of the run cycle.
- Strafe: existing rotation/lean; maximum visual lean remains subtle. Do not mirror (`scaleX(-1)` is forbidden).
- Reward: existing squash/stretch; ears scale with the whole sprite, not independently.
- Tail: stays the central fluffy plume and follows the small body lean. No separate tail physics and no path parsing.
- Game Over: existing overlay timing. Sit/front art is optional and must not require a UI rewrite.
- No blinking requirement. If later added, blink is one closed InkBrown line and never affects gameplay view.
- No mouth animation, cloth, secondary fur, or procedural ear flapping.

### Production gameplay assets

PLAYING uses four run frames built from `assets/characters/loaf-rear.svg` (1024 source, drawn at 127 px, visual silhouette about 38×101, paws aligned to the 30×30 hitbox bottom). Floating reward numbers spawn 118 px above the hitbox centre so they clear the ears. START may show `assets/characters/loaf-front.svg` above the existing title without moving copy. Hitbox stays 30×30. Player x/y are unchanged. Successful RISK / DUAL_RISK crossings play `assets/audio/meow.ogg` through AudioService.

### Production asset rules

Before integration, create one controlled master source with shared guides and layers:

```text
Loaf_Master
├── guides_10x12
├── shadow_mask
├── body_mask
├── tail_mask
├── head_ears_mask
├── patch_mask
├── face_front_only
├── outline
└── fold_crease
```

Required approved art before code work:

1. rear gameplay master;
2. front/icon head master derived from the same grid;
3. sit/Game Over master;
4. one-colour silhouette sheet showing all three;
5. 48 px and phone-scale contact sheet on FloorSand;
6. Cream Loaf palette proof only—no skin pack yet.

Production source may be vector or clean high-resolution raster. Exported PNGs must have transparent backgrounds, nearest canonical bounds, no baked alternative lighting, and no extra empty padding. Shadow should preferably be generated from the shared silhouette so skins cannot alter it.

AI image generation may be used only for early thumbnails. It is not needed for this locked construction and was not used to create a production asset in this stage. Any future AI output must be rebuilt on the grid, flattened to bible tokens, corrected for anatomical left/right, and pass the silhouette/contact-sheet tests before it can become reference art.

### Forbidden changes

- Different anatomy, longer legs, visible neck, slim body, realistic cat
- Anime eyes, highlights in eyes, eyelashes, blush circles
- Extra ears, wings, horns, hats that hide the folded ear
- Turning the patch into a logo or moving it to anatomical right
- Moving the fold to the left ear, folding both ears, or mirroring canon
- Long, thin, spiral, or left-side **run** tail; rear tail must stay a compact central plume
- 3D render, painterly fur, photoreal whiskers
- Front-facing in-game run sprite
- Separate “cuter” icon anatomy or larger marketing eyes
- A second character sold as “the cat”

---

## 3. Skin system — art rules

No shop in this phase. These rules exist so later skins stay Loaf.

### What a skin may change

| Allowed | How far |
| --- | --- |
| Coat colours | Only from the named palette plus **SkinMixes** below |
| Patch colour | Must remain a contrasting blob on the left head |
| Pattern | Stripes, tuxedo bib, socks, spots — mapped to head/body/tail volumes |
| Material cue | Paper crease, felt grain, yarn hatch — one treatment, subtle |
| Accessory | **At most one**, and optional. Never required for the default skin |

### What a skin must not change

- Grid, silhouette, ear fold side, patch side, tail length
- Outline thickness, shadow direction, eye style
- Animation set (bob, lean, squash only)
- Hitbox, pivot, facing

### Colour mixing for skins

Do not invent new hues. Recolours must be mixes of bible tokens:

- Cream, Ginger, InkBrown, HedgeSage, CoinAmber, HighRiskClay, SkyPaper, FloorSand
- Tints: mix with SkyPaper
- Shades: mix with InkBrown
- A “pastel” skin is Cream + SkyPaper, not a new pink

Forbidden skin colours: neon, pure black `#000`, pure white `#FFF`, saturated magenta, electric blue, chroma green.

### Accessories

- Maximum **one** accessory per skin
- Must be smaller than an ear
- Allowed: ribbon on tail, tiny collar band, one flower behind the folded ear, a paper tag
- Forbidden: hats, backpacks, capes, sunglasses, crowns, weapons, shoes
- Accessory uses existing outline and shadow
- Accessory must not cover the folded ear or the left patch

### Light and outline on skins

Every skin uses the same **InkBrown** outline width and the same **ShadowDust** offset. A dark skin does not switch to white outlines. A paper skin does not drop the outline.

### Future skin concepts (not assets)

All of these are Loaf. Same grid. Same ears. Same patch zone.

1. **Cream Loaf** — default. CatCream body, CatGinger left patch, ginger tail tip.
2. **Ginger Stripe** — CatGinger body, InkBrown-mix stripes on body only, cream patch inverted to cream on left crown.
3. **Tuxedo** — SkyPaper/cream belly bib + InkBrown back, ginger patch stays on left head.
4. **Charcoal Dip** — body mix of InkBrown + FloorSand, cream muzzle-back and cream patch inverted (light blob on dark head). Folded ear still reads.
5. **Calico Loaf** — Cream body, ginger patch, one extra InkBrown spot on the rump. No more than three coat colours.
6. **Peach Garden** — Cream tinted with RiskApricot, sage paw tips (HedgeSage mix). Soft, still Loaf.
7. **Honey** — body mix of CoinAmber + Cream, darker ginger patch. Reads as “rich,” good for a later unlock.
8. **Paper Crease** — Cream Loaf plus one diagonal paper fold highlight (SkyPaper line, not a new material). Felt-to-paper cousin.
9. **Sage Paws** — Cream Loaf, HedgeSage socks on stub legs only. Garden cousin of default.
10. **Festival Thread** — Cream Loaf + one CoinAmber ribbon on the plume. The only accessory skin in the first set.
11. **Moon Ink** — dark charcoal body, cream left patch, cream inner folded ear. Night cousin, still morning lighting.
12. **Snowcap** — near-SkyPaper body, ginger patch unchanged, InkBrown eyes. Winter cousin without snow particles.

Do not expand this list with costumes (santa, ninja, robot). New skins must be coat / material / one-tiny-accessory cousins.

---

## 4. Trail system

Trails are future cosmetics. They are **secondary**. The cat, gates, and labels always win.

### Hard rules

- Spawn behind the cat, never on the gate row the player is about to read
- Do not cover obstacle fills or Choice labels
- Alpha ≤ 0.45, lifetime ≤ 0.4 s
- Max particles from trails: **8** on screen (on top of existing GameFeel budget)
- No additive bloom, no neon, no screen-wide glitter
- Same outline language: either unoutlined soft dots, or 1 px InkBrown at most
- Colour from palette only
- Must remain readable on a light floor (no white-on-cream trails)

### Future trail concepts

1. **Dust motes** — default. 3–4 FloorSand/ShadowDust circles.
2. **Paw dabs** — tiny oval stamps, InkBrown at 25% opacity, fade immediately.
3. **Hedge leaves** — 2 HedgeSage teardrops, no veins.
4. **Sand crumbs** — 3 squares of FloorSand, using the existing particle rects.
5. **Paper bits** — 2 SkyPaper rhombuses, very slow spin, rare.
6. **Pollen** — CoinAmber dots, smaller than Coin, never look like collectibles (no outline).
7. **Yarn fluff** — Cream + Ginger ovals, for textile skins.
8. **Button shine** — 1–2 CoinAmber sparkles **only on coin pickup**, not a constant run trail.

A trail skin must not impersonate Coins. If it is round and amber, it has no outline and is smaller than 8 px.

---

## 5. World / track style

Procedural geometry stays procedural. Renderer will later paint **materials** onto existing rects. Do not replace OFFSET/FUNNEL/etc. with handmade layouts.

### Layers (back to front)

1. With `USE_ENVIRONMENT_ASSET_PACK`, FAR is **one image**: `distant-garden-horizon.png` (sky + clouds + distant hills + garden skyline). It is drawn in screen space behind MAIN_WORLD, aspect-preserved, with the painted tree line meeting the horizon so the path can vanish inside the far garden. No procedural sky, no extra cloud sprites, and no FAR parallax. If that PNG is not ready, fall back to `distant-garden.png`. Pack off keeps procedural sky, cloud sprites, and foliage blobs.
2. MAIN_WORLD via camera, layered as FAR landscape → MID garden → side garden frame → road → cat. Lawn, a garden-path corridor with LEFT/RIGHT hedge borders, a MID garden band of small trees/bushes/grass, roadside low plants, vegetation groups, a continuous garden fence with openings, coins, cat. Pack fills that visual road polygon with `path-sand-material.png` as a world-Y tiled sand material (not a full-screen sprite). If the PNG is not ready, the road falls back to procedural FloorSand. Continuous hedge borders share the road's vanishing projection and remain the physical edges of the playable sand. Visually the sequence is sand shoulder → low plants → hedge → bushes → trees. Pack also draws `left-garden-mass` / `right-garden-mass` as outer-lawn groups **behind** those borders on the same world/camera path as trees and bushes. They are presentation-only, never a continuous side wall, and never collide as obstacles. Player X is clamped to the sand inner faces at the cat's screen Y. Obstacle generation still uses `TRACK_LEFT` / `TRACK_RIGHT`.
3. Gate sills (local SAFE / RISK / HIGH RISK material on the opening only — no bright UI strip)
4. Obstacle rects as one continuous garden fence per row, with a separate open gateway on each TWO_PATHS / DUAL_RISK opening
5. Coins
6. Cat
7. Particles / trails
8. Reward markers (`+N`)
9. HUD badges / overlays

### Background

Gameplay objects live in a world Y where planted position is `entity.y - progress`. A `WorldCamera` follows the cat with `screenY = worldY - cameraY`. With the environment pack, sky lives inside the FAR image; pack off keeps screen-space sky and clouds. The path, hedge borders, planters, coins, and roadside vegetation share one horizon-keyed visual projection (`projectTrackRect` / `pathInsetAt`): gameplay X is remapped onto the visual road at that depth. Path inset is moderate (`PATH_INSET_NEAR` 26px, `PATH_INSET_FAR` 108px) so the corridor narrows without a needle vanishing point. Visual and physical road edges stay in sync; there is no extra throat taper. The sand polygon fades into the FAR tree line instead of ending on a hard cap. Player X is clamped to the same inner road edges used to draw LEFT_BORDER / RIGHT_BORDER. Lawn is a continuous MAIN_WORLD surface that meets that join at the horizon. The FAR skyline stays in screen space and does not scroll with MAIN_WORLD. Side vegetation uses overlapping FAR / MID / NEAR compositional groups (tree + understory, not a tree wall) with small air between living clusters, not empty field. Environment props use one continuous `worldDepth` mapping from world position: camera transform → screenY → mild uniform scale, alpha, and contrast. Since 2026-09 (Phase 1) object scale is true perspective: scale = road width at that depth / road width at the cat (about `0.51` at the horizon, `1.0` at the cat, capped at `1.3` below it), and an object keeps a constant share of the road width, so it grows in place and never slides out from behind the hedges (`scripts/drift-probe.mjs` guards this in `npm run check`). Trees, bushes, side masses, and standing obstacles keep a world ground point and a **uniform** `depthScale` (scaleX === scaleY) with a bottom-center anchor. World objects are painter-sorted by ground `screenY`. Obstacle rows are one continuous fence construction with openings; TWO_PATHS / DUAL_RISK add a separate open gateway per opening, posts on the opening edges. Each track segment stores `visualObstacleType`, `visualObstacleSeed`, `visualObstacleScale`, and `visualObstacleId` at creation; the renderer never re-rolls family from `segment.y`, loading, or gap width. Coins keep gameplay size `COIN_SIZE`; presentation uses `VISUAL.COIN_DRAW_SIZE` and `coin.visualId` / `visualSeed` so a production sprite can drop in. A large distant garden arch is not spawned in runtime.

### Track edges

Since Phase 1 step 2 (2026-09) the edge is `src/rendering/HedgeArt.js` (`VISUAL.HEDGE_WALL`): a sand strip, a wooden curb (PlanterWood face, WoodLight top, one InkBrown line on the road side, ShadowDust shadow on the sand, post ticks), then a clipped hedge made of world-anchored leaf clumps (HedgeShade crescent bottom-right, HedgeSage body, HedgeLeafLight highlight top-left) over a deep base so the gaps read darker, with sparse CloudWhite / BlossomPink flowers that thin out with distance. Width and clump size follow the road perspective. The older band, hedge tufts, road-edge plants, side masses and side trees are off while `HEDGE_WALL.ENABLED`; the paragraph below describes that older layer.

Bush and grass tufts sit on the hedge band itself so the border reads as a living garden edge, not a pipe of identical blobs. A road-edge layer (grass / flowers / small bushes, with hooks for future `road-edge-*.png`) sits between sand and hedge. Pack side-mass sprites sit in the outer lawn behind those borders, are not mirrored, and share depth projection with other MAIN_WORLD plants. Left and right masses use different world-Y periods so they do not alternate as a stripe. Near trees may overflow the viewport edge. The playable sand stays clear except for gates and coins. The cat cannot leave the sand: LEFT_BORDER / RIGHT_BORDER are the road boundaries, not extra obstacles.

### Horizon landmark

Since Phase 1 step 3 (2026-09) the far end of the path is a rose-covered pergola, `assets/environment/garden/landmarks/rose-arch.svg`: two square PlanterWood posts with WoodLight / WoodShade sides, knee braces, a top beam buried in HedgeShade / HedgeSage / HedgeLeafLight foliage (heavier on the left), BlossomPink and CloudWhite roses, vine stems on the posts. One InkBrown outline on the wood only. It is rasterized once and drawn at `ALPHA` 0.88 so the sky shows through as distance haze (`VISUAL.ROSE_ARCH`). The tiled sand fades into plain sand over the last `FAR_SAND_VEIL` px so the path runs smoothly into the arch.

### Obstacles / gates

Obstacle rects use one visual family per segment as a shell over existing geometry. The family is stored on the segment (`FLOWER_GATE`, `STANDING_PLANTER`, or `GARDEN_FENCE`) when the segment is created and does not change while that segment is alive. Pack rendering uses one continuous `garden-fence` construction for every barrier row, with openings left as gaps. TWO_PATHS and DUAL_RISK add a separate open gateway (`single-choice-arch` posts + beam) on each opening. SAFE and RISK openings in the same row share one barrier height. Pack off falls back to procedural wood. SAFE / RISK readability lives on gap width, inner-face material, and sills — not a bright accent strip.

Never paint obstacles red. Red was debug danger. In this world, danger is **narrowness**, not colour-of-death.

Exception (2026-09, reference match): garden gates may use **GatePaint** `#D8724A` (a painted terracotta wood) on their panels, with a small flower motif, as on the reference. GatePaint is decoration, not a danger signal: it must not change with SAFE / RISK / HIGH RISK, and it is never used on the path, sills or HUD.

### Depth

Visual vanishing is presentation-only. One depth ratio `u = D/(D+d)` (`src/rendering/VisualProjector.js`) drives screen Y, road width and object scale together. Object scale equals the road-width ratio (true perspective), so objects shrink exactly as much as the road. The painted horizon is `VISUAL.SKY_BAND` (130 since Phase 1, a narrow sky strip as on the reference); gameplay road inset is measured from the separate fixed `CORRIDOR_ORIGIN_Y`, so moving the horizon never changes play. Player draw origin, hitboxes, and gate geometry stay unprojected; at the cat's row the projection is identity, so what touches the cat on screen is what collides. Objects still use a single contact-shadow blob. No AO. Reward plates sit in front of gates and behind HUD.

### Pattern presentation (semantics unchanged)

| Pattern | How it should read |
| --- | --- |
| STRAIGHT | One hedge window. Calm. Default breathing. |
| OFFSET | Three windows drifting one way, like stepped planters. Same fill, shifted. |
| FUNNEL | Wide hedge opening that tightens to breathing width then opens. The pinch is still a garden gap, not a spike trap. |
| OFFSET_GATE | Compact three-step planter staircase. Asymmetry is a shift, not a maze. |
| DOUBLE_GATE | Two hedge windows with a pause of sand between them. The gap is reaction space, not a pit. |
| TWO_PATHS SAFE/RISK | Two openings in the same hedge wall. SAFE is the wider lawn cut with calm wood. RISK is the tighter, warmer planter. The sand between gates stays FloorSand. |
| DUAL_RISK | Two tight cuts, same family as RISK. The harder one is narrower and uses HighRiskClay on the gate, not a full-path fill. |

The corridor floor stays FloorSand. Pack paints `path-sand-material.png` inside the existing projected road polygon so the sand reads as a hand-painted garden path; road edges still come from path geometry against the lawn, not from that texture. Difficulty colour lives on the **gate** (planter fill, inner face, 8 px sill), never as a rectangle filling the whole route.

**Reward values are the primary textual indicator at Choice. SAFE/RISK labels are not permanently displayed during normal gameplay. Difficulty is communicated primarily through geometry, material, and restrained color accents.**

---

## 6. Colour system

Named tokens. New colours are not allowed without updating this bible.

### Core tokens

| Token | Hex | Job |
| --- | --- | --- |
| SkyPaper | `#F3E4C7` | Paper plates, overlays, cream UI |
| GardenSky | `#9CDCEC` | Clear morning sky (flat fill behind clouds). Environment token, not a gameplay colour. Updated 2026-09 to match `docs/reference/reference.webp` (was `#D5E5EA`) |
| FloorSand | `#F7DCA0` | Track bed. Updated 2026-09 to the lighter reference sand (was `#E2C992`) |
| HedgeSage | `#7EA24E` | Hedges, planter greenery, garden. Updated 2026-09 to the reference hedge (was `#6F9A5E`) |
| PlanterWood | `#BF7A45` | Planter boxes, hedge curb, fences, arch. Warm wood of the Ginger family. Updated 2026-09 to the reference crates (was `#C4A06A`) |
| CatCream | `#F6E7C8` | Default coat. Slightly lighter than SkyPaper so Loaf reads on the path |
| CatGinger | `#E39A4F` | Patch, nose, tail tip, warm accent |
| SafeLawn | `#A8C98B` | SAFE gate face / sill |
| RiskApricot | `#E0A36A` | RISK gate fill / sill |
| HighRiskClay | `#C45C32` | HIGH RISK gate fill / sill |
| CoinAmber | `#E8B84A` | Coins, NEW BEST, max multiplier flash |
| InkBrown | `#4A3428` | All outlines, primary text |
| ShadowDust | `#C4A97A` | The only shadow |

### Derived (not new hues)

| Token | How | Job |
| --- | --- | --- |
| InkMuted | InkBrown at 55% on SkyPaper | Secondary HUD (BEST, hints, mute) |
| PathSafeFill | SafeLawn at 70% | Reserved; do not flood the corridor |
| PathRiskFill | RiskApricot at 70% | Reserved; use on gates/sills only |
| PathHighFill | HighRiskClay at 75% | Reserved; use on HIGH RISK gates only |
| UIPlate | SkyPaper | HUD chips, START plate |
| FlashRisk | RiskApricot at 16% | RISK feel flash |
| FlashCoin | CoinAmber at 14% | Coin / NEW BEST flash |
| FlashFail | HighRiskClay at 14% | Game Over flash — keep short and soft |
| HedgeShade | HedgeSage darkened to `#4B6D36` | Shadow side and inner clumps of hedges and planter greenery |
| WoodLight | PlanterWood lightened to `#D39048` | Lit top edge of the hedge curb and planter rims |
| GatePaint | PlanterWood toward HighRiskClay, `#D8724A` | Painted panels of decorative garden gates only (reference gates). Not a difficulty colour |
| GardenLawn | HedgeSage lightened and warmed, `#B4C05A` | Open lawn outside the hedges |
| CloudWhite | SkyPaper lightened, `#FBF8EA` | Clouds on GardenSky |
| HedgeLeafLight | HedgeSage lightened, `#9DBB5C` | Lit top-left of hedge and planter leaf clumps |
| BlossomPink | CatGinger toward SkyPaper, `#F4B3A2` | Pink hedge and planter flowers (white flowers use CloudWhite, centres CoinAmber) |
| WoodShade | PlanterWood toward InkBrown, `#9A5F36` | Shaded side of posts and planks |

### Why each core colour exists

- **SkyPaper** — light first impression; catalogue screenshots that are not black tiles.
- **FloorSand** — the corridor must separate from the page.
- **HedgeSage** — environment and obstacles share a family so walls feel planted, not “enemy red.”
- **PlanterWood** — a second obstacle material so crates ≠ hedges, still in the sand/ginger family.
- **CatCream / CatGinger** — Loaf’s identity. Ginger is also the “appetizing” cousin of RISK.
- **SafeLawn** — calm, related to hedge, lighter so the hole reads as passage.
- **RiskApricot** — warmer, closer to CoinAmber, so greed has a colour.
- **HighRiskClay** — same family, darker, not lava red.
- **CoinAmber** — currency and celebration. Related to Ginger so rewards feel native.
- **InkBrown** — one line colour for cat, crates, type.
- **ShadowDust** — one shadow, mixed from sand, never grey.

### Forbidden uses

- Do not put HighRiskClay on obstacles (GatePaint on garden gates is the only warm-red allowed on obstacles).
- Do not put CoinAmber on SAFE.
- Do not put HedgeSage on the cat (except the Sage Paws skin socks).
- Do not use the old debug pair (blue player `#3a86ff`, danger red `#ff4d4d`) after the overhaul.
- Do not introduce a second outline colour for dark skins.

Palette test: every screen uses ≤ 6 core tokens at once. If you need a 7th, you are decorating.

---

## 7. Lighting

One morning, one sun, no drama.

| Rule | Value |
| --- | --- |
| Direction | Down-right |
| Shadow offset | `+5 px` X, `+5 px` Y in logical canvas space |
| Shadow colour | ShadowDust only |
| Shadow shape | Same silhouette, no blur, no extra length |
| Highlight | Optional 6 px top edge on crates/hedges. Flat. No gradient |
| Second light | Forbidden |
| Specular / bloom / AO / rim light | Forbidden |
| Time of day | Always morning. No night mode in v1 |
| Flash | Full-screen tint from the flash tokens, ≤ 0.12 s, already in GameFeel |

All future assets must look as if they were drawn in this light. A skin that needs a different shadow is rejected.

---

## 8. Shape language

### Outline

- Logical weight **4 px** on cat, crates, coins, UI plates
- Labels may use 3 px InkBrown stroke for readability at speed
- HUD text: fill InkBrown, no rainbow strokes
- Never mix thick cat + hairline UI

### Corners

Two legal radii only:

- **0 px** — hedge blocks that must match gate geometry (keep gate reading honest)
- **12 px** — cat body, coins, HUD plates, START / Game Over cards, buttons

Do not invent 4 px, 8 px, and 20 px radii in the same screen.

### Legal shapes

- Round-rect (cat, plates, buttons)
- Rect (gates, track, hedges)
- Circle (coins, dust motes)
- Loaf silhouette (cat only)
- Teardrop (leaf trail only)

### Illegal shapes

- Spikes, chevrons, skulls, flames, lightning
- Long triangles as the player (after overhaul)
- Hex badges, glossy pills, neon rings
- Organic blobs for gates (gates stay rectangular)
- Pixels-as-style mixed with smooth felt

### Buttons / CTA

Wood/paper plate: UIPlate fill, InkBrown 4 px outline, 12 px radius, one ShadowDust. Primary label in InkBrown, large. No gradient button, no drop-shadow blur, no emoji.

### Particles

Prefer **circles** and **tiny squares** (already in ParticleSystem). Colour from palette. Size 2–4 px. Squares are crumbs; circles are dust/pollen. Do not switch to stars.

---

## 9. Animation language

Reuse the existing GameFeel vocabulary. Do not add a run cycle, cloth sim, or blink-every-frame face.

| Existing | Future use |
| --- | --- |
| `PLAYER_BOB` (1.6 px, sin) | Loaf’s walk. Keep. This *is* the run cycle |
| Squash / stretch on pulse | Pickup and RISK. X shrink / Y grow already in Renderer |
| Rotate / lean (`dir * 0.08`) | Strafe lean. Keep small. Ears must stay readable |
| Flash | Palette tints only |
| Particles | Dust, crumbs, pollen in palette colours |
| Shake | Same magnitudes. Light world still shakes on RISK and Game Over, but do not increase |

### Cat motion rules

- No 12-frame run
- No tail physics beyond a 1–2 px lag on lean
- Game Over: Loaf sits (see §13). One pose, not a cartoon collapse
- START: Loaf idle bob only
- Collection: existing playerPulse is enough

If a new animation cannot be expressed as bob, lean, squash, flash, particle, or sit-pose, it does not ship.

---

## 10. SAFE / RISK / DUAL_RISK visual language

Gameplay widths and rewards stay. Presentation must make greed visible without horror, without painting the whole corridor.

**Geometry first. Reward second. Text third.**

Permanent on-path words `SAFE`, `RISK`, and `HIGH RISK` are forbidden during play. First-run START may still say `SAFE = SURVIVE • RISK = BIG SCORE`.

### SAFE

- Feel: calm, wide, easy to trust
- Floor: FloorSand
- Gate: PlanterWood with a quiet SafeLawn face/sill
- Marker: `+10` (or the actual SAFE reward) on a small cream plate below the nearest gate
- Feel burst: 3–4 HedgeSage/SafeLawn motes, already-small SAFE intensity

### RISK

- Feel: warmer, tighter, more delicious
- Floor: FloorSand
- Gate: RiskApricot planter + sill in the opening only
- Marker: `+100` (or the actual RISK reward), CatGinger on the plate
- Feel: apricot flash, more particles than SAFE, still under current RISK counts

### HIGH RISK

- Gate: HighRiskClay planter + sill
- Marker: `+250` (or the actual hard reward)
- Not lava, not skulls, not electric fences
- Difference from RISK must read in **width first**, gate colour second

### DUAL_RISK

- Both corridors use the RISK family (apricot / clay), never a green highway
- Easy vs hard: width + RiskApricot vs HighRiskClay gates
- Markers: `+150` and `+250` only — no RISK/RISK words
- No third material. Player compares two appetizing gaps, not “good garden vs hell”

### Choice readability at speed

- No full-path colour fills
- Reward plate sits just after the nearest gate row, toward the player, not over the gap
- Never colour-blind-only: HIGH RISK is also the **narrower** gap

---

## 11. UI / HUD

Phase 8 copy stays. This section is materials only.

### Shared UI kit

- Font: one grotesque, not `system-ui`. Prefer a rounded geometric with three sizes: Title / Score / Caption. Exact file chosen at implementation; must support the English UI.
- Type colour: InkBrown on plates, SkyPaper only if a plate is InkBrown (rare; avoid)
- Plates: UIPlate + 4 px InkBrown + 12 px radius + ShadowDust
- No emoji (already a project rule)
- No extra buttons on PLAYING

### START

- World already visible (garden corridor + Loaf idle), not a black dim
- A single cream plate in the lower-middle
- Title **ONE MORE RUN** as a wooden/paper sign, not a chrome logo
- CTA **TAP TO START** on the plate
- Control line and first-run hints keep current wording, Caption size, InkMuted
- Mute line stays `M SOUND` / `M MUTED`

### HUD (PLAYING)

Keep the current information map:

| Slot | Content | Visual |
| --- | --- | --- |
| Top-left | score, SCORE, BEST n | Smaller cream badge, more sky showing through |
| Below left | COINS n | CoinAmber number on a compact badge |
| Top-right | STREAK n | InkMuted at 0; CatGinger when streak > 0 |
| Below right | SCORE xN | InkMuted at 1.0x; CatGinger when > 1; CoinAmber at max 5.0x |
| Bottom-left | mute | Caption, InkMuted |

HUD badges are lighter than START / Game Over plates: ~62% SkyPaper, 2 px InkBrown, small shadow. They must not eat the sky. Pulses already in GameFeel stay. Do not add meters, progress bars, or portraits in the HUD.

### Game Over

See §13. Same kit. Primary CTA **TAP / R TO RESTART**.

### Floating rewards

Keep numeric `+N` and Phase 8 subtitles (`RISK BUILDS STREAK`, `STREAK n • SCORE xN`). Colour: CoinAmber for coins, RiskApricot/Clay for RISK, SafeLawn/InkBrown for SAFE. No extra icons flying.

---

## 12. Coins

Coins are garden **buttons** (or button-like discs). They must read as currency in the future shop and as skippable pickups now.

| Property | Rule |
| --- | --- |
| Shape | Circle, same size as now (~18 px) |
| Fill | Warm CoinAmber mixed toward CatGinger |
| Outline | InkBrown, slightly thinner than Loaf |
| Detail | Painted rim plus a small cream highlight; no HUD-icon look |
| Shadow | Soft ellipse under the disc, ShadowDust |
| Animation | Optional ~2 px vertical bob; no Mario-style spin |
| Collection | Existing tiny burst + HUD pulse; crumbs in CoinAmber |
| Placement | Unchanged rules: NORMAL only, skippable, reachable |

Do not use fish, yarn balls, or stars as the default collectible. Yarn/leaves belong to **trails**, not currency. The shop later spends these same buttons.

A coin must never be confused with pollen trails: coins have outline + 18 px; pollen does not.

---

## 13. Game Over

Not a death screen. Loaf **sits**, slightly squashed, facing us or three-quarter, still the same markings. One still pose is enough (the only extra cat drawing besides the run sprite).

### Composition (logical 540×960)

1. Dim the world with SkyPaper at ~60% opacity, not black 0.85
2. Loaf sit pose in the lower third, above the CTA
3. Title **GAME OVER**
4. **NEW BEST** in CoinAmber with the existing pulse, **or** `N TO NEW BEST` in InkMuted
5. Score (large), then BEST, then `COINS n • SAVED` in CoinAmber
6. **TAP / R TO RESTART** as the only primary plate
7. Mute caption

No broken bones, no tombstones, no red splash. The existing HighRiskClay flash may play once at impact, then the cream overlay takes over.

Motivation: Loaf is still there. The number to beat is still there. Restart is the only big action.

---

## 14. Icon / cover / promotional materials

One character model. If the store cat does not match Loaf’s grid, it is wrong, even if it is “prettier.”

### Icon

- Fill the square with Loaf’s **head**
- Show folded right ear (crop it with the frame)
- Show left ginger patch
- Background: HedgeSage band or FloorSand, not a landscape
- No title text on the icon
- No extra characters, coins raining, or UI chrome

### Cover

- Loaf three-quarter, readable from the chest up
- Behind: one SAFE gap and one RISK gap in a hedge wall
- Title set in the same grotesque as the game
- Same palette. No photoreal grass.

### Screenshots

Three honest game frames (after overhaul):

1. Loaf + fork with `+10` / `+100` plates, not SAFE/RISK words
2. A patterned gate (FUNNEL or OFFSET) at readable speed
3. Game Over with NEW BEST or N TO NEW BEST

Do not collage effects. Do not render a fake 3D scene. Crop the real canvas.

### Promo rule

Any poster, trailer still, or ad uses the master sprite sheet or a drawing constructed on the 10×12 grid. Generating a new cat “in the same vibe” is forbidden.

---

## 15. Anti-AI-slop rules

The game looks authored when every object shares line, light, palette, and anatomy. It looks generated when each asset is a separate pretty picture.

### Forbidden

1. Different art style between cat, UI, and world
2. Different lighting per asset
3. Different anatomy for any Loaf skin
4. Hyper-detailed fur, pores, or hair cards
5. Huge anime eyes, wet highlights, eyelashes
6. Cinematic lighting, rim lights, god rays, lens flare
7. Photorealism or 3D render next to flat 2D
8. Neon palettes, chrome, holographic foil
9. Random fantasy props (crystals, portals, runes, dragons)
10. Spikes, lava, skulls, caution tape as RISK language
11. Sparkle spam, glitter trails, screen bloom
12. Emoji, stickers, “AI slop” sparkles
13. New hues “just for this skin”
14. Outline weight changes per object
15. Soft airbrushed shadows on one asset and hard cel shadows on another
16. A marketing cat that is not Loaf
17. Parallax tourist backgrounds (castles, cities, waterfalls)
18. Mixing pixel-art, vector-flat, and painterly in one build
19. Watermarked or stock-looking illustration
20. Slogans on START (“Unleash your destiny”)
21. More than one accessory
22. Hats that eat the ear silhouette
23. Night / rain / seasonal weather that changes the light model
24. Using a new generated image as a production sprite without rebuilding it on the grid

### Positive tests (must pass)

- Silhouette test: Loaf reads in one colour
- Icon test: head crop is the in-game cat
- Palette test: ≤ 6 core tokens on a PLAYING frame
- Speed test: gaps still read at 720 px/s on a phone
- Skin test: folded ear + left patch + loaf body still present
- Corridor test: a stranger understands this is a path with holes, not a landscape

---

## 16. Code vs art assets

### Stays Canvas / code

- Track geometry, segment layout, all patterns
- Gate and obstacle **rects** (materials painted in Renderer)
- SAFE / RISK / DUAL fills and labels
- Background, floor, hedge bands
- HUD, START, Game Over layout and copy
- Coin pickup rules and, preferably, the coin disc itself
- Particles, flash, shake, bob, lean, squash
- Trails (procedural), when added
- Speed stitch / dash on edges

### External assets

- **Master Loaf** run sprite (rear), plus lean if not solvable by canvas rotate
- **Sit pose** for Game Over / START idle (or START reuses run + bob)
- Skin recolours: prefer **palette swaps of the master sheet**, not new drawings
- Optional hedge scallop mask / felt grain tile (1-bit, tinted in code)
- Icon 512, store cover, screenshot frames (produced from game + master)
- Future accessory overlay (one small PNG, same outline)

### Do not generate with AI as production art

- Final Loaf sprite
- Skin sheets that do not share the master
- Icon “from scratch”
- Background paintings
- UI plates, buttons, fonts-as-images
- Particle textures
- Gate/obstacle PNGs that replace procedural rects
- Promo cats

### Allowed AI use (pre-production only)

- Silhouette thumbnails for Loaf
- Palette pairing sketches using the named tokens
- Moodboards of felt, wood, paper (materials, not characters)
- Comparing 3 ear-fold options

Workflow: AI thumbnail → human/artist locks the 10×12 grid → production sprite (hand or tightly cleaned vector) → all other views derived from that file.

---

## 17. Future cosmetic shop

Direction only. Do not implement.

### Structure

```text
SHOP
├── CAT     (skins of Loaf)
├── TRAIL   (dust, paws, leaves, …)
└── OTHER   (optional later: Game Over plate colour, START sign — still palette-bound)
```

### Coins

- Earned in runs, persist, already stored via `StorageService`
- Future spend: cosmetics only
- Never buy score, streak, revive, extra gaps, slower speed, or “lucky” spawns
- No pay-to-win. If ads ever fund coins, they still cannot buy power

### Equips

- One cat skin, one trail, at most one “other”
- Default Cream Loaf + Dust motes are free
- Locked items are greyed **recolours of Loaf**, not mystery boxes with different animals

### Tone

Shop is a felt catalogue, same plates as START. No timers, no fake rarity flames, no 18 skins on one page. A short list that looks like the same game.

---

## 18. Implementation strategy

Do this order. Each layer assumes the previous is locked.

1. **Visual tokens / palette** — add named colours to config. Triangle player may remain, but the world already uses SkyPaper/FloorSand. Proves the light corridor at speed.
2. **World / background** — canvas fill, side gardens, remove black page.
3. **Track materials** — floor, hedge edges, planter obstacles, stitch dashes. Patterns unchanged.
4. **Master Cat** — Loaf sprite on the existing 30×30 hitbox. Bob/lean/squash only.
5. **Coin** — button disc in CoinAmber.
6. **Effects** — retint particles, flashes, floating numbers.
7. **HUD / START / Game Over** — plates, sit pose, same copy.
8. **Skin architecture** — palette-swap of master sheet, no shop UI yet.
9. **Trail architecture** — behind-cat particles, budget 8, default dust.
10. **Shop** — spends coins, cosmetics only, after skins/trails exist.
11. **Icon / cover / screenshots** — last, from the real cat in the real game.

### Dependencies

- Do not draw Loaf before tokens exist (wrong cream will stick).
- Do not build shop before master sheet and swap rules exist.
- Do not commission a store icon before the in-game cat is in.
- Do not add trails that compete with untested gate contrast.
- Gameplay files stay frozen unless a visual pass needs a **presentation-only** hook (e.g. `segment.pattern` is already there).

---

## 19. Current-game mapping

What exists today, and what it should become:

| Now | After overhaul |
| --- | --- |
| `#0d0d0d` page, `#161616` track | SkyPaper + FloorSand |
| Red obstacle rects | HedgeSage / PlanterWood rects |
| Blue triangle | Loaf sprite, same hitbox |
| Olive / brown path fills | Local gate stain + sill; floor stays FloorSand |
| Gold coin circle | CoinAmber button |
| Black 70% START / Game Over | Cream overlay + plates |
| White system-ui type | InkBrown grotesque, three sizes |
| Square particles, white speed lines | Dust/crumbs in palette; speed lines dropped or turned into stitch |
| Debug blue / red / grey HUD | Cream plates, Ginger streak, Amber coins |

---

## 20. Document control

- If code and this bible disagree on **look**, this bible wins after the overhaul starts.
- If code and this bible disagree on **gameplay**, the code / GAME_SPEC win. Change the picture, not the rules.
- Palette, Loaf grid, and anti-slop lists are closed. Open them only with an explicit bible edit.
