---
title: Privacy | {{brand}}
description: What {{brand}} records when you use the calculators, why, who processes it, and how to have it deleted.
layout: prose
---

<!-- DRAFT – pending review. Ported from dnsmailcheck's /privacy (29 Oct 2026 version): the page-visit, cookie, event,
     tagged-link, Google Ads and Cloudflare Web Analytics sections, rebranded and rewritten for calculators. Removed because
     this site has none of it: DNS checks, the SMTP test, accounts and Sign in with Google, report emails and tips, the
     contact and quote forms, purchases and subscriptions (Stripe), Resend, OVHcloud, rate limits, Watch and DMARC reports.
     Needs the privacy research (research-queue.md item 6) and a review before any survey, email capture or embed ships. -->

# Privacy

Last updated 31 October 2026. {.muted}

{{brand}} is an independent site of electrical calculators. This page explains what the site records when you use it and why. Questions or deletion requests go to {{supportEmail}}.

## When you use a calculator

The calculators run in your browser. When a result settles (you stop typing for a moment), the page sends us which calculator it was, a short summary of the numbers and choices you entered (for example "copper 12 AWG, 20 A, 100 ft, single-phase, 120 V") and the headline result. We also record when a formula or chart section stayed on your screen for a second, and when you press "Copy result". We use this to see which calculators and inputs people use, so we can check and improve them. Nothing you type here identifies you, and there's no field for a name or an email address.

## Page visits and the visit cookie

When a page loads, the site's own script records the page, the first page of your visit (your landing page), any campaign tags in the link (`utm_` parameters, and Google's click ID: `gclid`, or `gbraid` or `wbraid` from some Apple devices), whether you arrived with no referrer, from a search engine or from another site (just that, never the address you came from), your visit number, and whether this is your first page of the day. We record no IP addresses, no full browser name (user agent), and no fingerprint. Links with campaign tags or an ad click ID get a little more, described under "Links with campaign tags" below.

To keep automated traffic (search engine crawlers, monitoring services, scripts) out of our counts, our server looks at the browser name your browser sends (its user agent) when each event arrives and stores only a yes-or-no "automated" mark. The browser name itself is never stored.

The visit number comes from one first-party cookie, `wc_v`. It holds up to four numbers: how many times you've visited, when you last did, when you first did, and whether that first visit came from an ad link, and if so whether it was a Google Ads link (and, once you've come back on your own, that the return was counted). It contains no identifier, isn't shared with anyone, and expires after 400 days. Its only purposes are to count visitors once a day and to tell whether people come back, including how many days after their first visit, and whether people who first came from an ad return on their own within 14 days.

Campaign tags from the link you arrived on, your landing page and how you arrived are kept in your browser's session storage (`wc_attr`) until you close the tab, so later events can be counted against the same campaign and landing page. The same entry holds a random visit code, drawn again on the first page of each visit, so we can count how far a visit gets (for example, how many visits ran a calculator). A second entry, `wc_calc`, notes that you've run a calculator during this visit.

## What we count as you use a page

Besides the calculator events above, the site's own script records a few more events. Each one carries the page, your landing page, any campaign tags and how you arrived, and nothing else about you:

- **Opening a section:** when you open a collapsed section, which section it was.
- **Scrolling, time on page and leaving:** how far down a page you scrolled (25, 50, 75 or 100%), how long the page was open in a visible tab, and when you left it and how (another page here, or closing or reloading it).
- **Whether the page was used:** yes or no, whether anyone pressed, tapped, typed or scrolled with a wheel on the page, and how long after it opened the first of those came (never what was pressed or typed).
- **Events that got through:** each event of a page view is numbered (1, 2, 3...), and the last one says how many the page tried to send, so we can see how many go missing. An event that couldn't be sent waits in your browser's session storage (`wc_q`, at most 50, until you close the tab) and is sent again with the next one.

These events hold no IP address and no cookie value. The events of one visit carry that visit's random code, which links them to each other and to nothing else: nothing in them links one visit to another.

## Links with campaign tags

When a page is opened from a link with campaign tags (`utm_` parameters) or an ad click ID, our server records that page request on its own, before the page's script runs: the page, the time, the tags and click ID, and a random hit ID drawn for that one page load. The hit ID goes into that page, and the page sends it back with its own events, so we can tell how far the page got: whether your browser displayed it, whether its first small script ran, whether the main script ran, how long the page was visible, and whether it was used (yes or no, as above). The page and its events stay tied to that hit ID and to nothing else.

From that request we also keep a few plain facts, not the request itself:

- the request-type headers your browser sends with every page request (whether it was a normal visit, a link opened from another site, or a preload the browser made ahead of time);
- the referring site's name only (for example www.google.com), never the address of the page you came from;
- your network operator's number and country (for example "AS7922, US"), as our hosting provider reports them, so visits from data centres can be told apart from people;
- the type of device (phone, tablet or computer) and the browser family (for example Chrome or Safari).

We still never record your IP address or your full browser name (user agent). These records are kept 25 months, like the events above.

## Google Ads

If you arrive by clicking one of our ads on Google, the link carries Google's click ID (`gclid`, or `gbraid` or `wbraid`), which we record with the events above, and our server logs the page request as described under "Links with campaign tags", so we can check our click counts against Google's. We import our own Google Ads click and cost reports (which click IDs, keywords and campaigns Google charged us for, and what they cost), to check them against the visits that arrived; they hold no personal data about you. We don't send anything about your visit to Google.

## Cloudflare Web Analytics

We may also use Cloudflare Web Analytics, which Cloudflare adds to each page as a small script. It's cookieless: it sets no cookies and stores nothing in your browser. It gives us aggregate page analytics only, such as page views, referring sites, countries, browser types and page load speed, and doesn't build a profile of you or follow you across other sites. Cloudflare explains it in its [Web Analytics documentation](https://developers.cloudflare.com/web-analytics/).

## Who processes data for us

- **Cloudflare** hosts the site and runs its code and database, and provides the cookieless Web Analytics described above.

We don't sell or rent your data, and we don't share it with anyone else except where the law requires it.

## Advertising

{{#if adsEnabled}}
This site shows ads served by Google AdSense. Google, as a third-party vendor, uses cookies to serve ads on this site. Google's use of advertising cookies lets it and its partners show you ads based on your visits to this site and other sites on the internet.

You can turn off personalised advertising from Google in [Google's Ads Settings](https://adssettings.google.com). You can also opt out of some other third-party vendors' use of cookies for personalised advertising at [www.aboutads.info](https://www.aboutads.info/choices/).
{{else}}
This site doesn't show ads and doesn't use advertising cookies.
{{/if}}

## How long we keep it

Records are deleted automatically, by a job that runs once a day, when they reach these ages:

- **Page visits, calculator events and the events described above:** 25 months.
- **Logged page requests from tagged links and our own Google Ads reports:** 25 months.

To have what we hold about you deleted sooner, or to get a copy of it, email {{supportEmail}}. Since we store no identifier, tell us roughly when you visited and which pages, and we'll find what we can.

## Your choices

You can block or delete the `wc_v` cookie in your browser settings; the calculators work the same without it.

## Changes

If this policy changes, the date at the top of the page changes with it.
