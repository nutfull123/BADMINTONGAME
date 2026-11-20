# Official BWF Doubles Rules Specification (Laws of Badminton, Statutes Section 4.1)

> **Primary Source:** Badminton World Federation (BWF) Statutes, **Section 4.1 — Laws of Badminton** (`https://corporate.bwfbadminton.com/statutes/`). All rules below apply identically across **Men's Doubles, Women's Doubles, and Mixed Doubles**.

---

## 1. Court Dimensions for Doubles (Law 1 & Diagram A)

Under **Law 1 (Court and Court Equipment)**:
- **Law 1.1:** *"The court shall be a rectangle marked out with lines 40 mm wide as shown in Diagram A."* (`0.04 m` line width).
- **Law 1.4:** *"All lines form part of the area which they define."* (A shuttle touching the outer edge of a boundary line is **IN**).

### Exact Coordinate & Distance Table (Metres from Net `z = 0` and Centre Line `x = 0`)

| Court Line / Boundary | Full Dimension | Distance from Net (`|z|`) | Distance from Centre Line (`|x|`) | Role in Doubles |
|---|---|---|---|---|
| **Full Court Length** (Back boundary line to back boundary line, outer edges) | `13.40 m` | **`6.70 m`** | Spans `-3.05 m` to `+3.05 m` | **In-play back boundary during a doubles rally** (after the serve is returned). |
| **Doubles Full Width** (Outer side lines for doubles, outer edges) | `6.10 m` | Spans `-6.70 m` to `+6.70 m` | **`3.05 m`** | **Side boundary for both service and rally in doubles.** (0.46 m wider on each side than singles `2.59 m`). |
| **Singles Side Lines** (Inner side lines, outer edges) | `5.18 m` | Spans `-6.70 m` to `+6.70 m` | `2.59 m` | Ignored in doubles (used only in singles). |
| **Short Service Line** (Nearest edge to the net) | `6.10 m` wide | **`1.98 m`** | Spans `-3.05 m` to `+3.05 m` | Front boundary of the service box (`|z| >= 1.98 m`). |
| **Long Service Line for Doubles** (0.76 m inside the back boundary line; outer edge from net) | `6.10 m` wide | **`5.94 m`** (`6.70 - 0.76`) | Spans `-3.05 m` to `+3.05 m` | **Back boundary of the service box in doubles** (`|z| <= 5.94 m` on serve only; once the serve is returned, the full `6.70 m` court length is in). |
| **Centre Line** (40 mm wide, equally dividing the right and left service courts) | `3.96 m` long per half (or `4.72 m` to back boundary) | From `1.98 m` to `6.70 m` | **`0.00 m`** (half-width `0.02 m` is shared by both right and left service courts) | Divides the **Right Service Court** and **Left Service Court**; a serve landing on any part of the 40 mm centre line is **IN** for both boxes. |
| **Net Height** (Law 1.10) | `6.10 m` wide (posts on the doubles side lines `|x| = 3.05 m`) | `0.00 m` | `0.00 m` to `3.05 m` | **`1.524 m`** at the centre (`x = 0`), **`1.55 m`** over the side lines for doubles (`|x| = 3.05 m`). |

### Doubles Bounds Check Formulas for `src/physics/`
- **Doubles Rally In-Bounds (`isInDoubles(at, receiverSide)`):**
  - `depth = receiverSide === 'near' ? at.z : -at.z`
  - `0 <= depth && depth <= 6.70 && Math.abs(at.x) <= 3.05`
- **Doubles Service Box In-Bounds (`isInDoublesServiceBox(at, receiverSide, court)`):**
  - `depth = receiverSide === 'near' ? at.z : -at.z`
  - `1.98 <= depth && depth <= 5.94 && Math.abs(at.x) <= 3.05` (short and fat compared to singles `1.98..6.70` × `2.59`)
  - `rightX = receiverSide === 'near' ? at.x : -at.x`
  - `court === 'right' ? rightX >= -0.02 : rightX <= 0.02` (centre line 40 mm belongs to both boxes)

---

## 2. Doubles Service and Receiving Rules (Law 9 & Law 11)

Under **Law 11 (Doubles)** of BWF Statutes Section 4.1:

