// Pass #114: cloud and hosting networks, by autonomous system number (request.cf.asn). A tagged landing from one of these is
// marked datacenter = 1 on its ad_hits row: a person rarely browses from a server, a crawler or a click-fraud farm often does.
// Kept short on purpose and in this one file. Caveat: Cloudflare (13335) is also the exit network of Cloudflare WARP and part
// of iCloud Private Relay, so some real visitors (Safari with Private Relay on) carry it; /admin/clicks shows the verdict
// beside the rest of the trace, so a real visit from 13335 is still visible.

export const DATACENTER_ASNS: ReadonlyMap<number, string> = new Map([
  [15169, "Google"],
  [396982, "Google Cloud"],
  [16509, "Amazon AWS"],
  [14618, "Amazon AWS"],
  [8075, "Microsoft"],
  [14061, "DigitalOcean"],
  [16276, "OVH"],
  [24940, "Hetzner"],
  [63949, "Linode (Akamai)"],
  [31898, "Oracle Cloud"],
  [45102, "Alibaba Cloud"],
  [132203, "Tencent Cloud"],
  [13335, "Cloudflare"],
]);

export const isDatacenterAsn = (asn: number | null | undefined): boolean => typeof asn === "number" && DATACENTER_ASNS.has(asn);
