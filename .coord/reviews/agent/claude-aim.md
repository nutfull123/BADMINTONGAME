# Review of agent/claude-aim (racket aid: FH/BH marker, shuttle target) — reviewer: Sonnet

## Standards
- src/render/index.ts:719-741 - JUDGEMENT - small 6-element array per frame while a target exists
- HARD: none (sim pure, no new deps, render allocates once, textures disposed)

## Spec
- forehand sign correct for near and far (sgn*(head.x - pos.x) >= 0 == rx >= 0)
- target uses the same racket plane as autoRacket; null when nothing incoming
- src/sim/assist.ts:53 - JUDGEMENT - onTarget ignores the dive radius bonus and lunge reach (conservative)
- view.aim optional; render hides everything when omitted

## Checks
npx vitest run -> pass (148)
npx tsc --noEmit -> pass
npx vite build -> pass

APPROVE 22fefc1
