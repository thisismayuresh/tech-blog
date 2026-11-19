---
title: "One Address, Many Places: GeoDNS, Unicast and Anycast Explained"
date: 2026-11-04
cover: assets/geodns.jpeg
description: How traffic finds the right server worldwide — GeoDNS, unicast, anycast, and the latency math behind putting services closer to users.
tags: networking, dns, system-design
---

# One Address, Many Places: GeoDNS, Unicast and Anycast Explained

*A backend engineer’s guide to how traffic finds the right server, and what goes wrong along the way.*

## The problem: physics doesn’t negotiate

Every “go global” conversation starts in the same place. You run a service in one region, your users are scattered across the planet, and the speed of light is not going to give you a discount.

Light in optical fiber travels at roughly two thirds of its speed in a vacuum, which works out to about 5 milliseconds per 1,000 km, one way. A user in Mumbai talking to a server in Virginia is around 13,000 km away as the crow flies. That is about 65 ms each way and 130 ms for a round trip, and that number is a hard floor. Cables don’t follow great-circle paths and every router adds a little delay of its own, so what you actually measure is closer to 200 ms.

Now think about what a brand-new HTTPS request does: a DNS lookup, a TCP handshake, a TLS handshake, and only then the request itself. That is several round trips before the first byte of your response arrives. At 200 ms each, most of a second is gone before your application has had a chance to be fast. No amount of query tuning gets that back. The only real fix is to put a copy of the service closer to the user.

That is where the interesting problem begins. Once you have copies in Mumbai, Frankfurt, Virginia and São Paulo, **how does a client end up at the right one?** There are really only three families of answer:

- **Unicast, with the choice made explicitly.** Every server has its own address, and either the client or your own code picks one (`eu.api.example.com` versus `us.api.example.com`).
- **GeoDNS.** Every server still has its own address, but DNS answers the question “where is api.example.com?” differently depending on who is asking.
- **Anycast.** Every server announces the *same* address, and the Internet’s routing system delivers each packet to whichever copy it considers closest.

One distinction will save you a lot of confusion later: GeoDNS and anycast do not operate at the same layer. GeoDNS makes its choice when a name is resolved, before any connection exists. Anycast makes its choice while packets are in flight, inside routers, with no involvement from DNS at all. They solve overlapping problems with completely different machinery, and the best systems usually use both.

## What does it mean for a server to “have” an IP address?

An IP address is just a label attached to a network interface. On a Linux machine, giving a server an address is a one-line command:

```
ip addr add 203.0.113.10/32 dev eth0
```

In the cloud you would attach an elastic IP or let DHCP do it, but the idea is the same. The catch is that a label on an interface does not make the machine reachable. Reachability is a property of *routing*. The address belongs to a block, say 203.0.113.0/24, and some network (an autonomous system, or AS) announces that block to its neighbors using BGP, the Border Gateway Protocol. Those neighbors pass the announcement along to theirs, and eventually routers all over the Internet carry an entry that says, in effect, “for anything in 203.0.113.0/24, forward toward this next hop.”

Routers make that decision with a rule called longest-prefix match: look at the destination address, find the most specific prefix in the table that covers it, and send the packet toward that prefix’s next hop. Notice what is missing. No router checks how many machines are behind the address, or whether it is one machine or fifty. A router only knows *next hop*. Whatever sits at the end of the chain receives the packet.

That blind spot is the foundation of everything that follows, so hold on to it.

## Unicast: one address, one destination

Unicast is the default model: one address identifies one interface on one machine in one place. Your laptop talking to a web server is unicast. So is almost every SSH session, database connection and API call you have ever made.

Its strengths are the strengths of simplicity. Connection state lives in exactly one place. A traceroute shows you the real path. When something breaks there is one machine to look at. For an internal service, or a product whose users are concentrated near one region, nothing more is needed.

The weaknesses appear as you spread out geographically. Distance, as we saw, sets a latency floor you cannot engineer away. The address is tied to the machine’s location, so if that site goes dark, the address goes dark with it. And everything, including attack traffic, converges on one place.

It is also worth remembering that unicast never goes away. GeoDNS hands out unicast addresses. Each anycast site also keeps ordinary unicast addresses for management and for talking to its neighbors. The techniques below sit on top of unicast; they don’t replace it.

