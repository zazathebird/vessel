# DNSSEC — the Namespro ticket

The last step of `docs/SECURITY-AUDIT.md` §7. Cloudflare's half is done and the zone is signed;
the DS record is not published at the registrar, so DNSSEC is currently **inert**. Namespro exposes
no DS field anywhere in their control panel (checked exhaustively while signed in — *Edit domain
settings* and all five *Useful Tools*), so the remaining step is a support ticket, not a form.

**Everything below was re-derived from the live zone on 2026-08-16**, not transcribed from the
dashboard and not copied forward from the earlier audit. See *How the DS was verified*.

---

## First: is DNSSEC actually required?

**No. It is not required, and nothing is broken without it.** It is worth doing anyway, for one
specific reason, and there is one condition attached. The honest version:

**What it genuinely buys.** The real gain is not "stops people spoofing the website" — TLS already
does that, and HSTS is set. The gain is that it closes **certificate mis-issuance via DNS**. An
attacker able to spoof DNS answers for `mcclevarty.ca` — a compromised or on-path resolver, a BGP
hijack aimed at a CA's validation vantage point — can pass a certificate authority's domain-control
check (DNS-01 or HTTP-01) and be handed a *genuine, publicly trusted* certificate for the domain.
Against that:

- **CAA does not help.** It restricts *which* CA may issue, and the attacker simply uses one of the
  five already listed.
- **HSTS does not help.** The certificate is real, so there is no downgrade to refuse.
- **DNSSEC does help**, and is essentially the only thing in this list that does.

For a site whose accounts derive key material from parameters fetched over the network, that is a
defensible thing to close. It is also a fairly capable attacker, and Let's Encrypt's multi-perspective
validation already blunts it — which is why this is "worth doing", not "urgent".

**What it costs.** The risk is concentrated in two moments, and both are manageable:

1. **Publishing a wrong DS takes the entire domain down** for every validating resolver — not the
   website, the *domain*, mail included. Google Public DNS and Cloudflare's own resolver both
   validate, so this is a large share of the internet, and the fix has to propagate through CIRA.
   Mitigated by verifying immediately after (below) and keeping the rollback in reach.
2. **If the domain ever leaves Cloudflare, the DS must be removed *first*** — and removing it means
   another support ticket with another turnaround. Moving nameservers with a live DS pointing at
   Cloudflare's keys takes the domain dark. This is the ongoing footgun and it is worth knowing
   before saying yes, not after.

There is **no key-rollover maintenance**, which is the usual reason people regret enabling DNSSEC.
Cloudflare uses one shared, static KSK across all its zones — key tag 2371, verified today against
`cloudflare.com` and `ietf.org`, which both show the same tag — so this DS does not expire or rotate.

**Recommendation: yes, send it.** But one thing on this domain matters more than DNSSEC does, and it
is in the audit already: **auto-renew is disabled on `mcclevarty.ca`** (expiry 2027-Aug-09). Every
protection in the audit is worth nothing the day the domain lapses. If only one thing gets done in
the Namespro account, make it that one.

---

## The ticket

Namespro's support form, from the signed-in account. Subject and body are ready to paste.

**Subject**

```
Publish DNSSEC DS record to CIRA for mcclevarty.ca
```

**Body**

```
Hello,

I would like to enable DNSSEC on mcclevarty.ca.

The zone is hosted at Cloudflare and is already signed — DNSKEY records are
published and live. The only remaining step is publishing the DS record to
CIRA, and I cannot find anywhere in the Namespro control panel to do that
myself. Could you please add the following DS record for the domain?

  Domain:       mcclevarty.ca
  Key Tag:      2371
  Algorithm:    13   (ECDSA Curve P-256 with SHA-256)
  Digest Type:  2    (SHA-256)
  Digest:       3FAAEC048F49192EF2108527E35C474900FCAC628B9F0F6D764C10ABAA6F640E

In standard presentation format that is:

  mcclevarty.ca.  IN  DS  2371 13 2 3FAAEC048F49192EF2108527E35C474900FCAC628B9F0F6D764C10ABAA6F640E

This digest was generated from the zone's live DNSKEY record, and matches the
value Cloudflare shows in its own DNSSEC panel.

Please let me know once it has been submitted to CIRA, and if you need
anything else from me.

Thank you,
Patrick McClevarty
```

