# GREÑA Live Mobile — Cloudflare native, no Railway

## Purpose

Run the mobile event receiver **separately** from the established GREÑA Live PC engine.
The architecture is:
- **GitHub** — source, CI, Android APK updates
- **Existing Cloudflare Workers + D1** — GREÑA ID, licenses, public community
- **Dedicated Cloudflare Container + Worker (NEW; not deployed)** — mobile Node connectors
- **Android** — display chat and ORIGINAL PC AFTERGLOW alert assets

The previous Railway service and root `railway.toml` are legacy, not used by this path.
**No production deployment or Cloudflare payment was triggered.**

## Why a Container

TikTok LIVE Connector is a Node process that needs persistent upstream networking.
An ordinary short-lived Cloudflare Worker is not a drop-in host for that Node package.
Cloudflare Containers support Node/Linux, but require **Workers Paid** (currently at least
US$5/month plus potential overage). Check plan/billing BEFORE deploying.

The new Container is named `grena-live-mobile-relay-beta` and does NOT touch the
existing `grena-live-licenses` Worker or existing D1 databases.
The Android client learns the trusted relay hostname from the GREÑA ID Worker
only after an explicit `MOBILE_RELAY_URL` deployment. OAuth secrets remain server-side.

## Readiness — platform-specific

| Platform | Normalizes link/events | Real mobile event listener | Authorization | Tested in live |
| --- | --- | --- | --- | --- |
| TikTok | Yes | Node TikTokLiveConnector adapter (code) | Public LIVE / connector signing provider | NO |
| Twitch | Yes | Not yet | Twitch user OAuth / EventSub | NO |
| Kick | Yes | Not yet | Kick app OAuth / signed webhooks | NO |
| YouTube | Yes | Not yet | Google API key or OAuth + liveChatId | NO |
| Starvios | Yes | Not yet | Public chat read / app-specific events | NO |

**Never report "LIVE connected" merely from a saved channel URL or from
`/api/mobile/capabilities`.** A real provider handshake/live confirmation is required.

## Deployment checklist (not executed)

1. Verify that the Cloudflare account is authorized to use paid Containers. Do not
   enable billing automatically.
2. Check separate config in `wrangler.jsonc`, Docker image and test suite.
3. In this directory install packages, then run `npx wrangler deploy`.
   Docker is required for building the image.
4. Verify the new Worker health endpoint, GREÑA ID authentication, app-to-worker
   communication, channel isolation and no leakage between users.
5. In a separate reviewed change, deploy the **read-only**
   `GET /api/license/mobile-relay` GREÑA ID discovery route and configure
   `MOBILE_RELAY_URL` with the new verified HTTPS origin. Do not update D1
   schema or rotate Fish keys.
6. Verify TikTok LIVE using a real channel, then OAuth/webhook setup for
   Twitch/Kick/YouTube, and supported Starvios event connectivity.
7. Only then merge/release an Android APK as a functional mobile version.

## Limits

The beta container `max_instances:1` and Node relay `MAX_ACTIVE:25` are NOT a
400-concurrent-LIVE production implementation; capacity tuning and load testing
are essential. All external platform adapters should only process events in
their owner-scoped authenticated room. Do not feed unofficial webhook requests
into a GREÑA ID event stream without cryptographic signature verification.

**A green CI result means static tests passed, NOT that the platform LIVE is connected.**