## GeoDNS: the receptionist who reads your caller ID

Picture the receptionist at a company with offices on four continents. When you call, she notices where you are calling from and says, “You’ll want our Frankfurt office, here’s that number.” Every office has its own distinct number. All the cleverness is in who answers the question. That is GeoDNS: ordinary unicast addresses, handed out by a DNS server that tailors its answer to whoever is asking.

### Where the decision is made

When a browser needs `api.example.com`, the operating system’s stub resolver asks a *recursive resolver*, which is either your ISP’s or a public one such as 8.8.8.8. The recursive resolver walks the DNS hierarchy on your behalf, from the root to the top-level domain to the *authoritative* nameserver for example.com, unless it already has the answer cached. That last server holds the truth about your domain, and it is the one that decides what to return.

```
Browser --> Stub resolver (OS) --> Recursive resolver (ISP, 8.8.8.8, ...)
                                            |
                                            v
                                 Authoritative nameserver
                                 (GeoDNS logic lives here)
```

An ordinary authoritative server hands the same answer to everyone. A GeoDNS server inspects the query and picks from a set of answers. You can picture the policy like this:

```
api.example.com
  asker in India / South Asia   -->  203.0.113.20   (Mumbai)
  asker in Europe / Africa      -->  198.51.100.20  (Frankfurt)
  asker in North America        -->  192.0.2.20     (Virginia)
  anyone else                   -->  192.0.2.20     (default)

  ...with every branch filtered by health checks first.
```

### What it looks at

The server usually combines a few signals. A **GeoIP database** maps IP ranges to countries, regions and sometimes cities. **Latency maps**, which some providers build by continuously measuring round-trip times from networks around the world to each of your endpoints, let it choose by measured speed instead of map distance. **Health checks** remove endpoints that are down. **Weights and capacity limits** cap how much traffic any one site receives. The output is a plain A or AAAA record. The client has no idea anything special happened, which is a large part of the appeal: it works with every device and every library on Earth.

### The catch: the server never sees the user

The authoritative server sees the IP address of whoever *sent it the query*. That is the recursive resolver, not the person at the keyboard. When user and resolver sit in the same city, as with a typical ISP resolver, there is no problem. But take a user in Thailand who has chosen a public resolver whose nearest site is in Singapore, or worse, one whose queries come out of the United States. The authoritative server is now making a decision about the wrong place.

The industry’s patch is **EDNS Client Subnet (ECS)**, specified in RFC 7871. A resolver that supports it attaches a truncated version of the client’s address to the query it sends upstream, typically the first 24 bits of an IPv4 address or the first 56 bits of an IPv6 address. The authoritative server can then geolocate the user’s neighborhood instead of the resolver. Google Public DNS sends ECS, and so do many ISP resolvers.

ECS comes with real costs, and some resolvers decline to use it. It reveals part of the user’s address to every authoritative server in the chain, which is a privacy trade-off. Cloudflare’s 1.1.1.1 does not send it, and says so in its documentation, citing privacy. It also hurts caching: the resolver can no longer reuse one answer for everybody and has to cache a separate answer per client subnet, so hit rates fall and load on the authoritative side rises. Where ECS is absent, you fall back to the resolver’s location, which is how users of privacy-focused resolvers sometimes land on a mediocre endpoint. The disagreement has been loud enough that at least one well-known archive site returned deliberately bad answers to Cloudflare’s resolver over it.

### What providers actually offer

Amazon Route 53 is a handy reference because it splits the idea into separate policies. **Geolocation** routing maps the user’s country, continent or US state to a record you choose, which is explicit and predictable and suits compliance and localized content. **Latency** routing sends users to the AWS Region with the lowest measured latency, which is usually what you want for pure performance. **Geoproximity** routing uses distance to your resources plus a bias setting that grows or shrinks a region’s catchment, and it requires Route 53 Traffic Flow. Failover and weighted routing round out the set, and the policies combine: a common recipe is latency routing to pick a region, with a failover pair inside each region.

Two details trip people up. Geolocation needs a default record, because locations you haven’t mapped otherwise get no answer at all. And health-aware routing only works if you attach health checks; without one, the service will keep returning an endpoint that is dead. Geolocation also answers “where is this user?” rather than “what is the next-best place if that one is down?”, so design your fallback records deliberately instead of assuming the nearest neighbor will take over.