- **11.1 Serving and receiving courts:**
  - **11.1.1 (Even Score → Right Court):** *"A player of the serving side shall serve from the right service court when the serving side has not scored or has scored an even number of points in that game."* (`0, 2, 4, ...` → `'right'`).
  - **11.1.2 (Odd Score → Left Court):** *"A player of the serving side shall serve from the left service court when the serving side has scored an odd number of points in that game."* (`1, 3, 5, ...` → `'left'`).
  - **11.1.3 (Receiving Side Court Retention):** *"The player of the receiving side who served last shall stay in the same service court from where he served last. The reverse pattern shall apply to the receiver's partner."*
  - **11.1.4 (Diagonal Receiver):** *"The player of the receiving side standing in the diagonally opposite service court to the server shall be the receiver."*
  - **11.1.5 (When Partners Swap Courts):** *"The players shall not change their respective service courts until they win a point when their side is serving."*
  - **11.1.6 (Score Governs Service Court):** *"Service in any turn of serving shall be delivered from the service court corresponding to the serving side's score, except as provided in Law 12."*
- **11.3 Scoring and serving:**
  - **11.3.1 (Serving Side Wins Rally):** *"If the serving side wins a rally (Law 7.3), the serving side shall score a point. The server shall then serve again from the alternate service court."*
    - **Programmer summary:** The **same player continues serving**; the two partners on the serving side **swap their right/left courts**; the two partners on the receiving side **do NOT swap courts** (so the other receiving partner is now diagonally opposite and becomes the receiver).
  - **11.3.2 (Receiving Side Wins Rally):** *"If the receiving side wins a rally (Law 7.3), the receiving side shall score a point. The receiving side shall then become the new serving side."*
    - **Programmer summary:** **Neither side swaps courts.** The new serving side checks its **new score** (after adding the point just won): if that new score is **even**, whichever partner of the new serving side is currently standing in their **right** court serves; if **odd**, whichever partner is currently standing in their **left** court serves.
- **11.4 Sequence of serving:**
  - *"In any game, the right to serve shall pass consecutively:*
    - *11.4.1 from the initial server who started the game from the right service court,*
    - *11.4.2 to the partner of the initial receiver,*
    - *11.4.3 to the partner of the initial server,*
    - *11.4.4 to the initial receiver,*
    - *11.4.5 to the initial server and so on."*
  - *(Note: Under rally-point scoring in force since 2006, each side has only **one service hand per turn**—there is NO "second server" while failing to win a point; service immediately passes to the opponents when a rally is lost, and because neither side swaps courts on a side-out while the score increments by 1, Law 11.1.5 + Law 11.1.1/11.1.2 automatically produce the sequence in Law 11.4).*
- **11.5 & 11.6 Turn restrictions and next-game choice:**
  - **11.5:** *"No player shall serve out of turn, receive out of turn, or receive two consecutive services in the same game, except as provided in Law 12."*
  - **11.6:** *"Either player of the winning side may serve first in the next game, and either player of the losing side may receive first in the next game."*
