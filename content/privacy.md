---
title: Privacy | {{brand}}
description: What {{brand}} collects when you use the calculators, why, who processes it, how long it's kept, and your choices.
layout: prose
---

<!-- DRAFT – pending review. Rewritten 31 Oct 2026 from docs/research/privacy-consent-research.md §3, to match what the site
     collects today: Tier 1 only (our own first-party tracker, src/client/app.ts -> /api/event -> D1). No third-party tags,
     no consent banner, no survey, no email capture. Before any of those ship: update this page (§3 items 1-4, 7) and get the
     30-minute lawyer read. Keep it in step with src/lib/events.ts, src/lib/hits.ts, src/lib/retention.ts and config.features. -->

# Privacy

Effective 31 October 2026. {.muted}

{{brand}} is an independent site of electrical calculators for electricians in the US. This page says what the site collects, why, who handles it and how long it's kept. Questions and requests go to {{supportEmail}}.

## What we collect

- **Pages you visit:** the page, the first page of your visit, whether you arrived with no referrer, from a search engine or from another site (just that, never the address you came from), and how far down the page you scrolled and for how long it was on screen.
- **Calculator use:** which calculator, the numbers and choices you entered in short form (for example "copper 12 AWG, 20 A, 100 ft, single-phase, 120 V"), and the result. Nothing in a calculator asks for your name, email or anything else that identifies you. The only free-text box, a load's name in the generator calculator, never leaves your browser.
- **Clicks:** when a formula or chart stays on your screen for a second, when you press "Copy result", when you open a collapsed section, and whether the page was used at all (a yes or no, never what you pressed or typed).
- **Ad and campaign links:** if you arrive from one of our ads or a tagged link, its campaign tags (`utm_` parameters) and Google's click ID (`gclid`, `gbraid` or `wbraid`).
- **Device and network, for tagged links only:** the type of device (phone, tablet or computer), the browser family (for example Chrome), the referring site's name, and your network operator's number and country (for example "AS7922, US"), so visits from data centres can be told apart from people.
- **IP addresses: none.** We don't store your IP address, whole, truncated or hashed. We don't store your full browser name (user agent) either: our server looks at it when an event arrives only to mark the event "automated" or not.
- **One cookie:** `wc_v`, a first-party cookie holding up to four numbers: how many visits, when you last and first visited, and whether your first visit came from an ad. It contains no identifier and expires after 400 days. Your browser's session storage (cleared when you close the tab) keeps the campaign tags and a random visit code for the current visit, and any events that couldn't be sent yet.

We don't run session replay, we don't record what you type, and we don't build a profile of you. A random visit code ties one visit's events together and to nothing else.

We don't collect survey answers or email addresses. If we add a survey or an emailed report later, this page will say what they collect before they go live.

## Why

- To run the calculators and keep them correct: which inputs people use tells us what to test.
- To measure use and improve pages: which calculators, formulas and charts help, and where people stop.
- To measure our ads: how many ad clicks reach the site, what they cost (from our own Google Ads reports), and whether visitors come back on their own.

## Who gets it

- **Cloudflare** hosts the site and stores these records for us. Cloudflare may also add its cookieless Web Analytics script, which reports aggregate page counts and load speed to Cloudflare and sets no cookies.
- **No one else.** No Google, advertising or third-party analytics tags run on this site, and nothing you do here is sent to Google or any other company. We import our own Google Ads cost and click reports into our records; that flows from Google to us, not the other way.

We don't sell or share personal information, and we don't use it for targeted advertising.

## Global Privacy Control

We honor the Global Privacy Control (GPC) signal. Since no advertising or third-party analytics run here, there's nothing for it to switch off today; if we ever add them, they will never load in a browser that sends GPC, and the site shows a line confirming your signal is honored.

## Your rights

You can ask us to tell you what we hold about you, give you a copy, correct it or delete it, and you can opt out of any sale, sharing or targeted advertising (we do none). Email {{supportEmail}}; we reply within 45 days. We store no identifier, so tell us roughly when you visited and which pages, and we'll find what we can. You can also block or delete the `wc_v` cookie in your browser; the calculators work the same without it.

## How long we keep it

Page, calculator and click records, logged ad-link requests and our own Google Ads reports are deleted after 13 months, by a job that runs once a day.

## Children

The site is for working electricians and isn't directed to children under 13. We don't knowingly collect information from them.

## Advertising

{{#if adsEnabled}}
This site shows ads served by Google AdSense. Google, as a third-party vendor, uses cookies to serve ads on this site based on your visits to this and other sites. You can turn off personalised advertising in [Google's Ads Settings](https://adssettings.google.com) or at the [NAI opt-out page](https://optout.networkadvertising.org/).
{{else}}
This site doesn't show ads and doesn't use advertising cookies. We advertise the site on Google search, but we don't use remarketing (showing our ads to past visitors on other sites).
{{/if}}

## Changes

If this policy changes, the date at the top changes with it and the change is listed here.

- 31 October 2026: first version.