### TTL: the dial between agility and load

Every DNS answer carries a time-to-live telling resolvers how long they may cache it. Short TTLs, say 30 to 60 seconds, let you steer and fail over quickly, at the price of more queries and more cache misses, each of which costs a user a lookup. Long TTLs are cheap and stable but leave users stuck on a dead endpoint for as long as the cache holds. Whatever you pick, treat it as a lower bound on failover time, not an upper one. Some resolvers clamp TTLs, some applications cache lookups on their own, and long-lived connection pools never re-resolve at all.

### What goes wrong with GeoDNS

- **Resolver location isn’t user location.** ECS reduces the gap but doesn’t close it.
- **GeoIP is a database of educated guesses.** Country-level answers are usually good and city-level ones are shaky. VPN users are placed at their exit node, and mobile carriers can funnel users through gateways far from where they actually are.
- **Close on the map isn’t close on the network.** Geographic distance is a proxy, while real paths depend on cables and peering. Latency-based policies exist precisely because of this.
- **Failover is bounded by caches.** See the TTL discussion above.
- **The granularity is coarse and lumpy.** One big ISP resolver can stand in for millions of users who all receive the same answer. You can’t spread them smoothly, so capacity planning gets uneven.
- **Your DNS has to be fast and available everywhere.** A GeoDNS setup is only as good as the authoritative service behind it, which is why serious DNS providers run their nameservers on anycast, our next topic.

## Anycast: one address, many places

### The idea

Think of a toll-free number for a national pizza chain. Everyone dials the same digits, yet the phone network connects each caller to a nearby call center. Callers don’t choose, and the chain doesn’t hand out different numbers. Anycast does this for IP addresses: one address announced from many locations, with the routing system delivering each packet to whichever location is “closest” to the sender. The concept dates back to RFC 1546 in 1993, and the guidance for operating it today lives in RFC 4786.

Remember the blind spot from earlier: a router forwards toward a prefix and never checks how many machines sit behind it. Anycast simply announces the *same* prefix from several places and lets every router on the Internet pick one.

```
                      Internet routing (BGP)
   User, Mumbai   -->                          --> Site: Mumbai      192.0.2.53
   User, Berlin   -->   one prefix, many       --> Site: Frankfurt   192.0.2.53
   User, Dallas   -->   announcements          --> Site: Virginia    192.0.2.53
```

### How one IP ends up on many servers

There is no special protocol for “sharing” an address. It is ordinary configuration, repeated, plus BGP.

**1. Get a prefix you can announce.** By long-standing convention the global routing table does not accept IPv4 prefixes longer than /24 (256 addresses) or IPv6 prefixes longer than /48, so those are the smallest blocks you can announce to the world. You either hold your own address space and an AS number, or you rent both from a provider.

**2. Put the same address on every server.** On each machine, in each site, the service address sits on the loopback interface:

```
ip addr add 192.0.2.53/32 dev lo
```

Operating systems don’t object. An address is just a label, and two machines only collide if they share a network segment. Anycast sites are separated by routers, so they never meet.

**3. Announce the address with BGP.** A routing daemon (BIRD, FRR, ExaBGP, or the router itself) opens a BGP session with the site’s router and says, in effect, “192.0.2.53 is reachable through me.” In a larger site the servers announce their /32 to a rack switch, and the border routers aggregate those into the covering /24 that they announce to upstream transit providers and to peers at internet exchanges. Every site does the same.

**4. The Internet picks.** A remote network now hears about 192.0.2.0/24 from several directions, one per site. Its routers apply their BGP policy, choose one route, and forward packets that way. Users in different places end up at different sites without any client doing anything.

**5. Withdraw when unhealthy.** A small health checker watches the local service. If it fails, the daemon withdraws the route, the announcement vanishes from that site, and traffic drifts to the next-best one. Here is a sketch of that loop as an ExaBGP helper process:

