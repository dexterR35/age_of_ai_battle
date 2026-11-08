# Current game rules · React edition

The browser UI is React + Vite + JavaScript/JSX + CSS. It manages the HUD, dialogs, reports and game lifecycle through components and hooks. Only the Canvas renderer owns imperative drawing and canvas input. Its animation frame, input handlers and ResizeObserver are disposed when React unmounts it. There is no `innerHTML` app shell or parallel legacy frontend.

## Victory and players

2, 4, 6 or 8 autonomous players; FFA, duel or fixed equal teams. Opening peace lasts three simulation minutes. Destroying a town center eliminates that empire. The last surviving empire/team wins. A simultaneous destruction of all sides can draw. Three consecutive failed API turns are explicit technical forfeits, separately reported from military conquest.

Matches run **until victory, without a time cap**. The simulation and API budget are separate: a budget-exhausted model keeps its existing orders but makes no further calls. A strategy that never attacks can therefore stall a battle; the engine does not invent a score-based winner. Operators may explicitly stop a match without progression. Old duration fields are ignored for new matches and cleared for running saved matches on recovery. Completed historical records retain their original metadata.

## World and expansion

Main maps are 256, 384 or 512 tiles per side. Defaults: two players 256; four 384; six/eight 512. The camera starts at tactical scale near a town, independent of world dimensions. Whole-world overview and a hidden-by-default navigator are optional. Canvas work culls offscreen units and deposits; React owns HUD updates independently of animation frames.

Every player receives the same starting stocks and rotated nearby deposit counts. Two additional neutral resource hubs per starting faction supply timber, stone, ore and gold in the interior. These are real gatherable deposits, not decorative icons.

- Riverlands: central river, crossings at 25%, 50% and 75% of map height. Saved crossing waypoints keep units on the bridge until they exit the far bank.
- Highlands: no river; mineral deposits are 37.5% richer; off-road movement 10% slower.
- Crossroads: no river, connected starting roads and denser decorative forest.

Roads grant 20% movement speed. A road order extends from the closest completed town/depot/outpost to an explored endpoint within 35 tiles, for 3 timber +1 stone per tile. Outposts may be built up to 54 tiles from one of those anchors. Ordinary buildings require explored, unoccupied land within 38 tiles of a town/outpost or 28 tiles of a depot. Outposts reveal terrain and receive resource deliveries. All visible trees are finite resource nodes and block their navigation tile. Cutting opens the tile; stumps remain visible. Water blocks movement, hills slow it, and A* rejects diagonal corner cutting. Terrain generation keeps starting estates accessible. Inter-town roads are not generated; local settlement roads remain. Desert biomes are traversable.

## Civilian economy

Only `worker` units do civilian work. They walk to deposits, collect into a carried load, and deliver to town, depot, outpost, or the appropriate completed production building. Food, wood, stone, ore, gold, metal and coins are separate stocks. Worker weights allocate food/timber/stone/ore/gold jobs. Metal is manufactured, not mined directly.

Lumber camps improve timber work; quarries improve stone; iron and gold mines improve their own mining. Ore/gold collection without an appropriate mine is only 25% of base productivity; stone without a quarry is 45%. Completed station levels add their production bonus. Depot levels, tools, carrying upgrades, farms and governments modify actual production.

Farms provide renewable food. Houses increase housing, subject to the 300 total population cap (at most 100 villagers and 200 soldiers). Queued units count against all applicable caps. Everyone eats. Soldiers also draw wages; hunger or unpaid wages damage units.

One villager per ore refinery walks to the building and staffs it. Each metal consumes 2 ore and 0.75 wood. Without staff at the refinery, production stops. Advanced swordsmen, knights, rams and forge upgrades spend metal. Gold refinery/mint consumes gold to produce coins.

## Construction and prerequisites

Every build checks affordability, town unlock level, prerequisite building levels, construction-site cap, ownership influence, explored ground and valid placement before spending resources. Prerequisites must be complete. Building upgrades cannot be queued twice on the same structure, cap at five, and are gated by `ceil(town level / 2)`.

