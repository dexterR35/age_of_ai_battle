# Age of AI: Dominion

An autonomous medieval strategy war fought only by AIs — ChatGPT, Claude, Grok, Gemini, DeepSeek, Llama, Mistral and Qwen — on one shared map of up to **512 × 512** tiles. Up to **8 nations**, **400 population** each. No human commands: you watch, inspect and follow the battles.

```
cd empires
node server.mjs
```
Open **http://localhost:8080**. Requires Node 18+ (no npm install, no dependencies).

For a first match, choose **New Battle**, leave **Live** unchecked, and select **Start Battle**. Click a nation card to inspect its realm or press **I** for analytics. See the [example match gallery](../arena/docs/dominion-gallery.md) for battlefield, inspection, and analytics views.

## What happens in a match

- **Economy.** Villagers walk to trees, berry bushes, gold/stone/iron mines and farms, carry loads to the nearest drop site (Town Center, Lumber Camp, Mining Camp, Mill) and build. Trees are felled one by one and leave stumps; mines deplete; farms are reseeded with wood.
- **Population.** Houses (+10), the Town Center (+15) and Castles (+20), hard cap 400. Units take 1, 2 or 3 population depending on how far their line is upgraded and the nation: e.g. Champions cost 2, but only 1 for the Valorian Legion; Paladins cost 3, but 2 for the Steppe Khanate. Veterans keep the slot they were trained with.
- **The building pyramid.** Tribal → Feudal → Kingdom → Imperial → Renaissance. Each age needs two *different* buildings from the previous tier, and buildings have prerequisites (Stable needs Barracks, Castle needs Blacksmith, Hospital needs Infirmary, Wonder needs University + Castle …). Every building and unit has its own build/train time.
- **Town planning.** The AI places houses and farms behind the town, military buildings and the castle toward the enemy, and camps at the forest edge or next to mines. Busy footpaths turn into dirt roads, which are paved around advanced towns; roads make workers faster.
- **Growing towns.** The capital grows from Village to Town, City and Great City with its population, age and buildings, and each rank gives bonuses. A City unlocks the Bank, the Printing Press and the Wonder. Buildings change look with the ages: timber and thatch, then plaster and tile, then stone, then banners and gilding.
- **The Renaissance (5th age).** It needs two of Printing Press, Cannon Foundry, Bank and Wonder. It brings Musketeers, Bombard Cannons, Gunnery and the Star Fort (a huge cannon fortress). Every nation also has its own **Monument** with its own bonus, e.g. the Arena of Valor, the Golden Exchange or the Hanging Gardens.
- **Walls, gates and traps.** Defensive AIs ring the whole town with walls; others wall only the side facing the enemy. The rings have gates toward the enemy and toward every camp, plus round wall towers. Gates open for their owner and allies only, so enemies must break them (rams do it best), and *Boiling Oil* burns whoever batters them. Castles get their own curtain wall with corner towers, and a *Moat* tech floods a ring of shallow water around them. Palisades are rebuilt in stone later, and *Fortified Walls* strengthen them. Archers climb onto the walls when the bell rings and gain range and armor there. Attackers bring **Siege Towers** that drop a ramp over a wall so troops can cross. Outside the walls wait hidden **traps** that only reveal themselves when sprung: sharpened stakes (stop cavalry charges), spike pits, caltrops (slow and wound) and pitch trenches (burst into flames).
- **Fog of war.** Each AI estimates its rivals only from what its soldiers and towers have actually seen, plus a guess at how they have grown since. The *Spy Network* tech reveals the truth.
- **Battle tactics.** Cavalry wings sweep around the enemy line to hit archers from behind. Before walled towns, armies set up a **siege camp** with tents and wait for siege engines. Defenders **sally out** with cavalry to burn siege engines.
- **Combat.** Melee/pierce/siege damage vs armor, counters (spear > cavalry > archers > infantry), flanking and rear attacks, cavalry charges, high-ground bonus, veterancy, splash for mangonels, siege for walls and towers. Towers, Town Centers and Castles shoot arrows (more with villagers garrisoned).
- **Morale.** Every soldier has morale: losses nearby, being outnumbered and flanked lower it; heroes, priests, religion and government raise it. Broken units **rout** and flee home, then rally. Armies retreat when shattered.
- **Heroes.** From the Feudal Age a Barracks can raise one named hero (e.g. *Cassian the Bold*). Fights won near the hero bring fame: Captain → Commander → Warlord → Legend. Each rank adds health, damage and a wider morale aura. A hero's death shakes the whole army and is announced to the world.
- **Capturing and surrender.** Soldiers capture an enemy building once it is below 30% health and they outnumber its defenders 3 to 1, including Town Centers and Castles. A nation that has lost its capital, has almost no army left and is far behind its attacker surrenders. Its lands are annexed and its army is disbanded.
- **Rebellions.** Each captured or far-away town has its own **loyalty**. Distance from the capital, recent conquest, high taxes and unhappiness wear it down; a garrison and a temple hold it up. At zero the province breaks away as a new rebel nation with its own AI. Lasting misery at home starts a **peasant revolt** instead. The AI sends garrisons to restless towns.
- **Ships.** Docks on a shore train Fishing Boats (they catch fish in the shoals), War Galleys, Fire Ships and Dromons that bombard the coast. Fleets defend their harbour and sail against rival harbours on the same sea; the Seven Rivers map has the most naval war.
- **Wounded & medicine.** A fallen soldier may survive as **wounded** and walk to an Infirmary, Hospital, Temple or Town Center to heal. Field Surgeons and Priests heal in the field. Crowded towns suffer **plagues**; hospitals, sanitation and the Health Ministry help.
- **Food & happiness.** Everyone eats; cavalry eats more. Famine, high taxes, war losses and disease lower happiness, which lowers productivity and morale.
- **Rulers, laws, governors.** Every nation has a ruler with a trait (the Wise, the Conqueror, the Just…) who ages and dies. Monarchies pass the crown to an heir, sometimes with a **succession crisis** and a pretender who takes a province. Republics hold elections between a War, Peace and Merchant party. From the Feudal Age nations decree **laws**: Conscription, Free Markets, Religious Tolerance, Curfew, Martial Law, Public Feasts, Road Tolls. Each province has a **governor** with a temperament (honest, greedy, loyal, ambitious, old soldier, zealot); the AI dismisses bad ones. **Corruption** grows with distance and the number of towns and eats taxes; Courthouses fight it.
- **Government.** Tribal Chiefdom → Feudal Monarchy, Theocracy, War Junta, Republic, Merchant Oligarchy, Imperial Autocracy (Council Hall). Nine **ministries** (War, Treasury, Agriculture, Health, Religious Affairs, Trade, Public Works, Defense, Science), each funded at levels 1–3 from gold upkeep.
- **Invented religions.** Founded at a Shrine with faith: Church of the Ember Sun, Covenant of the Green Root, Order of the Silver Tide, Creed of the Ironmother, Mysteries of the Starweaver, Vigil of the Ashen Warden, Choir of the Pale Moon, Pact of the Stormcaller. Faith buys **rites** (Blessed Harvest, Holy War, Day of Rest, Divine Healing, Great Pilgrimage). **Sacred Sites** on the map give faith and gold to whoever holds them.
- **Trade.** Caravans travel between your Market and the neutral **Great Bazaar** in the middle of the map (or an ally's or trade partner's market); longer routes earn more gold. Merchant **Trade Cogs** sail between harbours. **Luxury goods** (silk, spice, wine, salt) grow at Plantations built on deposits. Caravans sell them at prices that fall as the market fills, and goods in store make people happier. Towns collect **tolls** from foreign carts passing by. Raiders lie in wait for caravans near the Bazaar, and nations that lose carts send riders as escorts. Markets sell surplus and buy shortages at shifting prices.
- **Trade diplomacy.** Trade agreements (+10% and open markets), embargoes (two or more against the same nation halve its Bazaar income), tribute demands from the strong ("pay or face war"), and tribute offered by the besieged to buy peace.
- **Diplomacy.** Peace offers, alliances against a runaway leader, betrayals by ambitious minds. In free-for-all only one may rule: when only allies remain, the alliance breaks.
- **Repairs and rebuilding.** Villagers repair every damaged building once the fighting around it stops (stone works with stone, the rest with wood), most important first: town centers, castles and the Wonder, then gates and towers, walls, military buildings. A destroyed building is rebuilt on its ruins once no enemy soldiers are near.
- **Victory.** Under **total conquest** (the default) a nation falls only when every building (walls and traps aside) and every person on land is destroyed. When it loses its last Town Center and Castle, its remnants are revealed and rival AIs send hunting parties after every last house and villager. The faster rule ("its town centers and castles fall", used by tournaments) eliminates a nation once both are gone (a short grace lets villagers rebuild). Last nation or team standing wins (rebels don't count), or a Wonder that stands 15 minutes, or the best score at an optional time limit. 8-nation games on 512 maps usually end between 70 and 130 minutes; walled towns make conquest slower.

## AI players

| AI | Style | Favourite nation |
| --- | --- | --- |
| ChatGPT | Balanced strategist | Aurelian Republic (trade) |
| Claude | Patient architect | Sunspire Theocracy (faith) |
| Grok | Reckless rusher | Valorian Legion (offense) |
| Gemini | Tech boomer | Meridian Commonwealth (growth) |
| DeepSeek | Efficient optimizer | Ironhold Clans (industry/siege) |
| Llama | Steppe raider | Steppe Khanate (horse) |
| Mistral | Merchant prince | Aurelian Republic (trade) |
| Qwen | Iron turtle | Bastion Concord (defense) |

Without API keys each nation is played by a built-in general with that personality. Tick **Live** on a nation in the setup screen and add a key under **AI Keys & Models** (or set `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `XAI_API_KEY`, `GEMINI_API_KEY`, `DEEPSEEK_API_KEY`, `MISTRAL_API_KEY`, `OPENROUTER_API_KEY`, `GROQ_API_KEY` before starting the server).

Every 45–180 game seconds (set in the setup screen) the real model receives a report of *its own* nation: resources, army, field armies, what it has scouted, the techs it can research, the buildings it can build, its hero, unrest, coast and what its general did since the last report. It answers with orders, and the built-in general carries them out:

| Order | Effect |
| --- | --- |
| `posture`, `target`, `mix`, `villagers` | overall style, main enemy, army composition, economy size |
| `attack: now / auto / hold` | launch an assault at once, let the general pick the moment, or recall field armies |
| `focus: capital / military / economy` | what an assault burns first |
| `research`, `build` | up to 4 techs and 3 buildings to do next |
| `age_up`, `wonder`, `fleet`, `raids`, `sites` | when to advance, whether to build a Wonder, warships wanted, cavalry raids, sacred-site warbands |
| `tax`, `government`, `departments`, `doctrine`, `rite`, `laws`, `governors` | the state and the faith |
| `walls: ring / auto / none`, `traps` | how to fortify |
| `diplomacy`, `message` | war, peace, alliance, tribute demands, embargoes, trade agreements; a message shown to everyone |
| `armies` | per field army: attack a nation, hold, retreat, reinforce |
| `next_check` | when to be asked again if nothing urgent happens (30–600 game s) |
| `reason`, `plan` | shown live in the nation's **AI Mind** panel with each past order |

**Smart calls (default).** Instead of asking the model on a fixed timer, the game checks each live nation every few seconds and calls only when something important changed: it came under attack, lost a town or several buildings, reached a new age, war or peace changed, a campaign ended, a rival fell or finished a Wonder, famine or unrest began, a province may rebel, its hero fell, or the treasury overflows. A routine check still happens after 2.5 intervals of quiet, and calls are never closer than 40% of the interval. The model is told why it was asked. In a 60-minute test this made 25 calls instead of 40. Choose "Fixed" in the setup screen for the old timer.

**Budget.** Each live nation gets a budget per game ($0.50, $1, $2, $5 or no limit; default $1). The model sees how much is left in every report. Below half, calls come half as often; below a fifth, only emergencies reach it. When it is spent, the built-in general rules alone. In a test with a $0.15 budget the nation made 11 calls and then stopped.

**The model picks its next check-in.** With `next_check` (30–600 game seconds) it says when it wants to hear from the game again if nothing urgent happens: short in a crisis, long in quiet times. Attacks, lost towns, changes of war or peace and enemy Wonders always wake it.

**Orders per army.** Each field army in the report has an id; the model can order it to `attack` a nation, `hold` its ground for 90 seconds, `retreat` home, or be reinforced from the home guard (`reinforce`). Single soldiers, formations, paths and targets stay with the general.

**Prompt caching (Claude).** The game's instructions are the same in every call, so they are cached for 5 minutes; cached input costs about 5% of the normal price on Opus 5.5. Together with smart calls, a live Opus nation cost about half as much in that test. Analytics → AI calls & cost shows calls saved, money saved, the share of input read from cache, and why each call was made.

**Free.** Run a model on your own computer with Ollama or LM Studio and choose "Custom" with its address (Ollama: `http://localhost:11434/v1`).

A custom OpenAI-compatible endpoint (e.g. a local model server) is supported. Model names are editable; Claude defaults to `claude-opus-5-5`.

Keys are sent only to the local server, never stored unless you tick *Remember keys*.

## Watching

| Control | Action |
| --- | --- |
| Drag, WASD / arrows | Pan |
| Wheel, + / − | Zoom |
| Click | Inspect a unit, building, mine or sacred site |
| Double-click | Zoom in there |
| Nation card | Open the nation's realm, state & faith, army and AI-mind panels |
| Log entry / toast | Jump to the event |
| Minimap | Jump; red rings mark battles |
| Space, 1–6 | Pause, speed 1× … 32× |
| C or 🎥 Director | Camera follows the biggest battles automatically |
| Home or 🗺 World | Whole-world view |
| G or 📊 Stats | Charts over time (score, army, economy, kills, happiness…), key moments you can jump to, heroes |
| 🔊 / M 🎵 | Battle sounds / music (synthesized live, nothing to download) |
| 🌦 | Day and night, clouds, rain, snow and fog (decoration only) |

The simulation runs on a time budget per frame: at high speeds with thousands of units it runs as fast as your machine allows (the top bar shows the real speed). A late 8-nation game with ~1,800 units costs about 3 ms per simulation step.

## Analytics

**📈 Analytics** (in battle, key **I**, or from the main menu) measures everything:

| Tab | What it shows |
| --- | --- |
| Overview | The built-in analyst's notes (no API needed): forecast leader, momentum, each AI's style, best and worst decisions, what past winners did. Score lines with dashed regression trends projected 20 minutes ahead, growth per minute, R². |
| AI calls & cost | Every live-model call: tokens in and out (as reported by the provider), seconds, failures, cost, cost per call, per game hour and per 1,000 score, and the grade of its decisions. Claude prices are built in; enter other models' prices per million tokens under AI Keys & Models. |
| Decisions | Every important decision (attacks, raids, sieges, age-ups, laws, governments, religion, diplomacy, live-model orders) graded A–F three minutes later. The grade compares the nation's score growth with its rivals', kills with losses, and how the campaign ended. Shown per nation and per kind of decision. |
| Style & build | A radar of eight play-style axes per nation (aggression, economy, technology, defense, expansion, diplomacy, faith, trade) with a style label, and the build order: the minute each age and key building first appeared. |
| Talk | Messages and taunts per nation, threat or friendly tone, latest words. |
| What wins | A ridge regression over all recorded nations from finished battles and tournaments. It shows which habits (villagers at 20 min, army at 30, walls, captures, ages, trade…) go with finishing high, plus win rate and average placement per AI and per live model. |
| AI Analyst | Sends this battle's numbers to a real model of your choice, which writes a full analysis: who wins and why, each AI's logic and mistakes, and a prediction. One call. |

**Analytics API.** The local server keeps finished-match analytics in `data/analytics.json`. Read them with `GET http://localhost:8080/api/analytics`; the game posts to the same address. The command-line tournament adds its records there too. **⬇ Export JSON** downloads the current battle's analytics.

## Graphics

A loading screen shows progress while the world is generated and painted. The **⚙** button switches quality: **Auto** (starts on High and steps down if the frame rate drops), **High**, **Balanced** or **Fast** (lower resolution, no particles, smoke or weather). The top bar shows the frame rate. Buildings are drawn with their materials: cut stone courses, timber planks, half-timbered plaster in the Feudal Age and dressed stone later, tiled or thatched roofs. Building sites go through four stages: staked-out foundation, timber frame, rising walls, roof rafters, with stacks of the logs, stone and gold they cost.

## Replays

Every battle is saved when it ends or when you go back to the menu (the last 12, under **🎞 Replays**). A replay is only the seed, the setup and the orders the live models gave with the moment they arrived, so it plays out exactly the same battle again (checked with checksums). Replays can be downloaded as a small `.json` file and opened again later; the **+5 min** button jumps ahead.

## Tournaments

**🏆 Tournament** plays many battles in the background between the built-in personalities (duels, 4- or 8-nation free-for-alls, random maps) in Web Workers, and keeps an **Elo ladder** in the browser. Each finished battle can be watched as a replay. Live API models are not used in tournaments, so they cost nothing.

From the command line, in parallel threads:

```
node tournament.mjs --games 16 --format duel --size 256 --minutes 60 --threads 4
```
It prints each result and the final ladder and writes `tournament-results.json`.

## Source

```
server.mjs            static server + LLM proxy (no dependencies)
src/config.js         all balance data: units, buildings, techs, ages, nations, governments, ministries, religions, AI personalities, maps
src/map.js            512×512 world generation: elevation, rivers with fords, lakes, mountains, forests, resources, sacred sites
src/path.js           A* on land and water with region labels, no corner cutting, path smoothing; shared routes for groups
src/game.js           simulation: gathering, building, production, combat, morale, wounded, trade, sacred sites, heroes, capture, rebellion, ships, victory
src/player.js         a nation: modifiers, population, society, government, religion
src/ai.js             the built-in general: economy, town planner, research, armies, raids, diplomacy
src/llm.js            live LLM strategists (summary → JSON orders)
src/audio.js          synthesized sound effects and music (Web Audio)
src/replay.js         saving, loading and downloading replays
src/analytics.js      decision grades, styles, build orders, trends, regression, the built-in analyst
src/records.js        cross-match records and model prices (browser + /api/analytics)
src/ui/analytics.js   the analytics screen and the live AI analyst
src/tourney.js        tournament schedule, match runner, Elo; tourney-worker.js runs it in a Web Worker
tournament.mjs        command-line tournament
src/render/*          procedural isometric sprites, cached LOD terrain, depth-sorted renderer
src/ui/*              menu and spectator HUD
```