```python
import socket, time

PREFIX = '192.0.2.53/32'
announced = False

def healthy():
    try:
        socket.create_connection(('127.0.0.1', 443), timeout=1).close()
        return True
    except OSError:
        return False

while True:
    ok = healthy()
    if ok and not announced:
        print(f'announce route {PREFIX} next-hop self', flush=True)
        announced = True
    elif not ok and announced:
        print(f'withdraw route {PREFIX} next-hop self', flush=True)
        announced = False
    time.sleep(2)
```

That is a sketch, not production code. Real deployments add damping so a flapping service doesn’t flap the global routing table, and limits on how many withdrawals may happen at once. We’ll see why that second part matters.

### How the Internet decides what’s “nearest”

Here is the sentence that explains most anycast headaches: **BGP is a policy system, not a latency measurement.** When a router has several routes to the same prefix, it compares them in a fixed order. The first and most powerful step is local preference, a value each operator sets according to business relationships, typically preferring routes learned from paying customers over free peers over paid transit providers, because that is what saves money. Only after that does it look at things like the length of the AS path, and eventually the cost of reaching the exit point inside its own network.

So “nearest” really means “best according to each network’s own policy, with the fewest networks in between as a tiebreaker.” It is a topology notion, not a geographic one. A user’s ISP may have a cheap peering that reaches your distant site and a pricier route to your local one, and it will happily take the cheap route.

### Inside a site: ECMP and layer-4 load balancers

Once packets arrive at a site, something has to spread them across many servers. The simplest tool is ECMP (equal-cost multipath). The router hashes each packet’s connection identifiers (source and destination address and port, plus protocol) and uses the result to choose among the servers announcing the address, so all packets of one connection land on one machine.

Plain ECMP is crude. Adding or removing a server changes the mapping, and a large share of existing connections get reshuffled onto machines that know nothing about them. It also ignores server capacity, so mixed hardware generations end up unevenly loaded. Cloudflare engineers have described exactly these problems and built a system called Unimog to replace router-based spreading inside their data centers. Google’s Maglev and Meta’s Katran follow a similar pattern: dedicated layer-4 load balancers that combine consistent hashing with connection tracking, so that a change in the server pool disturbs as few flows as possible. The takeaway is that anycast gets traffic to a *site*, and a separate mechanism gets it to a *server*.

### Why DNS is the perfect fit

A DNS query is typically a single UDP packet and a single reply. There is no connection to break, any instance can answer, and a route change mid-exchange is harmless. That is why anycast and DNS go together so naturally, and the root name servers are the showcase. The root zone is served under 13 names, a through m, run by 12 organizations. The number 13 is a leftover from the original 512-byte limit on UDP DNS responses, which constrained how many server addresses fit in one reply. Behind those 13 names sit roughly two thousand anycast instances worldwide, according to the live count at root-servers.org in 2026. The shift paid off in a very practical way: in the 2007 attack on the root servers, the two letters that were noticeably hurt were precisely the two that had not yet deployed anycast.

## Where anycast hurts

Anycast is elegant on a whiteboard and unforgiving in production. The difficulties cluster in a few places.

### “Nearest” often isn’t

Research on root DNS deployments has found that anycast can send clients to sites much farther away than the closest available one, in some cases thousands of kilometers farther, because BGP has no way to tell which of several equally preferred routes is better for latency. A well-known 2018 SIGCOMM study by Li and colleagues traced much of this inflation to routers choosing arbitrarily among such routes, and proposed adding geographic hints to BGP announcements to fix it. It also observed that adding replicas can make average performance worse instead of better. A 2025 study added another wrinkle: remote peering, where a network reaches an internet exchange through a reseller from far away, can make a distant network look adjacent in the AS path and pull traffic to the wrong site.

The practical response is mostly peering and measurement work, not coding. Operators peer widely and locally at every site, steer with BGP communities and AS-path prepending, withhold announcements from specific peers, split the service into regional prefixes, and monitor catchments continuously with RIPE Atlas probes and tools such as Verfploeter. Research systems like AnyOpt go further and try to predict which subset of sites gives the best latency before anything is announced.

### Load doesn’t follow capacity

Your catchments are decided by other people’s routing, not by your capacity plan. A site in a well-connected city may attract far more traffic than the one next door, and you can’t tell BGP to send twenty percent here. The levers that exist (prepending, selective announcements, communities your upstreams honor) are blunt and slow, and they can have surprising side effects, because changing one site’s announcement reshuffles which routes everyone else sees.