Examples of the actual chain in `src/rules.mjs`:

| Unlock | Completed requirements |
| --- | --- |
| Lumber camp | Depot L1 |
| House / farm | Lumber camp L1 |
| Barracks | House L1 + lumber camp L1 |
| Quarry | Depot L1 + lumber camp L1 |
| Iron mine | Quarry L1 + depot L1 |
| Archery range | Barracks L2 |
| Forge | Iron mine L1 + quarry L1 |
| Ore refinery | Forge L1 + iron mine L2 |
| Market | Depot L2 + lumber camp L1 |
| Library | Market L1 + house L2 |
| Government | Library L1 |
| Siege workshop | Forge L2 + ore refinery L2 |
| Keep | Barracks L3 + fortifications L2 |
| Wonder | Academy L3 + government L3 + temple L2 |

Town upgrades also require the previous economic and military institutions. For example, town L3 needs a barracks and quarry; L5 needs a library and market; L6 needs a refinery and government. See `TOWN_REQUIREMENTS` for the complete table.

Builders are assigned to actual active sites and walk there. Only villagers in building range contribute. Construction and building upgrades use `builders^0.8`, government and tools. Work is zero with no available villagers. Upgrade work is `base × 1.6^(target building level−1)`; town upgrade work is `90 × 1.45^(current town level−1)` seconds before builder modifiers. Research work also increases with research level. A building may be attacked during construction and does not resurrect if destroyed.

## Army, defense and diplomacy

Barracks, range, stable and siege workshop train distinct military units. Five queue slots per building. Spearmen counter cavalry, archers counter spearmen, cavalry counter archers, and rams are needed for efficient building damage. Hits resolve simultaneously every two seconds using the original Age of AI damage formula. Towers and keeps defend automatically. Walls provide a bounded fortification reduction, rather than an impassable mesh. Individual wounded units retreat and heal; veterans receive capped bonuses.

Main, infantry, ranged, cavalry and siege orders permit separate maneuvers. Models can move, attack a scouted building, raid, defend or retreat. They never issue hidden omniscient targets. Markets offer resource trades that expire and settle atomically when accepted. Truces require a reply and block combat for three minutes.

## Model turns, records and privacy

One compact JSON turn includes the king's brief justification, economist/general/diplomat summaries, resource weights, formation and at most eight validated actions. Due players receive observations captured before any of the turn's orders are applied. Only own stock/buildings/army, explored resources, visible enemies, timestamped last-seen buildings, received diplomacy and own lessons are included. The spectator state is never used as the model observation.

Token reservations are checked before calls. Actual provider usage replaces the reservation when available. Missing/timeout/interrupted usage is conservatively estimated. Interrupted calls are checkpointed and not replayed after restart. Reasoning counts are a provider-reported subset of output; private chain-of-thought is neither requested nor exported. Cost estimates use user-entered rates, not an invoice.

Cloud records include the map/seed, result, elapsed simulation time, model/provider IDs, decisions, accepted/rejected orders, usage, latency, resources, combat events and 30-second timelines. Profiles gain a level per victory and store their own strategic lessons. This changes prompt context, not model weights.

## Original project and verification boundaries

The original `../ageofai` project was read, not modified. References include its `data/rules.yaml`, gathering and military formulas, fog, council and development documents, original map renderer/CSS and the supplied screenshot. This is a separate engine adapted to autonomous conquest. Seasons, family generations, nightly CMA-ES, chronicles, local Ollama and media generation are outside this match mode.

Provider adapters are verified with mocked API replies; live paid model battles still require supplied credentials and an authenticated cloud runner deployment. The private hosted viewer is exhibition-only until connected. Cloudflare Durable Objects or a persistent Node service run API games without an open browser.

Civil institutions: treasury (town 5), engineering bureau (5), embassy (5), hospital (6), alongside existing government, library and academy. Completed prerequisites gate construction. Staffing is capped at three per department and consumes real villagers; total assigned civilian specialists share a 40% workforce cap with essential production. Research advances only with on-site scholars at its required building. Ruins pay 80 stone and 40 gold once, after a villager performs 30 seconds of work.
