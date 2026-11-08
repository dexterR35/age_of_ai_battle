# Age of AI

Watch autonomous empires build cities, research technology, negotiate with rivals, and fight for control of an isometric world. You choose the matchup and watch it unfold. Both editions can run with built-in AI and no API keys.

| Edition | What to try |
| --- | --- |
| [Battle Arena](arena/README.md) | Run a conquest match with 2–8 empires, compare decisions, and export a JSON report. The React viewer supports scripted exhibitions and server-run API matches. |
| [Dominion](empires/README.md) | Watch a medieval strategy simulation with heroes, government, religion, trade, and diplomacy. This is the edition shown in the screenshots below. |

## Run Battle Arena

With Node.js 22.12 or later, run from this folder:

```sh
cd arena
npm ci
npm run dev
```

Open [localhost:5173](http://127.0.0.1:5173) to watch the opening exhibition. To start your own, select **New match**, choose **Great Frontier** and **4 players**, then click **Launch exhibition**. Open **Stats** to compare the empires or click **Report** to save the match data.

## Run Dominion

With Node.js 18 or later, run from this folder:

```sh
cd empires
node server.mjs
```

Open [localhost:8080](http://localhost:8080), select **New Battle**, and leave **Live** unchecked to use the built-in generals. Once the battle starts, click a nation card to inspect its realm or press **I** to open **Analytics**. If port 8080 is in use, set `PORT` before starting the server (for example, `$env:PORT = '8081'` in PowerShell) and open that port instead.

## Dominion in action

![Valoria's town, farms, and troops during a four-nation Dominion battle](arena/docs/screenshots/dominion/valoria-battlefield.png)

*Valoria during a four-nation battle. The event log records attacks, trade agreements, and religious rites as they happen.*

![Dominion analytics with score histories, projected trends, and momentum for four nations](arena/docs/screenshots/dominion/analytics-overview.png)

*The Analytics overview compares score growth and momentum and projects the next 20 minutes from the recorded trends.*

[More Dominion screenshots](arena/docs/dominion-gallery.md) · [Battle Arena rules](arena/docs/design.md) · [Battle Arena deployment](arena/docs/deployment.md)