### Stateful protocols and path changes

RFC 7094, the IETF’s architectural look at anycast, is direct about this. Transport protocols like TCP know nothing about anycast, so when routing shifts during a connection they can fail unpredictably, and a setup that works perfectly in a lab can misbehave on the real Internet. The scenario is easy to picture. A user opens a TCP connection and lands at the Frankfurt site. Mid-connection, a routing change sends the next packets to Amsterdam. Amsterdam has never seen this connection, so it answers with a reset, and the connection dies.

In practice this is rarer than it sounds. For a given user, the path to an anycast prefix is usually stable for long stretches, and most web requests finish in seconds. Plenty of TCP rides on anycast today, from the root servers to major CDNs. The risk is concentrated in long-lived flows such as large downloads, WebSockets, database sessions and video streams, and it can show up in odd ways. A famous example surfaced on the NANOG mailing list in 2019. Connections to Cloudflare-hosted sites were being reset for users behind one network. A router there included the ECN bits, part of the IP header’s TOS byte, in its ECMP hash. The initial SYN carries no ECN marking but later packets do, so the hash changed mid-connection, the packets took another path to another anycast site, and that site replied with a reset. The cure was to leave those bits out of the hash. A 2025 write-up by Toke Høiland-Jørgensen showed that similar bugs were still turning up on some router platforms.

The usual mitigations are worth knowing:

- Keep flows short, terminate TCP and TLS at the edge, and reuse long-lived connections from edge to origin over a private backbone.
- Use consistent-hashing load balancers inside each site.
- Make sure every ECMP hash along the path uses the connection 5-tuple and nothing else.
- Consider QUIC. Its connection IDs give load balancers something steadier than the 5-tuple to route on, and a client can recover from a lost connection with one fresh handshake, although a mid-flow switch of sites still isn’t invisible.
- Or adopt the pattern **anycast to discover, unicast to stay**: the anycast address handles first contact, then the service hands back a site-specific unicast address for the long session.

### Failover is slower than people assume, and riskier

Withdrawing a route is not instant. The withdrawal has to propagate across many networks, each of which processes it on its own schedule. Figures in the range of 30 to 90 seconds are commonly quoted, and individual cases run longer. Techniques like BFD detect dead links and sessions faster, but they can’t speed up the rest of the world.

The riskier half is that your own health logic can take you down. On October 4, 2021, Facebook, Instagram and WhatsApp vanished from the Internet for around six hours. Facebook’s own post-mortem explains that a maintenance operation disconnected its backbone network. Its DNS servers were built to withdraw their BGP announcements whenever they could not reach the company’s data centers, which they treated as a sign of an unhealthy site. With the entire backbone gone, every DNS site decided it was unhealthy and withdrew at once. The servers themselves were running fine, but no one on the Internet could find them.

The lesson generalizes. A health check that removes capacity needs a sanity check at the global level: if every site wants to withdraw, the check is probably what is broken. Network engineers discussing the incident afterwards suggested de-preferring a failing site’s routes instead of pulling them entirely, so that it still attracts traffic when nothing better remains.

### DDoS: a double-edged sword

Anycast is a natural defense because attack traffic splits across sites according to where the attacking machines are, so no single location absorbs everything. But capacity is still finite per site, and an attack concentrated in one catchment can saturate it. Operators respond by shifting routes, withdrawing or de-prioritizing the overwhelmed site so its traffic flows to bigger neighbors, which means deliberately sacrificing some users to protect the rest. Even the root server operators’ own FAQ concedes that an attack like the 2016 assault on Dyn could, at least in theory, hit all instances. Anycast raises the bar. It doesn’t remove the risk.

### You become a network operator

Running your own anycast means being, in practice, an Internet operator. You need an AS number, address space (IPv4 blocks cost real money), transit or peering at every site, and people who can run BGP. You should publish RPKI route origin authorizations so other networks can reject forged announcements of your prefixes, keep your routing registry records accurate, and watch for hijacks and leaks, because anyone who announces your prefix with better attributes can steal your traffic.