If they ask for the DNSKEY instead of the DS — some registrars submit the key and compute the digest
themselves — this is the zone's key-signing key, verbatim from the live zone:

```
mcclevarty.ca. IN DNSKEY 257 3 13 mdsswUyr3DPW132mOi8V9xESWE8jTo0dxCjjnopKl+GqJxpVXckHAeF+KkxLbxILfDLUT0rAK9iUzy1L53eKGQ==
```

If they insist on a SHA-384 digest (digest type 4) rather than SHA-256, it is
`0D4FB0791E1D1109CC5769E287083E17BA3C5509BCD7266E084B7BA00BA712786F2339BA15FE26623C64B0200A1494ED`.
**Send one or the other, not both** — SHA-256 is the right default and is what Cloudflare displays.

---

## Verify the moment they confirm

Do not take the confirmation email's word for it. Run these; the whole risk of this change lives in
the gap between "they said done" and "it is correct".

```sh
# 1. The DS is published at the parent, and matches exactly.
dig +short mcclevarty.ca DS
#    expect: 2371 13 2 3FAAEC048F49192EF2108527E35C474900FCAC628B9F0F6D764C10ABAA6F640E

# 2. The chain of trust actually validates end to end.
delv @1.1.1.1 mcclevarty.ca A
#    expect: "; fully validated"   (today it says "; unsigned answer")

# 3. The site still serves.
curl -sS -o /dev/null -w '%{http_code}\n' https://mcclevarty.ca/
```

Step 2 is the one that matters. `delv` says **`; unsigned answer`** today — that is the correct
reading of the current inert state, and it must become **`; fully validated`**. If instead it reports
a *bogus* answer or a validation failure, the DS is wrong: roll back immediately rather than waiting
to see if it settles, because a validation failure is already taking the domain down for a share of
users while you read it.

Worth also checking from outside your own machine — `dnsviz.net/d/mcclevarty.ca/analyze` draws the
full chain and names the broken link if there is one.

## Rollback, if it goes wrong

Two independent halves, either of which restores service:

1. **At Namespro** — reply to the same ticket asking them to remove the DS record. Correct but slow;
   it is a human and a registry.
2. **At Cloudflare** — *DNS → Settings → DNSSEC → Cancel Setup*. Immediate and in your own hands.
   This unsigns the zone. Note the ordering trap: with a DS still published at CIRA, an unsigned zone
   is *also* a validation failure. Cancelling at Cloudflare is the right first move only if the DS is
   wrong in a way that makes the zone unresolvable either way — otherwise get the DS removed first.

The safe sequencing, and the reason to do this on a day you can watch it: **publish, verify within
minutes, and keep the Cloudflare tab open** until step 2 above says `fully validated`.

---

## How the DS was verified

The DS in this document was **derived from the live DNSKEY**, not read off a dashboard — dashboard
fields truncate, and a truncated digest is the exact failure that takes a domain down.

The derivation script was validated first against three zones that already publish a DS
(`cloudflare.com`, `ietf.org`, and `cira.ca` — a `.ca` under the same registry), reproducing all
three published digests byte for byte. Applied to `mcclevarty.ca` it produces key tag **2371**,
algorithm **13**, digest type **2**, digest
`3FAAEC048F49192EF2108527E35C474900FCAC628B9F0F6D764C10ABAA6F640E` — which agrees with both the
figure recorded in `docs/SECURITY-AUDIT.md` §7 on 2026-08-14 and Cloudflare's own displayed digest.

Three independent sources agreeing is the standard this change deserves, given that being wrong
takes the domain off the internet.

**Live state at the time of writing (2026-08-16):**

| | |
|---|---|
| Nameservers | `ignat.ns.cloudflare.com`, `brenna.ns.cloudflare.com` |
| DNSKEY | published — KSK (257) tag 2371 alg 13, ZSK (256) alg 13 |
| Records signed | yes — `A` carries a valid RRSIG |
| DS at CIRA | **none** |
| `delv` verdict | `; unsigned answer` — signed but unanchored, i.e. inert and harmless |