- **Only the Receiver May Return the Serve (Law 9.5 & Law 13.2.3):**
  - **Law 9.5:** *"In doubles, during the delivery of service (Law 9.2, 9.3), the partners may take up any positions within their respective courts, which do not unsight the opposing server or receiver."*
  - **Law 13.2.3:** *"It shall be a 'fault': if, in service, the shuttle is hit by the receiver's partner."* (Strictly only the designated diagonal receiver may touch the served shuttle; the receiver's partner hitting or being touched by the serve is an immediate fault against the receiving side).

---

## 3. Order of Play After the Serve is Returned & Faults (Law 11.2 & Law 13.3)

- **Law 11.2 (Order of play and position on court):**
  - *"After the service is returned, in a rally, the shuttle may be hit by either player of the serving side and either player of the receiving side alternately, from any position on that player's side of the net, until the shuttle ceases to be in play (Law 15)."*
  - **Programmer summary:** Once the receiver makes legal contact returning the serve, service-box restrictions disappear: **either partner** on a team may hit any subsequent shot in the rally, and partners may move freely anywhere on their half of the court.
- **Same-Side / Double-Hit Faults (Law 13.3):**
  - **Law 13.3.7:** It is a fault if, in play, the shuttle *"is hit twice in succession by the same player. However, a shuttle hitting the head and the stringed area of the racket in one stroke shall not be a 'fault'."*
  - **Law 13.3.8:** It is a fault if, in play, the shuttle *"is hit by a player and the player's partner successively."*
  - **Law 13.3.4:** It is a fault if, in play, the shuttle *"touches the person or dress of a player."*
  - **Programmer summary:** Exactly one hit per side crossing is allowed (`lastHitterSide === hittingPlayer.side` is a `'fault'`, regardless of whether the second hit on that side is by the same player or their partner).

---

## 4. Service Court Errors (Law 12)

Under **Law 12 (Service Court Errors)**:
- **12.1:** *"A service court error has been made when a player:*
  - *12.1.1 has served or received out of turn; or*
  - *12.1.2 has served or received from the wrong service court."*
- **12.2:** *"If a service court error is discovered, the error shall be corrected and the existing score shall stand."*
- *(Note on video-game implementation: because the game engine places players in their assigned courts via `courtAssignment` on `MatchState` at the start of every point and locks serve input to the designated `server` and serve-return hit detection to the designated `receiver` (faulting if the receiver's partner hits the serve per Law 13.2.3), Law 12 service-court placement errors cannot occur accidentally during automated point transitions).*

---

## 5. Differences Between 3×21 and 3×15 Scoring in Doubles (Law 7, Law 8, Law 16.2)

There is **zero difference between Singles and Doubles** in how the **3×15** vs. **3×21** scoring formats operate (`FORMAT_3X15` and `FORMAT_3X21` in `src/rules/` apply identically to doubles):

| Rule Element | 3×15 Format (Adopted BWF AGM Apr 25, 2026; effective Jan 4, 2027) | 3×21 Format (Retained Approved Alternate) | Doubles vs. Singles Difference? |
|---|---|---|---|
| **Games per Match (Law 7.1)** | Best of 3 games (`gamesToWin: 2`) | Best of 3 games (`gamesToWin: 2`) | None |
| **Points to Win a Game (Law 7.2)** | `15` points | `21` points | None |
| **Deuce / Win-by-2 (Law 7.4)** | At `14–all`, first side to gain a 2-point lead wins | At `20–all`, first side to gain a 2-point lead wins | None |
| **Hard Cap (Law 7.4)** | At `20–all`, first side to score the `21st` point wins | At `29–all`, first side to score the `30th` point wins | None |
| **Mid-Game Interval (Law 16.2.1)** | Up to 60 s when the leading score first reaches **`8` points** | Up to 60 s when the leading score first reaches **`11` points** | None |
| **Between-Game Interval (Law 16.2.2)** | Up to 120 s between games 1–2 and 2–3 | Up to 120 s between games 1–2 and 2–3 | None |
| **Change of Ends (Law 8.1)** | End of Game 1, end of Game 2 (if Game 3 played), and in Game 3 when the leading score first reaches **`8` points** | End of Game 1, end of Game 2, and in Game 3 when the leading score first reaches **`11` points** | None |
| **First Server of Next Game (Law 7.5 & 11.6)** | Winning side serves first; in doubles, **either partner** of the winning side may serve first (from the right court at `0–0`) and **either partner** of the losing side may receive first in the right court. | Same | In doubles, Law 11.6 allows teams to choose which partner starts in the right court at `0–0` of a new game (in code, default to keeping or resetting `[right, left]` deterministically unless chosen). |

---

## 6. Worked Example: First 8 Rallies of a Doubles Game (Unit-Test Ready)

### Initial Setup (`0–0`)
- **Near Pair:** `N1` starts in Near **Right** court, `N2` starts in Near **Left** court.
- **Far Pair:** `F1` starts in Far **Right** court, `F2` starts in Far **Left** court.
- **First Serving Side:** `near` (`0–0`, even → serves from **Right** court).

| Rally # | Score Before (`Near–Far`) | Near Courts (`Right / Left`) | Far Courts (`Right / Left`) | Server | Service Court | Receiver | Rally Winner | Score After (`Near–Far`) | State Transition Applied (Law 11.1 & 11.3) |
|---|---|---|---|---|---|---|---|---|---|
| **1** | `0–0` | `N1` (R) / `N2` (L) | `F1` (R) / `F2` (L) | **`N1`** | `'right'` (Near 0 is even) | **`F1`** | **`near`** | **`1–0`** | Serving side (`near`) won: **`N1` and `N2` swap courts** (`N1` → Left, `N2` → Right). Far does NOT swap. `N1` keeps serve. |
| **2** | `1–0` | `N2` (R) / `N1` (L) | `F1` (R) / `F2` (L) | **`N1`** | `'left'` (Near 1 is odd) | **`F2`** | **`far`** | **`1–1`** | Receiving side (`far`) won: **NO ONE swaps courts.** `far` becomes serving side; Far's new score is `1` (odd → Left court), so **`F2`** (standing in Far Left) serves next. |
| **3** | `1–1` | `N2` (R) / `N1` (L) | `F1` (R) / `F2` (L) | **`F2`** | `'left'` (Far 1 is odd) | **`N1`** | **`far`** | **`1–2`** | Serving side (`far`) won: **`F1` and `F2` swap courts** (`F2` → Right, `F1` → Left). Near does NOT swap. `F2` keeps serve. |
| **4** | `1–2` | `N2` (R) / `N1` (L) | `F2` (R) / `F1` (L) | **`F2`** | `'right'` (Far 2 is even) | **`N2`** | **`far`** | **`1–3`** | Serving side (`far`) won: **`F1` and `F2` swap courts** (`F2` → Left, `F1` → Right). Near does NOT swap. `F2` keeps serve. |
| **5** | `1–3` | `N2` (R) / `N1` (L) | `F1` (R) / `F2` (L) | **`F2`** | `'left'` (Far 3 is odd) | **`N1`** | **`near`** | **`2–3`** | Receiving side (`near`) won: **NO ONE swaps courts.** `near` becomes serving side; Near's new score is `2` (even → Right court), so **`N2`** (standing in Near Right) serves next. |
| **6** | `2–3` | `N2` (R) / `N1` (L) | `F1` (R) / `F2` (L) | **`N2`** | `'right'` (Near 2 is even) | **`F1`** | **`near`** | **`3–3`** | Serving side (`near`) won: **`N1` and `N2` swap courts** (`N2` → Left, `N1` → Right). Far does NOT swap. `N2` keeps serve. |
| **7** | `3–3` | `N1` (R) / `N2` (L) | `F1` (R) / `F2` (L) | **`N2`** | `'left'` (Near 3 is odd) | **`F2`** | **`far`** | **`3–4`** | Receiving side (`far`) won: **NO ONE swaps courts.** `far` becomes serving side; Far's new score is `4` (even → Right court), so **`F1`** (standing in Far Right) serves next. |
| **8** | `3–4` | `N1` (R) / `N2` (L) | `F1` (R) / `F2` (L) | **`F1`** | `'right'` (Far 4 is even) | **`N1`** | **`near`** | **`4–4`** | Receiving side (`near`) won: **NO ONE swaps courts.** `near` becomes serving side; Near's new score is `4` (even → Right court), so **`N1`** (standing in Near Right) serves Rally 9 from `'right'` to `F1`. |

*(Notice how the server sequence across the 4 side-outs automatically followed Law 11.4: **`N1`** [Initial Server] → **`F2`** [Partner of Initial Receiver] → **`N2`** [Partner of Initial Server] → **`F1`** [Initial Receiver] → back to **`N1`**!)*

### Pure State-Machine Invariant for `src/rules/`
To implement Doubles in `src/rules/` cleanly:
1. Store for each side (`near` and `far`) which partner (`0` or `1`) is currently in the **right** court and which is in the **left** court: `courts: { near: { right: 0 | 1; left: 0 | 1 }; far: { right: 0 | 1; left: 0 | 1 } }` (initially `{ right: 0, left: 1 }` for both sides at `0–0`).
2. At any point, `serviceCourt = score[server] % 2 === 0 ? 'right' : 'left'`.
3. The active **server player** is always `courts[server][serviceCourt]`, and the active **receiver player** is always `courts[other(server)][serviceCourt]`.
4. When `rallyWinner === state.server`: increment `score[rallyWinner]`, **swap `courts[rallyWinner].right` and `courts[rallyWinner].left`**, keep `server = rallyWinner`.
5. When `rallyWinner !== state.server`: increment `score[rallyWinner]`, **do NOT swap any courts**, set `server = rallyWinner`.

---

## Sources
- `https://corporate.bwfbadminton.com/statutes/` — BWF Statutes, Section 4.1: *Laws of Badminton* (Law 1 Court and Court Equipment, Law 7 Scoring System, Law 8 Change of Ends, Law 9 Service, Law 11 Doubles, Law 12 Service Court Errors, Law 13 Faults, Law 16.2 Intervals).