For most teams the sensible move is to rent anycast. Cloudflare and Fastly sell it as their core product, AWS Global Accelerator provides static anycast IP addresses in front of your regional endpoints, and Google Cloud’s global external load balancers expose a single anycast address.

### Debugging gets strange

Same address, many machines. A traceroute from your laptop and one from a colleague in another city end at different servers, and return paths may differ from outbound ones. “Which site answered me?” becomes the first question in any incident, so build a way to answer it. Many anycast DNS servers can report their identity through NSID or CHAOS-class queries, and most CDNs expose a trace endpoint (see the toolbox below). Geolocation of the address itself becomes meaningless too: no IP geolocation database can pin an anycast address to one place, which surprises people who geolocate server IPs.

## Side by side

| Dimension | Unicast (explicit choice) | GeoDNS | Anycast |
| --- | --- | --- | --- |
| Where the choice is made | By the client or your own code | By the authoritative DNS server, at lookup time | By routers, while packets are forwarded |
| What drives it | Your explicit mapping | GeoIP data, latency maps, health, weights | BGP policy and topology |
| Granularity | Whatever you define | Per resolver (or per client subnet with ECS), per TTL | Per network path |
| Failover | Manual or none | Bounded by TTL and stale caches | BGP convergence, typically tens of seconds to minutes |
| Long-lived connections | Stable | Stable once resolved | Can break on a path change unless engineered for |
| Control over who goes where | Total | High and explicit, good for compliance | Indirect, through BGP knobs |
| DDoS posture | Concentrated | Concentrated on the chosen endpoints | Spread by catchment, limited by per-site capacity |
| What you need | An IP address | A DNS provider with geo or latency features | Your own AS, prefix and peering, or a managed provider |
| Typical use | Small or regional services, internal systems | Multi-region apps, localized content, compliance | DNS, CDNs, DDoS mitigation, global edges |

Treat the failover row as a description of the typical mechanism, not a guarantee. Both approaches can be much slower in bad cases, and both can be tuned.

## Putting them together

Most large systems layer these techniques instead of choosing one. A common shape looks like this:

```
1. Name lookup     api.example.com --> GeoDNS or latency policy --> picks a region
                   (the authoritative servers are themselves anycast)

2. Getting in      Client --> regional or anycast edge address --> nearby edge site

3. Inside a site   Router (ECMP) --> L4 load balancer (consistent hashing)
                       --> L7 proxies --> application servers

4. Back to origin  Edge --> private backbone or regional origin
```

Each layer covers a weakness of the one above it. Anycast makes the DNS layer fast and hard to knock over. DNS-level steering gives you explicit, auditable control over which region serves whom. Layer-4 balancing keeps connections pinned to the right server inside a site, and the proxy tier shortens the long haul by terminating connections near the user.

A popular variation is **regional anycast**. Instead of one global prefix, you announce a separate prefix per region, only from the sites in that region, and use GeoDNS to hand each user the address of their region’s prefix. Within a region you keep anycast’s quick failover and attack dispersion. Across regions you get explicit control back, which helps with path inflation and with data-residency rules. Research on large anycast deployments describes this kind of partitioning as a way to limit BGP-induced detours.

## Choosing: a practical guide

**A startup with an API in two cloud regions.** Start with DNS. Latency-based or geolocation routing with health checks and a modest TTL is cheap, well understood and good enough for most products. If customers need a fixed set of IP addresses to allowlist, or you want failover faster than DNS caching allows, put a managed anycast front door in front of the regions.

**Compliance or content localization.** Use geolocation routing, because the rules are explicit and auditable. Anycast alone can’t promise that packets from one country stay in that country, since the Internet may carry them to whichever site it prefers.

**DNS, NTP and other short UDP exchanges.** Anycast is the natural fit. There is no connection state to protect and the benefits are immediate.

**Long-lived stateful traffic such as game servers, WebSockets or database connections.** Prefer stable per-site unicast addresses chosen through DNS or an application-level handshake, or put an anycast edge in front that terminates connections and proxies to the origin over its own backbone.

**A CDN, a DDoS mitigation service or a global edge.** Anycast, with serious investment in peering, layer-4 load balancing and per-site capacity management. Unless that is your business, rent it.

## Saying it well in a design review

When a system-design discussion drifts into global traffic management, a few habits keep you on solid ground. Start from requirements, not mechanisms: how much latency can you tolerate, how quickly must you recover from losing a region, are the connections long-lived, and are there residency rules? Name the layer where each mechanism acts: DNS answers decide before a connection exists, while routing decides per packet. State each failure mode honestly. GeoDNS fails slowly because of caches, and sometimes misjudges where the user is. Anycast fails over faster but can break stateful flows and will occasionally send people somewhere surprising. Finally, say what you would measure: per-site load, p95 latency by client network, the share of users landing in the wrong catchment, and how long it takes to drain a site. Showing that you know how the thing fails is usually worth more than naming the technology.

## Common misconceptions

**“Anycast sends you to the geographically nearest server.”** It sends you where BGP policy prefers. That is usually nearby and occasionally not even close.

**“Anycast doesn’t work with TCP.”** It does, and large parts of the Internet depend on it. It just needs care around long-lived flows and load balancing.

**“GeoDNS and anycast are competing options.”** They act at different layers and are routinely used together.

**“A 30-second TTL means 30-second failover.”** It means 30 seconds plus every cache and client that holds on longer.

**“There are 13 root servers.”** There are 13 root server names. Behind them sit roughly two thousand instances.

## Poking at it yourself

```
# Which Cloudflare site am I reaching? Look for the colo= field.
curl -s https://www.cloudflare.com/cdn-cgi/trace

# Ask a DNS server to identify the instance that answered (many support this)
dig +nsid example.com @<nameserver>
dig @k.root-servers.net hostname.bind chaos txt

# See how a GeoDNS zone answers for different client networks:
# query the authoritative server directly and fake a client subnet
dig +subnet=203.0.113.0/24 api.example.com @<authoritative-ns>
dig +subnet=198.51.100.0/24 api.example.com @<authoritative-ns>

# Where does my path to an anycast address actually go?
mtr -rw <anycast-ip>
```

On the routing side, public looking glasses and services such as RIPEstat and bgp.he.net show who announces a prefix and from where. RIPE Atlas lets you run measurements from probes around the world, which is the fastest way to see your catchments from the outside.

## Key takeaways

- **Unicast** is the baseline: one address, one machine. Everything else is built on it.
- **GeoDNS** decides at name-resolution time. Its accuracy is limited by what the authoritative server can see (the resolver, or a client subnet with ECS), by the quality of GeoIP data, and by caching.
- **Anycast** decides in the routers. One address is announced from many sites with BGP, health checks withdraw broken sites, and the Internet’s routing policy picks the destination. It is superb for DNS and edges, and it demands care with long-lived connections.
- **“Nearest” in BGP means “best by policy.”** Measure real catchments and latency instead of trusting the map.
- **Anything that automatically withdraws capacity needs a guardrail.** Facebook’s 2021 outage is the cautionary tale.
- **Layer them.** GeoDNS for explicit control, anycast for resilient entry points, layer-4 balancing inside each site, and rent the anycast unless running a network is your business.

## Sources and further reading

Instance counts and vendor features change, so check the live sources.

- RFC 4786, Operation of Anycast Services: https://www.rfc-editor.org/rfc/rfc4786
- RFC 7094, Architectural Considerations of IP Anycast: https://www.rfc-editor.org/rfc/rfc7094
- RFC 7871, Client Subnet in DNS Queries: https://www.rfc-editor.org/rfc/rfc7871
- Meta Engineering, More details about the Oct. 4 outage: https://engineering.fb.com/2021/10/05/networking-traffic/outage/
- Cloudflare 1.1.1.1 documentation, including its answer on EDNS Client Subnet: https://developers.cloudflare.com/1.1.1.1/nitty-gritty-details/
- Li, Levin, Spring and Bhattacharjee, Internet Anycast: Performance, Problems, and Potential (SIGCOMM 2018): https://www.cs.umd.edu/\~dml/papers/anycast\_sigcomm18.pdf
- Root Server System Advisory Committee FAQ: https://www.icann.org/groups/rssac/faq
- Live root server instance counts: https://root-servers.org/
- NANOG thread on TCP and anycast (November 2019): https://mailman.nanog.org/pipermail/nanog/2019-November/104132.html
- Amazon Route 53 routing policy documentation: https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/routing-policy.html
